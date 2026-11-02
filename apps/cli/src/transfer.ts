import { access, constants as fsConstants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import pc from "picocolors";

import { showBanner } from "./banner.ts";
import { runInherit } from "./compose.ts";
import { requireInstalledLayout, resolveInstallRoot } from "./resolve-root.ts";

type TransferKind = "backup" | "restore";

export type TransferOptions = {
  readonly dir: string | undefined;
  readonly dryRun: boolean;
  readonly kind: TransferKind;
  readonly passthrough: readonly string[];
};

async function exists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findTransferCli(installRoot: string): Promise<string | undefined> {
  const candidates = [path.join(installRoot, "scripts/transfer-cli.ts")];
  try {
    const monorepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    candidates.push(path.join(monorepo, "scripts/transfer-cli.ts"));
  } catch {
    /* compiled binary may lack import.meta.url path */
  }
  if (process.env.ONESELF_REPO_ROOT) {
    candidates.push(path.join(process.env.ONESELF_REPO_ROOT, "scripts/transfer-cli.ts"));
  }
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

export async function runTransfer(options: TransferOptions): Promise<void> {
  await showBanner(false);
  process.stdout.write("\n");
  const title = options.kind === "backup" ? "备份（导出）" : "恢复（导入）";
  p.intro(pc.bold(`OneSelf ${title}`));

  const root = await resolveInstallRoot(options.dir);
  p.log.step(`${pc.bold("安装路径")}  ${pc.cyan(root)}`);
  await requireInstalledLayout(root);

  const script = await findTransferCli(root);
  if (!script) {
    throw new Error(
      "生产安装包不含备份程序。请在检出的仓库里运行 pnpm data:export / data:import，或设置 ONESELF_REPO_ROOT 指向仓库根目录。",
    );
  }

  const transferCmd = options.kind === "backup" ? "export" : "import";
  const args = [
    "--env-file",
    path.join(root, ".env"),
    "--experimental-strip-types",
    script,
    transferCmd,
    ...options.passthrough,
  ];

  if (options.dryRun) {
    p.outro(
      pc.dim(
        `dry-run：会运行 node ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`,
      ),
    );
    return;
  }

  p.log.step(`转调 ${path.relative(root, script) || script}`);
  const code = await runInherit("node", args, root);
  if (code !== 0) throw new Error(`${options.kind} 失败（退出码 ${code}）`);
  p.outro("完成");
}
