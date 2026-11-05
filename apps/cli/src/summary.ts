import path from "node:path";
import pc from "picocolors";

import type { InstallBinaryResult } from "./self-bin.ts";

/** Lines under a section header; outro continuation lines have no gutter, so indent by hand. */
const HEAD = "   ";
const ITEM = "     ";

function section(title: string, items: readonly string[]): string[] {
  if (items.length === 0) return [];
  return ["", `${HEAD}${pc.bold(title)}`, ...items.map((item) => `${ITEM}${item}`)];
}

function cliName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "oneself.exe" : "oneself";
}

/** Platform-correct launcher update command (used when no CLI binary was persisted). */
function updateCommand(root: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") {
    const ps1 = path.win32.join(root, "oneself.ps1");
    return `powershell -ExecutionPolicy Bypass -File "${ps1}" update`;
  }
  return `${path.posix.join(root, "oneself.sh")} update`;
}

/** One-line upgrade hint for the completion summary. */
function upgradeHint(platform: NodeJS.Platform = process.platform): string {
  const replaceBinary =
    platform === "win32"
      ? "更换 CLI 二进制仍需在 PowerShell 重跑 Release 的 irm … | iex"
      : "更换 CLI 二进制仍需重跑 Release 的 curl … | sh";
  return `升级：oneself update 可改 .oneself-release 与 ONESELF_IMAGE；${replaceBinary}，口令保留`;
}

/** Platform-correct update/upgrade hints for the completion summary. */
export function updateHints(root: string, platform: NodeJS.Platform = process.platform): string[] {
  return [`更新  ${updateCommand(root, platform)}`, upgradeHint(platform)];
}

/** "运维" section: how to reach update/doctor/backup/restore afterwards. */
function opsLines(
  binary: InstallBinaryResult | undefined,
  root: string,
  launchers: boolean,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (!binary) {
    return launchers ? [pc.cyan(updateCommand(root, platform))] : [];
  }
  const commands = `${cliName(platform)} update | doctor | backup | restore`;
  if (binary.linked) {
    return [pc.cyan(commands)];
  }
  return [pc.cyan(commands), pc.dim("若提示找不到命令，先加入 PATH："), pc.cyan(binary.pathHint)];
}

export type InstallSummary = {
  readonly origin: string;
  readonly root: string;
  readonly localOnly: boolean;
  readonly launchers: boolean;
  readonly binary: InstallBinaryResult | undefined;
  readonly platform?: NodeJS.Platform;
};

/** Message for the final `p.outro` after a successful install. */
export function formatInstallSummary(summary: InstallSummary): string {
  const platform = summary.platform ?? process.platform;
  const { origin, root, binary } = summary;
  const tips = [
    `安装目录 ${root}`,
    ...(summary.localOnly
      ? ["仅本机 / 局域网可访问；要公网访问，重跑安装改选 Cloudflare / Caddy / Tailscale"]
      : []),
    ...(binary || summary.launchers ? [upgradeHint(platform)] : []),
  ];
  return [
    pc.green(pc.bold("✓ OneSelf 安装成功，服务已在后台运行")),
    ...section("首页", [pc.cyan(origin)]),
    ...section("管理端", [pc.cyan(`${origin}/admin`)]),
    ...section("接入 Agent", [
      pc.cyan(`npx skills add ${origin} -a <agent> -s oneself -y`),
      "Agent 会申请设备码，到 /admin/device 批准。",
      pc.dim("API Key 只给脚本或长期密钥，不是第一步。"),
      pc.dim(`发现地址 ${origin}/.well-known/pcp`),
    ]),
    ...section("运维", opsLines(binary, root, summary.launchers, platform)),
    "",
    ...tips.map((tip) => `${HEAD}${pc.dim(`· ${tip}`)}`),
  ].join("\n");
}

/**
 * Message for the final `p.outro` after `oneself update`.
 * `checkedLatest` is true only when this run resolved latest.
 */
export function formatUpdateSummary(
  root: string,
  binary: InstallBinaryResult | undefined,
  platform: NodeJS.Platform = process.platform,
  checkedLatest = false,
): string {
  const detail = checkedLatest
    ? "不覆盖口令。没有新版本时，只重新拉取当前镜像"
    : "不覆盖口令";
  return [
    pc.green(pc.bold("✓ OneSelf 已更新")),
    `${HEAD}${pc.dim(detail)}`,
    `${HEAD}${pc.dim("· 旧 Release 的安装命令不会把已装版本降回去")}`,
    ...section("运维", opsLines(binary, root, false, platform)),
  ].join("\n");
}
