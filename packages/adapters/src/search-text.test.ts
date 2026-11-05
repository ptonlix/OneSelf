import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { pageSearchTextClause } from "./postgres-store.ts";

describe("pageSearchTextClause", () => {
  it("matches type with a case-sensitive substring", () => {
    const clause = pageSearchTextClause("Ledger");
    expect(clause).toBeDefined();
    if (clause === undefined) {
      return;
    }
    const query = new PgDialect().sqlToQuery(clause);
    expect(query.sql).toContain('"pages"."type"');
    expect(query.sql.toLowerCase()).not.toContain("ilike");
    expect(query.params).toContain("%Ledger%");
    expect(query.params).not.toContain("%ledger%");
  });

  it("returns no clause for an empty query", () => {
    expect(pageSearchTextClause("")).toBeUndefined();
  });

  it("matches 上海 as a contiguous substring and does not search chunks or simple tsvector", () => {
    const clause = pageSearchTextClause("上海");
    expect(clause).toBeDefined();
    if (clause === undefined) return;
    const query = new PgDialect().sqlToQuery(clause);
    expect(query.sql).toContain("LIKE");
    expect(query.sql.toLowerCase()).not.toContain("to_tsvector");
    expect(query.sql).not.toContain("chunks");
    expect(query.params).toContain("%上海%");
    expect(query.sql).toContain('"pages"."title"');
    expect(query.sql).toContain('"pages"."body"');
  });
});
