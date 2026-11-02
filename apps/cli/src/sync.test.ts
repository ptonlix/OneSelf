/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { maybeSyncBundle } from "./sync.ts";

let dir = "";
const saved = { ref: process.env.ONESELF_REF, bundled: process.env.ONESELF_BUNDLED_REF };

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "oneself-sync-"));
  Reflect.deleteProperty(process.env, "ONESELF_REF");
  Reflect.deleteProperty(process.env, "ONESELF_BUNDLED_REF");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of [
    ["ONESELF_REF", saved.ref],
    ["ONESELF_BUNDLED_REF", saved.bundled],
  ] as const) {
    if (v === undefined) Reflect.deleteProperty(process.env, k);
    else process.env[k] = v;
  }
});

function installed(ref: string): void {
  writeFileSync(path.join(dir, ".oneself-release"), `ref=${ref}\n`);
}

test("old Release bootstrap (bundled only) does not downgrade", async () => {
  installed("v1.3.0");
  process.env.ONESELF_BUNDLED_REF = "v1.2.0";
  const plan = await maybeSyncBundle(dir, true);
  assert.equal(plan.kind, "keep-newer");
});

test("newer bundled tag syncs (dry-run)", async () => {
  installed("v1.2.3-rc.1");
  process.env.ONESELF_BUNDLED_REF = "v1.2.3";
  const plan = await maybeSyncBundle(dir, true);
  assert.deepEqual(plan, { kind: "sync", target: "v1.2.3", forced: false });
});

test("explicit ONESELF_REF forces downgrade (dry-run)", async () => {
  installed("v1.3.0");
  process.env.ONESELF_REF = "v1.2.0";
  process.env.ONESELF_BUNDLED_REF = "v1.2.0";
  const plan = await maybeSyncBundle(dir, true);
  assert.deepEqual(plan, { kind: "sync", target: "v1.2.0", forced: true });
});

test("bin/oneself run directly (no refs) leaves files alone", async () => {
  installed("v1.3.0");
  assert.equal((await maybeSyncBundle(dir, true)).kind, "skip");
});

test("invalid bundled ref is rejected", async () => {
  installed("v1.3.0");
  process.env.ONESELF_BUNDLED_REF = "main";
  await assert.rejects(maybeSyncBundle(dir, true), /ONESELF_BUNDLED_REF/);
});
