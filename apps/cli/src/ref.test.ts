/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  forcedRef,
  installerBundledRef,
  planAfterResolve,
  planBundleSync,
  refNewer,
  refOk,
} from "./ref.ts";

// Semver-ish ordering: a stable tag is newer than its own prereleases.
test("refNewer orders stable above prerelease", () => {
  assert.equal(refNewer("v1.2.4", "v1.2.3"), true);
  assert.equal(refNewer("v1.2.3", "v1.2.3-rc.1"), true);
  assert.equal(refNewer("v1.2.3", "v1.2.4"), false);
  assert.equal(refNewer("v1.2.3-rc.1", "v1.2.3"), false);
  assert.equal(refNewer("v1.2.3", "v1.2.3"), false);
});

test("refNewer numeric and prerelease ordering", () => {
  assert.equal(refNewer("v1.10.0", "v1.9.9"), true);
  assert.equal(refNewer("v2.0.0", "v1.99.99"), true);
  assert.equal(refNewer("v1.2.3-rc.2", "v1.2.3-rc.1"), true);
  assert.equal(refNewer("v1.2.3-rc.1", "v1.2.3-rc.2"), false);
  assert.equal(refNewer("v1.2.3-rc.1", "v1.2.3-beta.1"), true);
  assert.equal(refNewer("v1.2.4-rc.1", "v1.2.3"), true);
});

test("refNewer: latest / empty / junk are not comparable", () => {
  assert.equal(refNewer("latest", "v1.2.3"), false);
  assert.equal(refNewer("v1.2.3", "latest"), false);
  assert.equal(refNewer("", "v1.2.3"), false);
  assert.equal(refNewer("v1.2.3", ""), false);
  assert.equal(refNewer("1.2.3", "v1.0.0"), false);
});

test("refOk", () => {
  assert.equal(refOk("latest"), true);
  assert.equal(refOk("v1.2.3"), true);
  assert.equal(refOk("v1.2.3-rc.1"), true);
  assert.equal(refOk("v1.2"), false);
  assert.equal(refOk("main"), false);
  assert.equal(refOk("v1.2.3/../x"), false);
});

test("forcedRef / installerBundledRef treat empty as unset", () => {
  assert.equal(forcedRef({ ONESELF_REF: "" }), undefined);
  assert.equal(forcedRef({ ONESELF_REF: "v1.0.0" }), "v1.0.0");
  assert.equal(forcedRef({ ONESELF_BUNDLED_REF: "v1.0.0" }), undefined);
  assert.equal(installerBundledRef({ ONESELF_BUNDLED_REF: " " }), undefined);
});

test("old Release installer must not downgrade (bundled is not forced)", () => {
  assert.deepEqual(planBundleSync({ current: "v1.3.0", forced: undefined, bundled: "v1.2.0" }), {
    kind: "keep-newer",
    current: "v1.3.0",
    bundled: "v1.2.0",
  });
  // prerelease installed, older stable installer
  assert.equal(
    planBundleSync({ current: "v1.3.0-rc.1", forced: undefined, bundled: "v1.2.9" }).kind,
    "keep-newer",
  );
});

test("newer installer syncs, including prerelease → release", () => {
  assert.deepEqual(planBundleSync({ current: "v1.2.0", forced: undefined, bundled: "v1.3.0" }), {
    kind: "sync",
    target: "v1.3.0",
    forced: false,
  });
  assert.deepEqual(
    planBundleSync({ current: "v1.2.3-rc.1", forced: undefined, bundled: "v1.2.3" }),
    { kind: "sync", target: "v1.2.3", forced: false },
  );
});

test("same ref or nothing to compare → skip", () => {
  assert.equal(
    planBundleSync({ current: "v1.2.3", forced: undefined, bundled: "v1.2.3" }).kind,
    "skip",
  );
  assert.equal(
    planBundleSync({ current: "v1.2.3", forced: undefined, bundled: undefined }).kind,
    "skip",
  );
});

test("user-forced ONESELF_REF may downgrade", () => {
  assert.deepEqual(planBundleSync({ current: "v1.3.0", forced: "v1.2.0", bundled: "v1.2.0" }), {
    kind: "sync",
    target: "v1.2.0",
    forced: true,
  });
  assert.equal(
    planBundleSync({ current: "v1.2.0", forced: "v1.2.0", bundled: undefined }).kind,
    "skip",
  );
});

test("latest resolution still refuses unforced downgrade", () => {
  assert.equal(
    planAfterResolve({ current: "v1.4.0-rc.1", resolved: "v1.3.0", forced: false }).kind,
    "keep-newer",
  );
  assert.equal(
    planAfterResolve({ current: "v1.4.0-rc.1", resolved: "v1.3.0", forced: true }).kind,
    "sync",
  );
  assert.equal(
    planAfterResolve({ current: "v1.3.0", resolved: "v1.3.0", forced: false }).kind,
    "skip",
  );
  assert.equal(planAfterResolve({ current: "", resolved: "v1.3.0", forced: false }).kind, "sync");
});
