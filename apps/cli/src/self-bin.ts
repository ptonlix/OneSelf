import {
  copyFile,
  mkdir,
  chmod,
  access,
  realpath,
  rename,
  rm,
  constants as fsConstants,
} from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

/** True when both paths resolve to the same file (copying a running binary onto itself would truncate it). */
async function samePath(a: string, b: string): Promise<boolean> {
  try {
    return (await realpath(a)) === (await realpath(b));
  } catch {
    return false;
  }
}

/**
 * Copy via a temp file + rename so replacing a binary that is currently running
 * (e.g. ~/.local/bin/oneself) works on Linux instead of failing with ETXTBSY.
 */
async function replaceExecutable(source: string, target: string): Promise<void> {
  if (await samePath(source, target)) return;
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    await copyFile(source, tmp);
    if (process.platform !== "win32") await chmod(tmp, 0o755);
    await rename(tmp, target);
  } finally {
    await rm(tmp, { force: true });
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Source of the running CLI binary (compiled or bootstrap-provided). */
function selfBinarySource(): string | undefined {
  if (process.env.ONESELF_SELF_BIN) return process.env.ONESELF_SELF_BIN;
  const base = path.basename(process.execPath).toLowerCase();
  if (
    base === "node" ||
    base === "nodejs" ||
    base === "bun" ||
    base.startsWith("node.") ||
    base === "bun.exe" ||
    base === "node.exe"
  ) {
    return undefined;
  }
  return process.execPath;
}

function installedBinaryPath(root: string): string {
  if (process.platform === "win32") {
    return path.join(root, "bin", "oneself.exe");
  }
  return path.join(root, "bin", "oneself");
}

export type InstallBinaryResult = {
  readonly dest: string;
  readonly linked: string | undefined;
  readonly pathHint: string;
};

/**
 * Copy this CLI into <install>/bin/oneself so update/doctor stay available.
 * Also link into ~/.local/bin when that directory already exists.
 */
export async function persistCliBinary(root: string): Promise<InstallBinaryResult | undefined> {
  const source = selfBinarySource();
  if (!source) return undefined;

  const dest = installedBinaryPath(root);
  await mkdir(path.dirname(dest), { recursive: true });
  // `bin/oneself update` (or the ./oneself.sh launcher) runs this very file;
  // replaceExecutable skips copying a file onto itself.
  await replaceExecutable(source, dest);

  let linked: string | undefined;
  if (process.platform !== "win32") {
    const localBin = path.join(homedir(), ".local", "bin");
    if (await exists(localBin)) {
      const link = path.join(localBin, "oneself");
      try {
        await replaceExecutable(dest, link);
        linked = link;
      } catch {
        /* ignore — PATH hint still covers install/bin */
      }
    }
  }

  const rc = (process.env.SHELL ?? "").endsWith("bash") ? "~/.bashrc" : "~/.zshrc";
  const pathHint =
    process.platform === "win32"
      ? `把 ${path.join(root, "bin")} 加到 PATH，之后可直接运行 oneself（或用完整路径 ${dest}）`
      : `echo 'export PATH="${root}/bin:$PATH"' >> ${rc} && source ${rc}`;

  return { dest, linked, pathHint };
}

export function formatBinaryNextSteps(result: InstallBinaryResult | undefined): string[] {
  if (!result) return [];
  const lines = [`CLI 二进制  ${result.dest}`];
  if (result.linked) {
    lines.push(`已写入      ${result.linked}（若该目录在 PATH 里，可直接打 oneself）`);
  } else {
    lines.push(`加入 PATH   ${result.pathHint}`);
  }
  const exe = process.platform === "win32" ? "oneself.exe" : "oneself";
  lines.push(`之后可用    ${exe} update | doctor | backup | restore`);
  return lines;
}
