/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("runUpdate passes followLatest and does not claim a direct run only refreshes the image", () => {
  const update = readFileSync(new URL("./update.ts", import.meta.url), "utf8");
  const install = readFileSync(new URL("./install.ts", import.meta.url), "utf8");
  assert.doesNotMatch(update, /only refreshes the pinned image/);
  assert.match(update, /maybeSyncBundle\(\s*root\s*,\s*options\.dryRun\s*,\s*true\s*\)/);
  assert.ok(update.indexOf("maybeSyncBundle") < update.indexOf('"pull"'));
  assert.match(update, /formatUpdateSummary\([\s\S]*?checkedLatest/);
  assert.match(install, /maybeSyncBundle\(\s*root\s*,\s*dryRun\s*\)/);
  assert.doesNotMatch(install, /maybeSyncBundle\([^)]*\btrue\b/);
});
