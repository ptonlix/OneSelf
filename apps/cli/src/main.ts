#!/usr/bin/env node
import * as p from "@clack/prompts";
import pc from "picocolors";

import { runDoctor } from "./doctor.ts";
import { runInstall } from "./install.ts";
import { defaultInstallDir } from "./platform.ts";
import { runTransfer } from "./transfer.ts";
import { runUpdate } from "./update.ts";

function printHelp(): void {
  process.stdout.write(`oneself — OneSelf 安装与运维 CLI

用法:
  oneself install [--dir <路径>] [--dry-run] [--yes]
  oneself update  [--dir <路径>] [--dry-run]
  oneself doctor  [--dir <路径>]
  oneself backup  [--dir <路径>] [--dry-run] --out <file> [--stopped] […]
  oneself restore [--dir <路径>] [--dry-run] --from <file.tar.gz> [--stopped] [--replace] […]
  公开 curl|sh / irm|iex 只下载并校验本二进制再交给它（Unix 把已打开的终端描述符复制到 stdin，不新开 /dev/tty）。
  安装目录里的 oneself.sh / oneself.ps1 只是转调 bin/oneself 的薄 launcher。

  install   交互式配置并启动
  update    有新版本就升级并重启，没有就重新拉取当前镜像
  doctor    只检查，不改配置，不重启
  backup    用安装目录的 compose.yaml 导出 format 1 档案
  restore   用安装目录的 compose.yaml 导入 format 1 档案
  help      显示帮助

说明:
  安装路径默认 ${defaultInstallDir()}
  backup / restore 不需要检出仓库、宿主机 Node、宿主机 pg_dump 或 ONESELF_REPO_ROOT。
  非交互必须传入 --stopped，且不会自行停止服务。交互式可在确认后只停止 app。
`);
}

type Parsed = {
  command: string;
  dir: string | undefined;
  dryRun: boolean;
  yes: boolean;
  passthrough: string[];
};

function parseArgs(argv: readonly string[]): Parsed {
  let command = "help";
  let dir: string | undefined;
  let dryRun = false;
  let yes = process.env.ONESELF_YES === "1";
  const passthrough: string[] = [];
  const args = [...argv];
  while (args[0] === "--") args.shift();
  if (args.length === 0) return { command, dir, dryRun, yes, passthrough };
  command = args.shift() ?? "help";

  while (args.length > 0) {
    const item = args.shift();
    if (item === undefined) break;
    if (item === "--") {
      passthrough.push(...args);
      break;
    }
    if (item === "--dry-run") dryRun = true;
    else if (item === "--yes" || item === "-y") yes = true;
    else if (item === "--dir") {
      dir = args.shift();
      if (!dir) throw new Error("--dir 需要路径");
    } else if (item.startsWith("--dir=")) dir = item.slice("--dir=".length);
    else if (command === "backup" || command === "restore") {
      // transfer flags may appear without a bare "--"
      passthrough.push(item, ...args);
      break;
    } else if (!item.startsWith("-") && !dir) dir = item;
    else throw new Error(`无法识别参数: ${item}`);
  }
  return { command, dir, dryRun, yes, passthrough };
}

async function main(): Promise<void> {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
      printHelp();
      return;
    }
    if (parsed.command === "install") {
      const dir = parsed.dir ?? process.env.ONESELF_DIR ?? defaultInstallDir();
      await runInstall({ dir, dryRun: parsed.dryRun, yes: parsed.yes });
      return;
    }
    if (parsed.command === "update") {
      await runUpdate({ dir: parsed.dir, dryRun: parsed.dryRun });
      return;
    }
    if (parsed.command === "doctor") {
      const code = await runDoctor({ dir: parsed.dir });
      process.exitCode = code;
      return;
    }
    if (parsed.command === "backup" || parsed.command === "restore") {
      await runTransfer({
        dir: parsed.dir,
        dryRun: parsed.dryRun,
        kind: parsed.command,
        passthrough: parsed.passthrough,
      });
      return;
    }
    throw new Error(`未知命令: ${parsed.command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(pc.red(message));
    process.exit(1);
  }
}

await main();
