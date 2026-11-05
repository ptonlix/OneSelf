import { access, readFile, constants as fsConstants } from "node:fs/promises";
import path from "node:path";
import * as p from "@clack/prompts";

import { fetchComposeBundle, resolveTag } from "./fetch-bundle.ts";
import {
  forcedRef,
  installerBundledRef,
  planAfterResolve,
  planBundleSync,
  planUpdateSync,
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

type BundleSyncResult = SyncPlan & { readonly checkedLatest: boolean };

/** “安装器” only when the compared tag is the concrete ONESELF_BUNDLED_REF. */
function warnKeep(
  plan: Extract<SyncPlan, { kind: "keep-newer" }>,
  bundledRef: string | undefined,
): void {
  const fromInstaller =
    bundledRef !== undefined && bundledRef !== "latest" && plan.bundled === bundledRef;
  const compared = fromInstaller
    ? `比这份安装器的 ${plan.bundled} 新`
    : `比 GitHub 最新正式版 ${plan.bundled} 新`;
  p.log.warn(
    `已安装 ${plan.current}，${compared}。不往回同步。要强制换版本，请显式设置 ONESELF_REF。`,
  );
}

function finish(plan: SyncPlan, checkedLatest: boolean): BundleSyncResult {
  switch (plan.kind) {
    case "skip":
      return { kind: "skip", checkedLatest };
    case "keep-newer":
      return {
        kind: "keep-newer",
        current: plan.current,
        bundled: plan.bundled,
        checkedLatest,
      };
    case "sync":
      return { kind: "sync", target: plan.target, forced: plan.forced, checkedLatest };
  }
}

/**
 * Re-extract the compose bundle when a newer installer tag, a user-set ONESELF_REF,
 * or (`followLatest`) a newer GitHub latest tag says so. ONESELF_BUNDLED_REF is never
 * a forced ref. Install must leave `followLatest` false.
 */
export async function maybeSyncBundle(
  root: string,
  dryRun: boolean,
  followLatest = false,
): Promise<BundleSyncResult> {
  if (await isSourceCheckout(root)) return finish({ kind: "skip" }, false);
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
  let plan = followLatest
    ? planUpdateSync({ current, forced, bundled })
    : planBundleSync({ current, forced, bundled });
  if (plan.kind === "keep-newer") {
    warnKeep(plan, bundled);
    return finish(plan, false);
  }
  if (plan.kind === "skip") return finish(plan, false);

  const checkedLatest = plan.target === "latest";
  const resolved = await resolveTag(plan.target);
  plan = planAfterResolve({ current, resolved, forced: plan.forced });
  if (plan.kind === "keep-newer") {
    warnKeep(plan, bundled);
    return finish(plan, checkedLatest);
  }
  if (plan.kind === "skip") return finish(plan, checkedLatest);

  const why = plan.forced ? "（ONESELF_REF 指定）" : "";
  p.log.info(`安装文件从 ${current || "未记录"} 换到 ${plan.target}${why}。不覆盖 .env。`);
  if (dryRun) return finish(plan, checkedLatest);
  await fetchComposeBundle(root, plan.target);
  return finish(plan, checkedLatest);
}
