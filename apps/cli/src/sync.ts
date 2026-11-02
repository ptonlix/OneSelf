import { access, readFile, constants as fsConstants } from "node:fs/promises";
import path from "node:path";
import * as p from "@clack/prompts";

import { fetchComposeBundle, resolveTag } from "./fetch-bundle.ts";
import {
  forcedRef,
  installerBundledRef,
  planAfterResolve,
  planBundleSync,
  refOk,
  type SyncPlan,
} from "./ref.ts";

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isSourceCheckout(root: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    pathExists(path.join(root, "compose.dev.yaml")),
    pathExists(path.join(root, "apps/server")),
  ]);
  return a && b;
}

/** `ref=` from <root>/.oneself-release, or "" when absent. */
export async function readInstalledRef(root: string): Promise<string> {
  try {
    const raw = await readFile(path.join(root, ".oneself-release"), "utf8");
    return (
      raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.startsWith("ref="))
        ?.slice("ref=".length)
        .trim() ?? ""
    );
  } catch {
    return "";
  }
}

function warnKeep(plan: Extract<SyncPlan, { kind: "keep-newer" }>): void {
  p.log.warn(
    `已安装 ${plan.current}，比这份安装器的 ${plan.bundled} 新。不往回同步。要强制换版本，请显式设置 ONESELF_REF。`,
  );
}

/**
 * Re-extract the compose bundle for an existing install when the launching
 * installer is newer (or the user forced ONESELF_REF). ONESELF_BUNDLED_REF exported by the
 * bootstrap is *never* treated as a forced ref; only a user-set ONESELF_REF is.
 */
export async function maybeSyncBundle(root: string, dryRun: boolean): Promise<SyncPlan> {
  if (await isSourceCheckout(root)) return { kind: "skip" };
  const forced = forcedRef();
  const bundled = installerBundledRef();
  for (const [name, value] of [
    ["ONESELF_REF", forced],
    ["ONESELF_BUNDLED_REF", bundled],
  ] as const) {
    if (value && !refOk(value)) {
      throw new Error(`${name} 只能是 latest 或 v1.2.3 这种版本标签`);
    }
  }
  const current = await readInstalledRef(root);
  let plan = planBundleSync({ current, forced, bundled });
  if (plan.kind === "keep-newer") {
    warnKeep(plan);
    return plan;
  }
  if (plan.kind === "skip") return plan;

  const resolved = await resolveTag(plan.target);
  plan = planAfterResolve({ current, resolved, forced: plan.forced });
  if (plan.kind === "keep-newer") {
    warnKeep(plan);
    return plan;
  }
  if (plan.kind === "skip") return plan;

  const why = plan.forced ? "（ONESELF_REF 指定）" : "";
  p.log.info(`安装文件从 ${current || "未记录"} 换到 ${plan.target}${why}。不覆盖 .env。`);
  if (dryRun) return plan;
  await fetchComposeBundle(root, plan.target);
  return plan;
}
