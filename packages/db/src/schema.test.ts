import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";

import * as db from "./index.ts";
import {
  api_key_requests,
  api_keys,
  chunks,
  facts,
  files,
  links,
  oauth_grants,
  owners,
  page_versions,
  pages,
  site_activations,
  site_files,
  site_pointers,
  site_releases,
  sources,
  tags,
  timeline_entries,
} from "./schema.ts";

type ColumnSpec = {
  name: string;
  sqlType: string;
  notNull: boolean;
  primaryKey: boolean;
  defaultValue?: string | boolean;
  identity?: "always";
};

type ForeignKeySpec = {
  name: string;
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
  onDelete: string;
};

type IndexSpec = {
  name: string;
  method: "btree" | "gin";
};

type TableSpec = {
  columns: ColumnSpec[];
  checks: string[];
  foreignKeys: ForeignKeySpec[];
  indexes: IndexSpec[];
  unique: string[];
};

const text = (name: string, notNull: boolean, primaryKey = false): ColumnSpec => ({
  name,
  sqlType: "text",
  notNull,
  primaryKey,
});

const timestamptz = (name: string, notNull: boolean): ColumnSpec => ({
  name,
  sqlType: "timestamp with time zone",
  notNull,
  primaryKey: false,
});

const schemaMd = {
  sources: {
    columns: [text("id", true, true), timestamptz("deleted_at", false)],
    checks: ["sources_id_format"],
    foreignKeys: [],
    indexes: [],
    unique: [],
  },
  pages: {
    columns: [
      text("source", true, true),
      text("slug", true, true),
      text("type", true),
      text("title", true),
      { ...text("visibility", true), defaultValue: "private" },
      { name: "frontmatter", sqlType: "jsonb", notNull: true, primaryKey: false },
      text("body", true),
      text("content_hash", true),
      text("object_key", true),
      timestamptz("updated_at", true),
      timestamptz("deleted_at", false),
      {
        name: "hidden_by_source",
        sqlType: "boolean",
        notNull: true,
        primaryKey: false,
        defaultValue: false,
      },
    ],
    checks: [
      "pages_slug_format",
      "pages_type_format",
      "pages_visibility",
      "pages_content_hash_format",
      "pages_object_key_format",
    ],
    foreignKeys: [
      {
        name: "pages_source_fk",
        columns: ["source"],
        foreignTable: "sources",
        foreignColumns: ["id"],
        onDelete: "no action",
      },
    ],
    indexes: [
      { name: "pages_source_type_idx", method: "btree" },
      { name: "pages_frontmatter_idx", method: "gin" },
      { name: "pages_title_body_search_idx", method: "gin" },
    ],
    unique: [],
  },
  page_versions: {
    columns: [
      {
        name: "id",
        sqlType: "bigint",
        notNull: true,
        primaryKey: true,
        identity: "always",
      },
      text("source", true),
      text("slug", true),
      text("content_hash", true),
      text("object_key", true),
      { name: "frontmatter", sqlType: "jsonb", notNull: true, primaryKey: false },
      timestamptz("written_at", true),
    ],
    checks: ["page_versions_content_hash_format", "page_versions_object_key_format"],
    foreignKeys: [
      {
        name: "page_versions_page_fk",
        columns: ["source", "slug"],
        foreignTable: "pages",
        foreignColumns: ["source", "slug"],
        onDelete: "no action",
      },
    ],
    indexes: [],
    unique: [],
  },
  files: {
    columns: [
      text("id", true, true),
      text("object_key", true),
      text("media_type", true),
      { name: "byte_size", sqlType: "bigint", notNull: true, primaryKey: false },
      text("sha256", true),
      text("page_source", false),
      text("page_slug", false),
      timestamptz("created_at", true),
    ],
    checks: [
      "files_object_key_format",
      "files_media_type",
      "files_byte_size",
      "files_sha256_format",
      "files_page_pair",
    ],
    foreignKeys: [
      {
        name: "files_page_fk",
        columns: ["page_source", "page_slug"],
        foreignTable: "pages",
        foreignColumns: ["source", "slug"],
        onDelete: "set null",
      },
    ],
    indexes: [],
    unique: [],
  },
  chunks: {
    columns: [
      text("source", true, true),
      text("slug", true, true),
      { name: "ordinal", sqlType: "integer", notNull: true, primaryKey: true },
      text("body", true),
    ],
    checks: ["chunks_ordinal", "chunks_body_length"],
    foreignKeys: [
      {
        name: "chunks_page_fk",
        columns: ["source", "slug"],
        foreignTable: "pages",
        foreignColumns: ["source", "slug"],
        onDelete: "no action",
      },
    ],
    indexes: [],
    unique: [],
  },
  links: {
    columns: [
      text("from_source", true, true),
      text("from_slug", true, true),
      text("to_source", true, true),
      text("to_slug", true, true),
    ],
    checks: [],
    foreignKeys: [
      {
        name: "links_from_page_fk",
        columns: ["from_source", "from_slug"],
        foreignTable: "pages",
        foreignColumns: ["source", "slug"],
        onDelete: "no action",
      },
    ],
    indexes: [],
    unique: [],
  },
  tags: {
    columns: [text("source", true, true), text("slug", true, true), text("tag", true, true)],
    checks: [],
    foreignKeys: [
      {
        name: "tags_page_fk",
        columns: ["source", "slug"],
        foreignTable: "pages",
        foreignColumns: ["source", "slug"],
        onDelete: "no action",
      },
    ],
    indexes: [],
    unique: [],
  },
  facts: {
    columns: [
      text("source", true, true),
      text("slug", true, true),
      text("id", true, true),
      text("entity", true),
      text("statement", true),
      { name: "confidence", sqlType: "numeric", notNull: false, primaryKey: false },
      { name: "valid_until", sqlType: "date", notNull: false, primaryKey: false },
    ],
    checks: ["facts_confidence"],
    foreignKeys: [
      {
        name: "facts_page_fk",
        columns: ["source", "slug"],
        foreignTable: "pages",
        foreignColumns: ["source", "slug"],
        onDelete: "no action",
      },
    ],
    indexes: [],
    unique: [],
  },
  timeline_entries: {
    columns: [
      text("source", true, true),
      text("slug", true, true),
      { name: "ordinal", sqlType: "integer", notNull: true, primaryKey: true },
      { name: "occurred_on", sqlType: "date", notNull: true, primaryKey: false },
      text("title", true),
      text("detail", false),
    ],
    checks: ["timeline_entries_ordinal"],
    foreignKeys: [
      {
        name: "timeline_entries_page_fk",
        columns: ["source", "slug"],
        foreignTable: "pages",
        foreignColumns: ["source", "slug"],
        onDelete: "no action",
      },
    ],
    indexes: [],
    unique: [],
  },
  site_releases: {
    columns: [text("id", true, true), timestamptz("created_at", true)],
    checks: ["site_releases_id_format"],
    foreignKeys: [],
    indexes: [],
    unique: [],
  },
  site_files: {
    columns: [text("release_id", true, true), text("path", true, true), text("object_key", true)],
    checks: ["site_files_path", "site_files_object_key_format"],
    foreignKeys: [
      {
        name: "site_files_release_fk",
        columns: ["release_id"],
        foreignTable: "site_releases",
        foreignColumns: ["id"],
        onDelete: "no action",
      },
    ],
    indexes: [],
    unique: [],
  },
  site_pointers: {
    columns: [
      { name: "id", sqlType: "integer", notNull: true, primaryKey: true },
      text("release_id", true),
    ],
    checks: ["site_pointers_id", "site_pointers_release_id"],
    foreignKeys: [],
    indexes: [],
    unique: [],
  },
  site_activations: {
    columns: [
      text("id", true, true),
      text("release_id", true),
      text("status", true),
      timestamptz("expires_at", true),
      timestamptz("created_at", true),
      timestamptz("decided_at", false),
    ],
    checks: ["site_activations_release_id", "site_activations_status"],
    foreignKeys: [],
    indexes: [],
    unique: [],
  },
  owners: {
    columns: [
      { name: "id", sqlType: "integer", notNull: true, primaryKey: true },
      text("login", true),
      text("password_hash", true),
      { name: "must_change_password", sqlType: "boolean", notNull: true, primaryKey: false },
    ],
    checks: ["owners_id"],
    foreignKeys: [],
    indexes: [],
    unique: [],
  },
  api_keys: {
    columns: [
      text("id", true, true),
      text("key_hash", true),
      text("label", true),
      { name: "unrestricted_data", sqlType: "boolean", notNull: true, primaryKey: false },
      { name: "site_write", sqlType: "boolean", notNull: true, primaryKey: false },
      { name: "sources", sqlType: "jsonb", notNull: true, primaryKey: false },
      timestamptz("created_at", true),
      timestamptz("last_used_at", false),
      timestamptz("revoked_at", false),
    ],
    checks: ["api_keys_key_hash_format", "api_keys_sources_array"],
    foreignKeys: [],
    indexes: [],
    unique: ["api_keys_key_hash_unique"],
  },
  api_key_requests: {
    columns: [
      text("id", true, true),
      text("label", true),
      { name: "unrestricted_data", sqlType: "boolean", notNull: true, primaryKey: false },
      { name: "site_write", sqlType: "boolean", notNull: true, primaryKey: false },
      { name: "sources", sqlType: "jsonb", notNull: true, primaryKey: false },
      text("status", true),
      timestamptz("expires_at", true),
      timestamptz("created_at", true),
      text("api_key_id", false),
    ],
    checks: ["api_key_requests_status", "api_key_requests_sources_array"],
    foreignKeys: [
      {
        name: "api_key_requests_api_key_fk",
        columns: ["api_key_id"],
        foreignTable: "api_keys",
        foreignColumns: ["id"],
        onDelete: "no action",
      },
    ],
    indexes: [],
    unique: [],
  },
  oauth_grants: {
    columns: [
      text("id", true, true),
      { name: "site_write", sqlType: "boolean", notNull: true, primaryKey: false },
      { name: "sources", sqlType: "jsonb", notNull: true, primaryKey: false },
      text("refresh_token_hash", false),
      { name: "rotated_refresh_hashes", sqlType: "jsonb", notNull: true, primaryKey: false },
      { name: "refresh_token_payload", sqlType: "jsonb", notNull: false, primaryKey: false },
      timestamptz("revoked_at", false),
      timestamptz("created_at", true),
    ],
    checks: [
      "oauth_grants_sources_array",
      "oauth_grants_refresh_token_hash_format",
      "oauth_grants_rotated_refresh_hashes_array",
    ],
    foreignKeys: [],
    indexes: [],
    unique: [],
  },
} satisfies Record<string, TableSpec>;

const tables = {
  sources,
  pages,
  page_versions,
  files,
  chunks,
  links,
  tags,
  facts,
  timeline_entries,
  site_releases,
  site_files,
  site_pointers,
  site_activations,
  owners,
  api_keys,
  api_key_requests,
  oauth_grants,
} satisfies Record<keyof typeof schemaMd, PgTable>;

const migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));

function actualTable(table: PgTable): TableSpec {
  const config = getTableConfig(table);
  const compositePrimaryKey = new Set(
    config.primaryKeys.flatMap((key) => key.columns.map((column) => column.name)),
  );
  return {
    columns: config.columns.map((column) => {
      const described: ColumnSpec = {
        name: column.name,
        sqlType: column.getSQLType(),
        notNull: column.notNull,
        primaryKey: column.primary || compositePrimaryKey.has(column.name),
      };
      if (typeof column.default === "string" || typeof column.default === "boolean") {
        described.defaultValue = column.default;
      }
      if (column.generatedIdentity?.type === "always") {
        described.identity = "always";
      }
      return described;
    }),
    checks: config.checks.map((check) => check.name),
    foreignKeys: config.foreignKeys.map((key) => {
      const reference = key.reference();
      return {
        name: key.getName(),
        columns: reference.columns.map((column) => column.name),
        foreignTable: getTableConfig(reference.foreignTable).name,
        foreignColumns: reference.foreignColumns.map((column) => column.name),
        onDelete: key.onDelete ?? "no action",
      };
    }),
    indexes: config.indexes.map((index) => ({
      name: index.config.name ?? "",
      method: index.config.method === "gin" ? "gin" : "btree",
    })),
    unique: config.uniqueConstraints.map((constraint) => constraint.name ?? ""),
  };
}

function migrationTables(
  sqlText: string,
): Map<string, { name: string; sqlType: string; notNull: boolean }[]> {
  const found = new Map<string, { name: string; sqlType: string; notNull: boolean }[]>();
  for (const match of sqlText.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\);/g)) {
    const tableName = match[1];
    const body = match[2];
    if (tableName === undefined || body === undefined) continue;
    const columns: { name: string; sqlType: string; notNull: boolean }[] = [];
    for (const line of body.split("\n")) {
      const column = /^\s*"([^"]+)"\s+(.+)$/.exec(line);
      if (column?.[1] === undefined || column[2] === undefined) continue;
      const rest = column[2].replace(/,$/, "");
      const notNull = /\bNOT NULL\b/.test(rest) || /\bPRIMARY KEY\b/.test(rest);
      const sqlType = rest
        .replace(/\s+DEFAULT\s+.*/, "")
        .replace(/\s+PRIMARY KEY\b.*/, "")
        .replace(/\s+NOT NULL\b.*/, "")
        .trim();
      columns.push({ name: column[1], sqlType, notNull });
    }
    found.set(tableName, columns);
  }
  return found;
}

it("matches the schema.md tables and does not split business tables by material type", () => {
  expect(Object.keys(tables)).toEqual(Object.keys(schemaMd));
  expect(Object.keys(db).sort()).toEqual(Object.keys(schemaMd).sort());
  for (const [name, table] of Object.entries(tables)) {
    expect(actualTable(table), name).toEqual(schemaMd[name as keyof typeof schemaMd]);
  }
  expect(actualTable(page_versions).columns.map((column) => column.name)).not.toContain("body");
});

it("appends one initial migration whose columns match schema.md", () => {
  const sqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"));
  expect(sqlFiles).toEqual(["0000_initial.sql", "0001_oauth_refresh_reuse.sql"]);

  const journal = JSON.parse(
    readFileSync(join(migrationsDirectory, "meta/_journal.json"), "utf8"),
  ) as { dialect: string; entries: { tag: string }[] };
  expect(journal.dialect).toBe("postgresql");
  expect(journal.entries.map((entry) => entry.tag)).toEqual([
    "0000_initial",
    "0001_oauth_refresh_reuse",
  ]);

  const sqlText = readFileSync(join(migrationsDirectory, "0000_initial.sql"), "utf8");
  const created = migrationTables(sqlText);
  expect([...created.keys()].sort()).toEqual(Object.keys(schemaMd).sort());
  const reuse = readFileSync(join(migrationsDirectory, "0001_oauth_refresh_reuse.sql"), "utf8");
  const altered = created.get("oauth_grants");
  if (altered === undefined) {
    throw new Error("oauth_grants missing from the initial migration");
  }
  const revokedAt = altered.findIndex((column) => column.name === "revoked_at");
  altered.splice(
    revokedAt < 0 ? altered.length : revokedAt,
    0,
    { name: "rotated_refresh_hashes", sqlType: "jsonb", notNull: true },
    { name: "refresh_token_payload", sqlType: "jsonb", notNull: false },
  );
  expect(reuse).toContain('ADD COLUMN "rotated_refresh_hashes" jsonb');
  expect(reuse).toContain('ADD COLUMN "refresh_token_payload" jsonb');

  for (const [name, spec] of Object.entries(schemaMd)) {
    expect(
      created.get(name)?.map((column) => column.name),
      name,
    ).toEqual(spec.columns.map((column) => column.name));
    expect(
      created.get(name)?.map((column) => ({
        name: column.name,
        sqlType: column.sqlType,
        notNull: column.notNull,
      })),
      name,
    ).toEqual(
      spec.columns.map((column) => ({
        name: column.name,
        sqlType: column.sqlType,
        notNull: column.notNull,
      })),
    );
  }

  const versionBody = /CREATE TABLE "page_versions" \(([\s\S]*?)\);/.exec(sqlText)?.[1] ?? "";
  expect(versionBody).not.toMatch(/"body"/);
  expect(sqlText).toContain(
    'CREATE INDEX "pages_source_type_idx" ON "pages" USING btree ("source","type")',
  );
  expect(sqlText).toContain(
    'CREATE INDEX "pages_frontmatter_idx" ON "pages" USING gin ("frontmatter")',
  );
  expect(sqlText).toContain(
    `CREATE INDEX "pages_title_body_search_idx" ON "pages" USING gin (to_tsvector('simple', "title" || ' ' || "body"))`,
  );
  expect(sqlText).toContain(`"visibility" text DEFAULT 'private' NOT NULL`);
  expect(sqlText).toContain(`"hidden_by_source" boolean DEFAULT false NOT NULL`);
  expect(sqlText).toContain(`"deleted_at" timestamp with time zone`);
  expect(sqlText).toContain("GENERATED ALWAYS AS IDENTITY");
});
