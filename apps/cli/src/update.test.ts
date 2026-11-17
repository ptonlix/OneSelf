import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import { readDigestUntilReady } from "./update.ts";

it("runUpdate passes followLatest and returns from dry-run before the skill retry", () => {
  const update = readFileSync(new URL("./update.ts", import.meta.url), "utf8");
  const install = readFileSync(new URL("./install.ts", import.meta.url), "utf8");
  expect(update).not.toMatch(/only refreshes the pinned image/);
  expect(update).toMatch(/maybeSyncBundle\(\s*root\s*,\s*options\.dryRun\s*,\s*true\s*\)/);
  expect(update.indexOf("maybeSyncBundle")).toBeLessThan(update.indexOf('"pull"'));
  expect(update).toMatch(/formatUpdateSummary\([\s\S]*?checkedLatest/);
  expect(install).toMatch(/maybeSyncBundle\(\s*root\s*,\s*dryRun\s*\)/);
  expect(install).not.toMatch(/maybeSyncBundle\([^)]*\btrue\b/);
  expect(update).toMatch(/stripOneTrailingSlash\(env\.get\("PUBLIC_ORIGIN"\)/);
  expect(update).not.toMatch(/--wait/);
  expect(update).not.toMatch(/healthcheck/);
  const dryReturn = update.indexOf("dry-run：会在");
  const retry = update.indexOf("readSkillDigestAfterUp(origin)");
  const summary = update.indexOf("p.outro(formatUpdateSummary");
  expect(dryReturn).toBeGreaterThan(0);
  expect(retry).toBeGreaterThan(dryReturn);
  expect(summary).toBeGreaterThan(retry);
});

it("does not fail the update when the post-restart skill read never succeeds", async () => {
  await expect(
    readDigestUntilReady(() => Promise.reject(new Error("down")), {
      attempts: 2,
      delayMs: 1,
      sleep: () => Promise.resolve(),
    }),
  ).resolves.toBeNull();
});
