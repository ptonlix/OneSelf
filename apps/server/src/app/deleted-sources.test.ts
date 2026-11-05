import { addMilliseconds, SOFT_DELETE_RETENTION_MS } from "@oneself/domain";
import { describe, expect, it } from "vitest";

import { deletedSourcePage, parseDeletedSourceQuery } from "./deleted-sources.ts";

const NOW = "2026-10-20T00:00:00.000Z";

describe("deletedSourcePage", () => {
  it("pages past 20 and omits directories older than 30 days", () => {
    const justInside = addMilliseconds(NOW, -SOFT_DELETE_RETENTION_MS);
    const past = addMilliseconds(NOW, -(SOFT_DELETE_RETENTION_MS + 1));
    if (justInside === null || past === null) throw new Error("fixture");
    const sources = [
      { id: "live", deletedAt: null },
      { id: "old", deletedAt: past },
      { id: "edge", deletedAt: justInside },
      ...Array.from({ length: 21 }, (_, index) => ({
        id: `s${String(index + 1).padStart(2, "0")}`,
        deletedAt: addMilliseconds(NOW, -index * 1000),
      })),
    ].map((source) => ({
      id: source.id,
      deletedAt: source.deletedAt,
    }));
    const first = deletedSourcePage(sources, NOW, 20, 0);
    const second = deletedSourcePage(sources, NOW, 20, 20);
    expect(first).toHaveLength(20);
    expect(first[0]).toEqual({ id: "s01", deleted_at: NOW });
    expect(first.map((row) => row.id)).not.toContain("old");
    expect(first.map((row) => row.id)).not.toContain("live");
    expect(second.map((row) => row.id)).toEqual(["s21", "edge"]);
    expect(JSON.stringify(first)).not.toContain("body");
    expect(parseDeletedSourceQuery(undefined, undefined)).toEqual({ limit: 20, offset: 0 });
    expect(parseDeletedSourceQuery("50", "20")).toEqual({ limit: 50, offset: 20 });
    expect(parseDeletedSourceQuery("51", undefined)).toBeNull();
    expect(parseDeletedSourceQuery("20", "nope")).toBeNull();
  });
});
