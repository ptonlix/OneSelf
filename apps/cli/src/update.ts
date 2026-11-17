import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import * as p from "@clack/prompts";
import pc from "picocolors";

import { showBanner } from "./banner.ts";
import { composeCmd, pinImageFromRelease, stopOtherIngress } from "./compose.ts";
import { readEnvFile } from "./env-file.ts";
import { requireInstalledLayout, resolveInstallRoot } from "./resolve-root.ts";
import { installLaunchers } from "./launchers.ts";
import { persistCliBinary } from "./self-bin.ts";
import { formatUpdateSummary, oneselfSkillDigest, skillChanged } from "./summary.ts";
import { maybeSyncBundle } from "./sync.ts";
import { INGRESS_PROFILES, profileOk } from "./validate.ts";

export type UpdateOptions = {
  readonly dir: string | undefined;
  readonly dryRun: boolean;
};

// up -d returns before the app listens, and a refused connection fails immediately.
export const SKILL_AFTER_ATTEMPTS = 5;
export const SKILL_AFTER_DELAY_MS = 600;
export const SKILL_AFTER_TIMEOUT_MS = 2_000;

/** Drop one trailing slash so PUBLIC_ORIGIN matches the published origin. Nothing else is rewritten. */
export function stripOneTrailingSlash(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

/** Retry a post-restart index read. Never throws; a miss omits the skill notice. */
export async function readDigestUntilReady(
  read: () => Promise<string | null>,
  options: {
    readonly attempts: number;
    readonly delayMs: number;
    readonly sleep: (ms: number) => Promise<void>;
  },
): Promise<string | null> {
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    let digest: string | null = null;
    try {
      digest = await read();
    } catch {
      digest = null;
    }
    if (digest !== null) return digest;
    if (attempt + 1 < options.attempts) {
      try {
        await options.sleep(options.delayMs);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function runUpdate(options: UpdateOptions): Promise<void> {
  await showBanner(false);
  process.stdout.write("\n");
  p.intro(pc.bold("OneSelf 更新"));

  const root = await resolveInstallRoot(options.dir);
  p.log.step(`${pc.bold("安装路径")}  ${pc.cyan(root)}`);
  await requireInstalledLayout(root);

  // Direct update passes followLatest; install must not.
  const synced = await maybeSyncBundle(root, options.dryRun, true);

  await pinImageFromRelease(root, options.dryRun, (msg) => {
    p.log.info(msg);
  });

  const env = await readEnvFile(path.join(root, ".env"));
  const origin = stripOneTrailingSlash(env.get("PUBLIC_ORIGIN") ?? "");
  const skillBefore = options.dryRun ? null : await readSkillDigest(origin);
  const profile = env.get("COMPOSE_PROFILES") ?? "";
  if (!profileOk(profile)) {
    throw new Error(
      `COMPOSE_PROFILES 必须恰好是一个入口：${INGRESS_PROFILES.join("、")}（重新运行 install 可选择）`,
    );
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
  const skillAfter = await readSkillDigestAfterUp(origin);
  const skillOrigin = skillChanged(skillBefore, skillAfter) ? origin : undefined;
  p.outro(formatUpdateSummary(root, binary, process.platform, synced.checkedLatest, skillOrigin));
}

async function readSkillDigest(origin: string, timeoutMs = 8_000): Promise<string | null> {
  if (!origin.startsWith("http://") && !origin.startsWith("https://")) return null;
  try {
    const response = await fetch(`${origin}/.well-known/agent-skills/index.json`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return oneselfSkillDigest(await response.text());
  } catch {
    return null;
  }
}

async function readSkillDigestAfterUp(origin: string): Promise<string | null> {
  if (!origin.startsWith("http://") && !origin.startsWith("https://")) return null;
  return readDigestUntilReady(() => readSkillDigest(origin, SKILL_AFTER_TIMEOUT_MS), {
    attempts: SKILL_AFTER_ATTEMPTS,
    delayMs: SKILL_AFTER_DELAY_MS,
    sleep: delay,
  });
}
