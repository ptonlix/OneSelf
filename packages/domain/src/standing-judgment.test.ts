import { describe, expect, it } from "vitest";

import {
  deletePage,
  emptyDomainState,
  ensureStandingJudgment,
  getPage,
  putPage,
  rejectStandingStructureWrite,
  sourcesAdd,
  sourcesDelete,
  sourcesList,
  type Credential,
} from "./index.ts";

const NOW = "2026-03-01T00:00:00.000Z";
const owner: Credential = { kind: "owner" };

function soulMarkdown(type = "soul"): string {
  return `---\ntype: ${type}\ntitle: 灵魂画像\nname: ""\nvisibility: private\n---\n\n## 01. Values — 价值观与信念\n`;
}

describe("standing judgment", () => {
  it("seeds bilingual templates and rejects a soul write with the wrong type", () => {
    const ensured = ensureStandingJudgment(emptyDomainState(), NOW);
    expect(ensured.ok).toBe(true);
    if (!ensured.ok) {
      return;
    }
    const soul = getPage(ensured.value, owner, "self", "soul");
    const recent = getPage(ensured.value, owner, "self", "recent");
    expect(soul.ok).toBe(true);
    expect(recent.ok).toBe(true);
    if (!soul.ok || !recent.ok) {
      return;
    }
    expect(soul.value.markdown).toContain("01. Values — 价值观与信念");
    expect(soul.value.markdown).toContain("Observations — 候选观察");
    expect(soul.value.markdown).toContain("不能当作已经确认的特征");
    expect(soul.value.markdown).not.toContain("observation_id:");
    expect(soul.value.markdown).not.toContain("来源：行为观察");
    expect(recent.value.markdown).toContain("01. Focus — 近期关注");
    expect(recent.value.markdown).toContain("07. Goals & Challenges — 目标与困扰");
    expect(recent.value.markdown).toContain("过期的判断退出栏目");
    expect(recent.value.markdown).toContain("有判断的栏目先写一句提炼，判断块写在该栏下。");
    expect(recent.value.markdown).toContain("没有判断的栏目留空。");
    expect(recent.value.markdown).toContain("Timeline — 近期重要变化");
    expect(recent.value.markdown).toContain("as_of: 2026-03-01");
    expect(recent.value.markdown).not.toContain("id: work-001");
    expect(recent.value.markdown).not.toContain("## Facts — 近期有效判断");
    expect(recent.value.markdown).not.toContain("## Facts\n");
    expect(recent.value.visibility).toBe("private");

    const rejected = putPage(
      ensured.value,
      { credential: owner, now: NOW },
      { source: "self", slug: "soul", hash: soul.value.hash, markdown: soulMarkdown("note") },
    );
    expect(rejected.ok).toBe(false);
    if (rejected.ok) {
      return;
    }
    expect(rejected.error).toBe("invalid");
    expect(getPage(ensured.value, owner, "self", "soul")).toEqual(soul);
  });

  it("does not overwrite an existing soul and leaves a soft-deleted self alone", () => {
    const seeded = ensureStandingJudgment(emptyDomainState(), NOW);
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) {
      return;
    }
    const current = getPage(seeded.value, owner, "self", "soul");
    expect(current.ok).toBe(true);
    if (!current.ok) {
      return;
    }
    const custom = putPage(
      seeded.value,
      { credential: owner, now: NOW },
      {
        source: "self",
        slug: "soul",
        hash: current.value.hash,
        markdown: `${soulMarkdown()}\n已确认的判断。见 [[work/oneself]]\n`,
      },
    );
    expect(custom.ok).toBe(true);
    if (!custom.ok) {
      return;
    }
    const again = ensureStandingJudgment(custom.value.state, NOW);
    expect(again.ok).toBe(true);
    if (!again.ok) {
      return;
    }
    const kept = getPage(again.value, owner, "self", "soul");
    expect(kept.ok).toBe(true);
    if (!kept.ok) {
      return;
    }
    expect(kept.value.hash).toBe(custom.value.hash);

    const removed = sourcesDelete(again.value, owner, { id: "self", now: NOW });
    expect(removed.ok).toBe(false);
    if (removed.ok) {
      return;
    }
    expect(removed.error).toBe("invalid");
    const forced = structuredClone(again.value);
    const source = forced.sources.find((item) => item.id === "self");
    expect(source).toBeDefined();
    if (!source) {
      return;
    }
    source.deletedAt = NOW;
    const left = ensureStandingJudgment(forced, "2026-03-02T00:00:00.000Z");
    expect(left.ok).toBe(true);
    if (!left.ok) {
      return;
    }
    const listed = sourcesList(left.value, owner);
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }
    expect(listed.value).toEqual([]);
    expect(getPage(left.value, owner, "self", "recent").ok).toBe(false);
  });

  it("rejects structure rewrites on portraits and still deletes ordinary pages", () => {
    const seeded = ensureStandingJudgment(emptyDomainState(), NOW);
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) {
      return;
    }
    expect(rejectStandingStructureWrite("self", "soul").ok).toBe(false);
    expect(rejectStandingStructureWrite("self", "recent").ok).toBe(false);
    expect(rejectStandingStructureWrite("health", "note").ok).toBe(true);
    const reserved = deletePage(seeded.value, { credential: owner, now: NOW }, "self", "soul");
    expect(reserved.ok).toBe(false);
    if (reserved.ok) {
      return;
    }
    expect(reserved.error).toBe("invalid");
    expect(getPage(seeded.value, owner, "self", "soul").ok).toBe(true);

    const added = sourcesAdd(seeded.value, owner, { id: "health" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const written = putPage(
      added.value.state,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: "---\ntype: note\ntitle: Note\nvisibility: private\n---\n\nHello\n",
      },
    );
    expect(written.ok).toBe(true);
    if (!written.ok) {
      return;
    }
    expect(
      deletePage(written.value.state, { credential: owner, now: NOW }, "health", "note").ok,
    ).toBe(true);
    expect(sourcesDelete(written.value.state, owner, { id: "health", now: NOW }).ok).toBe(true);
  });
});
