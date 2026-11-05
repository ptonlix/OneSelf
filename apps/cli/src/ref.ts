// Release-tag helpers shared by install / update. Pure functions only (unit-tested).
// refOk must accept the same shapes as ref_ok in deploy/oneself-bootstrap.sh / .ps1.

const TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** latest or v1.2.3 / v1.2.3-rc.1 (same shape the bootstrap scripts accept). */
export function refOk(ref: string): boolean {
  return ref === "latest" || TAG.test(ref);
}

type Parsed = {
  readonly maj: number;
  readonly min: number;
  readonly pat: number;
  readonly pre: string;
};

function parseTag(ref: string): Parsed | undefined {
  const m = TAG.exec(ref);
  if (!m) return undefined;
  return {
    maj: Number(m[1]),
    min: Number(m[2]),
    pat: Number(m[3]),
    pre: m[4] ?? "",
  };
}

/**
 * True when `a` is a strictly newer version tag than `b`.
 * maj.min.pat compare numerically; a release (no pre) is newer than any prerelease
 * of the same version; two prereleases compare as plain (C-locale) strings.
 * `latest`, empty, or malformed refs are not comparable → false.
 */
export function refNewer(a: string, b: string): boolean {
  const l = parseTag(a);
  const r = parseTag(b);
  if (!l || !r) return false;
  if (l.maj !== r.maj) return l.maj > r.maj;
  if (l.min !== r.min) return l.min > r.min;
  if (l.pat !== r.pat) return l.pat > r.pat;
  if (l.pre === "" && r.pre !== "") return true;
  if (l.pre !== "" && r.pre === "") return false;
  if (l.pre !== r.pre) return l.pre > r.pre;
  return false;
}

/** Non-empty user-set ONESELF_REF (empty string counts as unset, like the bootstrap scripts). */
export function forcedRef(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const v = env.ONESELF_REF?.trim();
  return v ? v : undefined;
}

/** Tag baked into the installer that launched us (bootstrap exports it). */
export function installerBundledRef(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const v = env.ONESELF_BUNDLED_REF?.trim();
  return v ? v : undefined;
}

export type SyncPlan =
  | { readonly kind: "skip" }
  | { readonly kind: "keep-newer"; readonly current: string; readonly bundled: string }
  | { readonly kind: "sync"; readonly target: string; readonly forced: boolean };

/**
 * Decide whether an existing install should re-extract the compose bundle.
 * Rules:
 * - Only a user-set ONESELF_REF may force a sync, including a downgrade.
 * - Otherwise compare the installed `.oneself-release` ref= with the installer's
 *   bundled tag and never move backwards.
 * - No forced ref and no bundled tag → leave files alone.
 * `target` may still be `latest`; the caller resolves it and calls `planAfterResolve`.
 * `oneself update` uses `planUpdateSync` instead, so a direct run follows GitHub latest.
 */
export function planBundleSync(input: {
  readonly current: string;
  readonly forced: string | undefined;
  readonly bundled: string | undefined;
}): SyncPlan {
  const { current, forced, bundled } = input;
  if (forced) {
    if (current !== "" && current === forced) return { kind: "skip" };
    return { kind: "sync", target: forced, forced: true };
  }
  if (!bundled) return { kind: "skip" };
  if (refNewer(current, bundled)) {
    return { kind: "keep-newer", current, bundled };
  }
  if (current !== "" && current === bundled) return { kind: "skip" };
  return { kind: "sync", target: bundled, forced: false };
}

/**
 * `oneself update` with no installer tag and no ONESELF_REF follows GitHub latest.
 * An older bundled installer still cannot downgrade. A user-set ONESELF_REF still can.
 */
export function planUpdateSync(input: {
  readonly current: string;
  readonly forced: string | undefined;
  readonly bundled: string | undefined;
}): SyncPlan {
  const planned = planBundleSync(input);
  if (planned.kind !== "skip" || input.forced || input.bundled) return planned;
  return { kind: "sync", target: "latest", forced: false };
}

/** Second check once `latest` has been resolved to a concrete tag. */
export function planAfterResolve(input: {
  readonly current: string;
  readonly resolved: string;
  readonly forced: boolean;
}): SyncPlan {
  const { current, resolved, forced } = input;
  if (current !== "" && current === resolved) return { kind: "skip" };
  if (!forced && refNewer(current, resolved)) {
    return { kind: "keep-newer", current, bundled: resolved };
  }
  return { kind: "sync", target: resolved, forced };
}
