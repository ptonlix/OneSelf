import { describe, expect, it } from "vitest";

import { buildAdminGraph, GRAPH_LINK_CAP, GRAPH_PAGE_CAP } from "./admin-graph.ts";

const source = (id: string, deletedAt: string | null = null) => ({ id, deletedAt });

function page(
  sourceId: string,
  slug: string,
  extra: Partial<{
    deletedAt: string | null;
    hiddenBySource: boolean;
    links: { toSource: string; toSlug: string }[];
    title: string;
  }> = {},
) {
  return {
    source: sourceId,
    slug,
    type: "note",
    title: extra.title ?? slug,
    visibility: "private" as const,
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: extra.deletedAt ?? null,
    hiddenBySource: extra.hiddenBySource ?? false,
    links: extra.links ?? [],
  };
}

describe("buildAdminGraph", () => {
  it("omits hidden pages and marks a missing target broken without a body", () => {
    const graph = buildAdminGraph({
      sources: [source("health"), source("work", "2026-01-02T00:00:00.000Z")],
      pages: [
        page("health", "note", { links: [{ toSource: "work", toSlug: "old-role" }] }),
        page("health", "gone", { deletedAt: "2026-01-03T00:00:00.000Z" }),
        page("health", "hidden", { hiddenBySource: true }),
        page("work", "old-role"),
      ],
      files: [],
    });
    expect(graph.pages.map((item) => item.slug)).toEqual(["note"]);
    expect(graph.sources.map((item) => item.id)).toEqual(["health"]);
    expect(graph.links).toEqual([
      {
        from: { source: "health", slug: "note" },
        to: { source: "work", slug: "old-role" },
        broken: true,
      },
    ]);
    expect(JSON.stringify(graph)).not.toContain("markdown");
    expect(JSON.stringify(graph)).not.toContain("body");
    expect(graph.truncated).toBe(false);
  });

  it("counts attached files instead of distinct media types", () => {
    const graph = buildAdminGraph({
      sources: [source("notes")],
      pages: [page("notes", "scan")],
      files: [
        { pageSource: "notes", pageSlug: "scan", mediaType: "image/jpeg" },
        { pageSource: "notes", pageSlug: "scan", mediaType: "image/jpeg" },
        { pageSource: "notes", pageSlug: "scan", mediaType: "application/pdf" },
        { pageSource: null, pageSlug: null, mediaType: "image/png" },
      ],
    });
    expect(graph.pages).toEqual([
      expect.objectContaining({
        slug: "scan",
        file_count: 3,
        media_types: ["application/pdf", "image/jpeg"],
      }),
    ]);
  });

  it("marks truncation only past the caps", () => {
    const pages = Array.from({ length: GRAPH_PAGE_CAP }, (_, index) =>
      page("notes", `p${String(index).padStart(4, "0")}`),
    );
    expect(buildAdminGraph({ sources: [source("notes")], pages, files: [] }).truncated).toBe(false);
    expect(
      buildAdminGraph({
        sources: [source("notes")],
        pages: [...pages, page("notes", "extra")],
        files: [],
      }).truncated,
    ).toBe(true);
    const linked = page("notes", "hub", {
      links: Array.from({ length: GRAPH_LINK_CAP + 1 }, (_, index) => ({
        toSource: "missing",
        toSlug: `t${String(index).padStart(4, "0")}`,
      })),
    });
    const over = buildAdminGraph({ sources: [source("notes")], pages: [linked], files: [] });
    expect(over.truncated).toBe(true);
    expect(over.links).toHaveLength(GRAPH_LINK_CAP);
  });
});
