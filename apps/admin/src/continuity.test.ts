import { describe, expect, it } from "vitest";

import {
  connectCommand,
  shouldPromptSkillUpdate,
  skillDigestKey,
  skillLineDiff,
  skillNoticePlan,
  skillSnapshotPlan,
  skillStorePlan,
  skillUpgradeCommand,
} from "./continuity";

const digest = `sha256:${"a".repeat(64)}`;

describe("skill update notice", () => {
  it("prompts only when an agent exists and the digest is not acknowledged", () => {
    expect(shouldPromptSkillUpdate({ hasAgent: true, digest, stored: null })).toBe(true);
    expect(shouldPromptSkillUpdate({ hasAgent: true, digest, stored: "sha256:old" })).toBe(true);
    expect(shouldPromptSkillUpdate({ hasAgent: true, digest, stored: digest })).toBe(false);
    expect(shouldPromptSkillUpdate({ hasAgent: false, digest, stored: null })).toBe(false);
    expect(shouldPromptSkillUpdate({ hasAgent: true, digest: null, stored: null })).toBe(false);
  });

  it("keeps the update command and stores the digest per origin", () => {
    expect(connectCommand("http://127.0.0.1:3000")).toBe(
      "npx skills add http://127.0.0.1:3000 -a <agent> -s oneself -y",
    );
    expect(skillUpgradeCommand()).toBe("npx skills update oneself");
    expect(skillDigestKey("http://127.0.0.1:3000")).not.toBe(
      skillDigestKey("https://chenfudong.win"),
    );
  });

  it("diffs only the changed skill lines and snapshots a baseline", () => {
    expect(skillLineDiff("a\nb\nc", "a\nB\nc").map((line) => `${line.kind}:${line.text}`)).toEqual([
      "del:b",
      "add:B",
    ]);
    expect(
      skillSnapshotPlan({ prompt: false, current: "now", previous: null, acknowledged: false }),
    ).toBe("now");
    expect(
      skillSnapshotPlan({ prompt: true, current: "now", previous: null, acknowledged: false }),
    ).toBe(null);
    expect(
      skillSnapshotPlan({ prompt: true, current: "now", previous: "old", acknowledged: true }),
    ).toBe("now");
  });

  it("stores the digest silently without an agent, and again when acknowledged", () => {
    const origin = "http://127.0.0.1:3000";
    expect(
      skillNoticePlan({ hasAgent: false, digest, stored: null, acknowledged: false, origin }),
    ).toEqual({ storeDigest: digest, prompt: false });
    expect(
      skillNoticePlan({
        hasAgent: true,
        digest,
        stored: "sha256:old",
        acknowledged: true,
        origin,
      }),
    ).toEqual({ storeDigest: digest, prompt: false });
    expect(
      skillNoticePlan({ hasAgent: true, digest, stored: null, acknowledged: false, origin }),
    ).toEqual({ storeDigest: null, prompt: true });
    expect(
      skillNoticePlan({ hasAgent: true, digest, stored: digest, acknowledged: false, origin }),
    ).toEqual({ storeDigest: null, prompt: false });
    expect(
      skillNoticePlan({ hasAgent: true, digest, stored: null, acknowledged: true, origin: null }),
    ).toEqual({ storeDigest: null, prompt: false });
    expect(
      skillNoticePlan({ hasAgent: false, digest: null, stored: null, acknowledged: false, origin }),
    ).toEqual({ storeDigest: null, prompt: false });
  });

  it("stores fetched skill text on a silent digest write and leaves a baseline when text was not fetched", () => {
    expect(skillStorePlan({ storeDigest: digest, hasAgent: false, fetchedText: "now" })).toEqual({
      digest,
      text: "now",
    });
    expect(skillStorePlan({ storeDigest: digest, hasAgent: false, fetchedText: null })).toEqual({
      digest,
      text: null,
    });
    expect(skillStorePlan({ storeDigest: digest, hasAgent: true, fetchedText: "now" })).toEqual({
      digest,
      text: null,
    });
    expect(skillStorePlan({ storeDigest: null, hasAgent: false, fetchedText: "now" })).toEqual({
      digest: null,
      text: null,
    });
  });
});
