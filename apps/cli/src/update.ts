import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";

import { showBanner } from "./banner.ts";
import { composeCmd, pinImageFromRelease, stopOtherIngress } from "./compose.ts";
import { readEnvFile } from "./env-file.ts";
import { requireInstalledLayout, resolveInstallRoot } from "./resolve-root.ts";
import { installLaunchers } from "./launchers.ts";
import { formatBinaryNextSteps, persistCliBinary } from "./self-bin.ts";
import { maybeSyncBundle } from "./sync.ts";
import { profileOk } from "./validate.ts";

export type UpdateOptions = {
  readonly dir: string | undefined;
  readonly dryRun: boolean;
};

export async function runUpdate(options: UpdateOptions): Promise<void> {
  await showBanner(false);
  p.intro(pc.bold("OneSelf 更新"));

  const root = await resolveInstallRoot(options.dir);
  p.log.step(`${pc.bold("安装路径")}  ${pc.cyan(root)}`);
  await requireInstalledLayout(root);

  // When launched by a newer Release installer (bootstrap exports
  // ONESELF_BUNDLED_REF) or with a user-forced ONESELF_REF, re-extract the compose bundle first. Never downgrades unless
  // ONESELF_REF is set explicitly. Running bin/oneself directly has no bundled
  // tag, so it only refreshes the pinned image.
  await maybeSyncBundle(root, options.dryRun);

  await pinImageFromRelease(root, options.dryRun, (msg) => {
    p.log.info(msg);
  });

  const env = await readEnvFile(path.join(root, ".env"));
  const profile = env.get("COMPOSE_PROFILES") ?? "";
  if (!profileOk(profile)) {
    throw new Error("COMPOSE_PROFILES 必须恰好是一个入口");
  }

  await stopOtherIngress(
    root,
    profile,
    options.dryRun,
    (msg) => {
      p.log.warn(msg);
    },
    (msg) => {
      p.log.info(msg);
    },
  );

  if (options.dryRun) {
    p.outro(pc.dim(`dry-run：会在 ${root} 执行 docker compose pull && up -d`));
    return;
  }

  p.log.step("拉取镜像并重启…");
  const pull = await composeCmd(root, profile, ["--env-file", ".env", "pull"], true);
  if (pull.code !== 0) throw new Error("docker compose pull 失败");
  const up = await composeCmd(root, profile, ["--env-file", ".env", "up", "-d"], true);
  if (up.code !== 0) throw new Error("docker compose up 失败");

  const binary = await persistCliBinary(root);
  // Replaces full-shell launchers left by older releases with the thin ones.
  await installLaunchers(root);
  p.outro(
    [
      "已按当前 .env 的镜像更新。换版本请重新跑对应 Release 的安装命令（或用它带 update 子命令）；只改安装文件与镜像标签，不覆盖口令。",
      ...formatBinaryNextSteps(binary),
    ].join("\n"),
  );
}
