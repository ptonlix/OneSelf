import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Permission entry stored in `api_keys.sources`, `api_key_requests.sources`,
 * and `oauth_grants.sources`. `visibility` is the flag that allows changing
 * page visibility, not the page's own `public` / `private` value.
 */
export type SourceGrant = {
  id: string;
  read: boolean;
  write: boolean;
  visibility: boolean;
};

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/** `original` is the built-in site, so this column cannot be a foreign key. */
const releasePointer = (column: AnyPgColumn) =>
  sql`${column} = 'original' or ${column} ~ '^rel_[0-9a-f]{32}$'`;

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    deleted_at: timestamptz("deleted_at"),
  },
  (table) => [check("sources_id_format", sql`${table.id} ~ '^[a-z][a-z0-9-]{0,62}$'`)],
);

export const pages = pgTable(
  "pages",
  {
    source: text("source").notNull(),
    slug: text("slug").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    visibility: text("visibility").notNull().default("private"),
    frontmatter: jsonb("frontmatter").notNull(),
    body: text("body").notNull(),
    content_hash: text("content_hash").notNull(),
    object_key: text("object_key").notNull(),
    updated_at: timestamptz("updated_at").notNull(),
    deleted_at: timestamptz("deleted_at"),
    hidden_by_source: boolean("hidden_by_source").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.source, table.slug] }),
    foreignKey({
      name: "pages_source_fk",
      columns: [table.source],
      foreignColumns: [sources.id],
    }),
    check("pages_slug_format", sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{0,79}$'`),
    check("pages_type_format", sql`${table.type} ~ '^[a-z][a-z0-9-]{0,62}$'`),
    check("pages_visibility", sql`${table.visibility} in ('public', 'private')`),
    check("pages_content_hash_format", sql`${table.content_hash} ~ '^[0-9a-f]{64}$'`),
    check(
      "pages_object_key_format",
      sql`${table.object_key} = 'pages/' || ${table.source} || '/' || ${table.slug} || '/' || ${table.content_hash} || '.md'`,
    ),
    index("pages_source_type_idx").on(table.source, table.type),
    index("pages_frontmatter_idx").using("gin", table.frontmatter),
    index("pages_title_body_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.title} || ' ' || ${table.body})`,
    ),
  ],
);

export const page_versions = pgTable(
  "page_versions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    source: text("source").notNull(),
    slug: text("slug").notNull(),
    content_hash: text("content_hash").notNull(),
    object_key: text("object_key").notNull(),
    frontmatter: jsonb("frontmatter").notNull(),
    written_at: timestamptz("written_at").notNull(),
  },
  (table) => [
    foreignKey({
      name: "page_versions_page_fk",
      columns: [table.source, table.slug],
      foreignColumns: [pages.source, pages.slug],
    }),
    check("page_versions_content_hash_format", sql`${table.content_hash} ~ '^[0-9a-f]{64}$'`),
    check(
      "page_versions_object_key_format",
      sql`${table.object_key} = 'pages/' || ${table.source} || '/' || ${table.slug} || '/' || ${table.content_hash} || '.md'`,
    ),
  ],
);

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    object_key: text("object_key").notNull(),
    media_type: text("media_type").notNull(),
    byte_size: bigint("byte_size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    page_source: text("page_source"),
    page_slug: text("page_slug"),
    created_at: timestamptz("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      name: "files_page_fk",
      columns: [table.page_source, table.page_slug],
      foreignColumns: [pages.source, pages.slug],
    }).onDelete("set null"),
    check("files_object_key_format", sql`${table.object_key} = 'files/' || ${table.id}`),
    check(
      "files_media_type",
      sql`${table.media_type} in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf')`,
    ),
    check("files_byte_size", sql`${table.byte_size} >= 0 and ${table.byte_size} <= 20971520`),
    check("files_sha256_format", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check("files_page_pair", sql`(${table.page_source} is null) = (${table.page_slug} is null)`),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    source: text("source").notNull(),
    slug: text("slug").notNull(),
    ordinal: integer("ordinal").notNull(),
    body: text("body").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.source, table.slug, table.ordinal] }),
    foreignKey({
      name: "chunks_page_fk",
      columns: [table.source, table.slug],
      foreignColumns: [pages.source, pages.slug],
    }),
    check("chunks_ordinal", sql`${table.ordinal} >= 0`),
    check("chunks_body_length", sql`char_length(${table.body}) <= 1000`),
  ],
);

export const links = pgTable(
  "links",
  {
    from_source: text("from_source").notNull(),
    from_slug: text("from_slug").notNull(),
    to_source: text("to_source").notNull(),
    to_slug: text("to_slug").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.from_source, table.from_slug, table.to_source, table.to_slug],
    }),
    foreignKey({
      name: "links_from_page_fk",
      columns: [table.from_source, table.from_slug],
      foreignColumns: [pages.source, pages.slug],
    }),
  ],
);

export const tags = pgTable(
  "tags",
  {
    source: text("source").notNull(),
    slug: text("slug").notNull(),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.source, table.slug, table.tag] }),
    foreignKey({
      name: "tags_page_fk",
      columns: [table.source, table.slug],
      foreignColumns: [pages.source, pages.slug],
    }),
  ],
);

export const facts = pgTable(
  "facts",
  {
    source: text("source").notNull(),
    slug: text("slug").notNull(),
    id: text("id").notNull(),
    entity: text("entity").notNull(),
    statement: text("statement").notNull(),
    confidence: numeric("confidence"),
    valid_until: date("valid_until"),
  },
  (table) => [
    primaryKey({ columns: [table.source, table.slug, table.id] }),
    foreignKey({
      name: "facts_page_fk",
      columns: [table.source, table.slug],
      foreignColumns: [pages.source, pages.slug],
    }),
    check(
      "facts_confidence",
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
  ],
);

export const timeline_entries = pgTable(
  "timeline_entries",
  {
    source: text("source").notNull(),
    slug: text("slug").notNull(),
    ordinal: integer("ordinal").notNull(),
    occurred_on: date("occurred_on").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
  },
  (table) => [
    primaryKey({ columns: [table.source, table.slug, table.ordinal] }),
    foreignKey({
      name: "timeline_entries_page_fk",
      columns: [table.source, table.slug],
      foreignColumns: [pages.source, pages.slug],
    }),
    check("timeline_entries_ordinal", sql`${table.ordinal} >= 0`),
  ],
);

export const site_releases = pgTable(
  "site_releases",
  {
    id: text("id").primaryKey(),
    created_at: timestamptz("created_at").notNull(),
  },
  (table) => [check("site_releases_id_format", sql`${table.id} ~ '^rel_[0-9a-f]{32}$'`)],
);

export const site_files = pgTable(
  "site_files",
  {
    release_id: text("release_id").notNull(),
    path: text("path").notNull(),
    object_key: text("object_key").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.release_id, table.path] }),
    foreignKey({
      name: "site_files_release_fk",
      columns: [table.release_id],
      foreignColumns: [site_releases.id],
    }),
    check(
      "site_files_path",
      sql`${table.path} <> '' and ${table.path} !~ '^/' and ${table.path} !~ '(^|/)\\.\\.(/|$)'`,
    ),
    check(
      "site_files_object_key_format",
      sql`${table.object_key} = 'sites/' || ${table.release_id} || '/' || ${table.path}`,
    ),
  ],
);

export const site_pointers = pgTable(
  "site_pointers",
  {
    id: integer("id").primaryKey(),
    release_id: text("release_id").notNull(),
  },
  (table) => [
    check("site_pointers_id", sql`${table.id} = 1`),
    check("site_pointers_release_id", releasePointer(table.release_id)),
  ],
);

export const site_activations = pgTable(
  "site_activations",
  {
    id: text("id").primaryKey(),
    release_id: text("release_id").notNull(),
    status: text("status").notNull(),
    expires_at: timestamptz("expires_at").notNull(),
    created_at: timestamptz("created_at").notNull(),
    decided_at: timestamptz("decided_at"),
  },
  (table) => [
    check("site_activations_release_id", releasePointer(table.release_id)),
    check(
      "site_activations_status",
      sql`${table.status} in ('pending', 'approved', 'rejected', 'expired')`,
    ),
  ],
);

export const owners = pgTable(
  "owners",
  {
    id: integer("id").primaryKey(),
    login: text("login").notNull(),
    password_hash: text("password_hash").notNull(),
    must_change_password: boolean("must_change_password").notNull(),
  },
  (table) => [check("owners_id", sql`${table.id} = 1`)],
);

const sourceGrants = (name: string) => jsonb(name).$type<SourceGrant[]>();

export const api_keys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    key_hash: text("key_hash").notNull(),
    label: text("label").notNull(),
    unrestricted_data: boolean("unrestricted_data").notNull(),
    site_write: boolean("site_write").notNull(),
    sources: sourceGrants("sources").notNull(),
    created_at: timestamptz("created_at").notNull(),
    last_used_at: timestamptz("last_used_at"),
    revoked_at: timestamptz("revoked_at"),
  },
  (table) => [
    unique("api_keys_key_hash_unique").on(table.key_hash),
    check("api_keys_key_hash_format", sql`${table.key_hash} ~ '^[0-9a-f]{64}$'`),
    check("api_keys_sources_array", sql`jsonb_typeof(${table.sources}) = 'array'`),
  ],
);

export const api_key_requests = pgTable(
  "api_key_requests",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    unrestricted_data: boolean("unrestricted_data").notNull(),
    site_write: boolean("site_write").notNull(),
    sources: sourceGrants("sources").notNull(),
    status: text("status").notNull(),
    expires_at: timestamptz("expires_at").notNull(),
    created_at: timestamptz("created_at").notNull(),
    api_key_id: text("api_key_id"),
  },
  (table) => [
    foreignKey({
      name: "api_key_requests_api_key_fk",
      columns: [table.api_key_id],
      foreignColumns: [api_keys.id],
    }),
    check("api_key_requests_status", sql`${table.status} in ('pending', 'confirmed', 'expired')`),
    check("api_key_requests_sources_array", sql`jsonb_typeof(${table.sources}) = 'array'`),
  ],
);

export const oauth_grants = pgTable(
  "oauth_grants",
  {
    id: text("id").primaryKey(),
    site_write: boolean("site_write").notNull(),
    sources: sourceGrants("sources").notNull(),
    refresh_token_hash: text("refresh_token_hash"),
    rotated_refresh_hashes: jsonb("rotated_refresh_hashes").notNull().default([]),
    refresh_token_payload: jsonb("refresh_token_payload"),
    revoked_at: timestamptz("revoked_at"),
    created_at: timestamptz("created_at").notNull(),
  },
  (table) => [
    check("oauth_grants_sources_array", sql`jsonb_typeof(${table.sources}) = 'array'`),
    check(
      "oauth_grants_refresh_token_hash_format",
      sql`${table.refresh_token_hash} is null or ${table.refresh_token_hash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "oauth_grants_rotated_refresh_hashes_array",
      sql`jsonb_typeof(${table.rotated_refresh_hashes}) = 'array'`,
    ),
  ],
);
