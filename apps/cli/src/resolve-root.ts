import { access, constants as fsConstants } from "node:fs/promises";
import path from "node:path";

import { defaultInstallDir } from "./platform.ts";

async function exists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Prefer --dir / ONESELF_DIR; else installed layout next to cwd; else default. */
export async function resolveInstallRoot(explicit: string | undefined): Promise<string> {
  if (explicit) return path.resolve(explicit);
  if (process.env.ONESELF_DIR) return path.resolve(process.env.ONESELF_DIR);

  const cwd = process.cwd();
  if (
    (await exists(path.join(cwd, "compose.yaml"))) &&
    (await exists(path.join(cwd, "deploy/Caddyfile")))
  ) {
    return cwd;
  }
  return path.resolve(defaultInstallDir());
}

export async function requireInstalledLayout(root: string): Promise<void> {
  if (!(await exists(path.join(root, "compose.yaml")))) {
    throw new Error(`找不到 compose.yaml。先 install，或用 --dir 指向已安装目录：${root}`);
  }
  if (!(await exists(path.join(root, ".env")))) {
    throw new Error(`没有 .env。先运行安装：${root}`);
  }
}
