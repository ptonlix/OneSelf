import { describe, expect, it } from "vitest";

import { emptyDomainState, type PageRecord } from "@oneself/domain";

import { buildSnippet, searchPages } from "./search.js";

const owner = { kind: "owner" } as const;

function page(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    source: "notes",
    slug: "ledger",
    type: "ledger",
    title: "Hidden",
    visibility: "private",
    frontmatter: { title: "Hidden" },
    body: "ordinary prose",
    markdown: "ordinary prose",
    contentHash: "ab".repeat(32),
    objectKey: `pages/notes/ledger/${"ab".repeat(32)}.md`,
    updatedAt: "2026-10-20T00:00:00.000Z",
    deletedAt: null,
    hiddenBySource: false,
    chunks: [],
    links: [],
    tags: [],
    facts: [],
    timeline: [],
    ...overrides,
  };
}

describe("search", () => {
  it("matches type with a case-sensitive substring and builds a snippet", () => {
    const ledger = page();
    expect(buildSnippet(ledger, "ledger")).toBe("ledger");
    expect(buildSnippet(ledger, "Ledger")).toBeNull();
    const state = emptyDomainState();
    state.sources = [{ id: "notes", deletedAt: null }];
    state.pages = [ledger, page({ slug: "other", type: "note" })];
    expect(searchPages(state, owner, { q: "ledger", limit: 20, offset: 0 }, false)).toEqual([
      {
        source: "notes",
        slug: "ledger",
        type: "ledger",
        title: "Hidden",
        snippet: "ledger",
      },
    ]);
    expect(searchPages(state, owner, { q: "Ledger", limit: 20, offset: 0 }, false)).toEqual([]);
  });
});
