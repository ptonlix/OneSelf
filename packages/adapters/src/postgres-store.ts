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
} from "@oneself/db";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { type PgColumn, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type SourceRow = typeof sources.$inferSelect;
export type SourceInsert = typeof sources.$inferInsert;
export type PageRow = typeof pages.$inferSelect;
export type PageInsert = typeof pages.$inferInsert;
export type PageVersionRow = typeof page_versions.$inferSelect;
export type PageVersionInsert = typeof page_versions.$inferInsert;
export type FileRow = typeof files.$inferSelect;
export type FileInsert = typeof files.$inferInsert;
export type ChunkRow = typeof chunks.$inferSelect;
export type ChunkInsert = typeof chunks.$inferInsert;
export type LinkRow = typeof links.$inferSelect;
export type LinkInsert = typeof links.$inferInsert;
export type TagRow = typeof tags.$inferSelect;
export type TagInsert = typeof tags.$inferInsert;
export type FactRow = typeof facts.$inferSelect;
export type FactInsert = typeof facts.$inferInsert;
export type TimelineRow = typeof timeline_entries.$inferSelect;
export type TimelineInsert = typeof timeline_entries.$inferInsert;
export type SiteReleaseRow = typeof site_releases.$inferSelect;
export type SiteReleaseInsert = typeof site_releases.$inferInsert;
export type SiteFileRow = typeof site_files.$inferSelect;
export type SiteFileInsert = typeof site_files.$inferInsert;
export type SitePointerRow = typeof site_pointers.$inferSelect;
export type SitePointerInsert = typeof site_pointers.$inferInsert;
export type SiteActivationRow = typeof site_activations.$inferSelect;
export type SiteActivationInsert = typeof site_activations.$inferInsert;
export type OwnerRow = typeof owners.$inferSelect;
export type OwnerInsert = typeof owners.$inferInsert;
export type ApiKeyRow = typeof api_keys.$inferSelect;
export type ApiKeyInsert = typeof api_keys.$inferInsert;
export type ApiKeyRequestRow = typeof api_key_requests.$inferSelect;
export type ApiKeyRequestInsert = typeof api_key_requests.$inferInsert;
export type OauthGrantRow = typeof oauth_grants.$inferSelect;
export type OauthGrantInsert = typeof oauth_grants.$inferInsert;

/** `deleted_at` filter. Omitted and `"any"` both return every row. */
export type NullablePresence = "any" | "null" | "not_null";

export type PageListFilter = {
  readonly source?: string;
  readonly slug?: string;
  readonly slug_prefix?: string;
  readonly type?: string;
  readonly visibility?: string;
  readonly deleted_at?: NullablePresence;
  readonly updated_from?: Date;
  readonly updated_to?: Date;
};

export type PageSearch = PageListFilter & {
  readonly text: string;
  readonly limit: number;
  readonly offset?: number;
  /** When set, only these sources can match. An empty list matches nothing. */
  readonly source_ids?: readonly string[];
  readonly active_sources_only?: boolean;
  readonly exclude_hidden?: boolean;
};

export type FileListFilter = {
  readonly page_source?: string | null;
  readonly page_slug?: string | null;
};

export type FactListFilter = {
  readonly source?: string;
  readonly slug?: string;
  readonly id?: string;
  readonly entity?: string;
};

export type LinkListFilter = {
  readonly from_source?: string;
  readonly from_slug?: string;
  readonly to_source?: string;
  readonly to_slug?: string;
};

export type SourcePatch = {
  readonly deleted_at: Date | null;
};

export type FilePagePatch = {
  readonly page_source: string | null;
  readonly page_slug: string | null;
};

export type OwnerPatch = {
  readonly login?: string;
  readonly password_hash?: string;
  readonly must_change_password?: boolean;
};

export type ApiKeyPatch = {
  readonly last_used_at?: Date | null;
  readonly revoked_at?: Date | null;
};

export type ApiKeyRequestPatch = {
  readonly status?: string;
  readonly api_key_id?: string | null;
};

export type OauthGrantPatch = {
  readonly refresh_token_hash?: string | null;
  readonly rotated_refresh_hashes?: unknown;
  readonly refresh_token_payload?: unknown;
  readonly revoked_at?: Date | null;
};

export type SiteActivationPatch = {
  readonly status?: string;
  readonly decided_at?: Date | null;
};

/**
 * Table reads and writes. Callers choose visibility, retention, and version limits.
 * This store does not interpret page rules.
 */
export type PostgresStore = {
  transaction<T>(run: (store: PostgresStore) => Promise<T>): Promise<T>;

  insertSource(row: SourceInsert): Promise<void>;
  findSource(id: string): Promise<SourceRow | null>;
  listSources(): Promise<SourceRow[]>;
  updateSource(id: string, patch: SourcePatch): Promise<void>;
  deleteSource(id: string): Promise<void>;

  upsertPage(row: PageInsert): Promise<void>;
  findPage(source: string, slug: string): Promise<PageRow | null>;
  listPages(filter?: PageListFilter): Promise<PageRow[]>;
  /**
   * Matches type, title, body, and frontmatter text on `pages`.
   * Does not read `chunks`. Does not hide private or deleted rows unless the filter says so.
   */
  searchPages(query: PageSearch): Promise<PageRow[]>;
  deletePage(source: string, slug: string): Promise<void>;

  replaceChunks(source: string, slug: string, rows: readonly ChunkInsert[]): Promise<void>;
  listChunks(source: string, slug: string): Promise<ChunkRow[]>;
  replaceLinks(source: string, slug: string, rows: readonly LinkInsert[]): Promise<void>;
  listLinks(filter?: LinkListFilter): Promise<LinkRow[]>;
  replaceTags(source: string, slug: string, rows: readonly TagInsert[]): Promise<void>;
  listTags(source: string, slug: string): Promise<TagRow[]>;
  replaceFacts(source: string, slug: string, rows: readonly FactInsert[]): Promise<void>;
  listFacts(filter?: FactListFilter): Promise<FactRow[]>;
  replaceTimeline(source: string, slug: string, rows: readonly TimelineInsert[]): Promise<void>;
  listTimeline(source: string, slug: string): Promise<TimelineRow[]>;

  insertPageVersion(row: PageVersionInsert): Promise<PageVersionRow>;
  listPageVersions(source: string, slug: string): Promise<PageVersionRow[]>;
  deletePageVersions(ids: readonly number[]): Promise<void>;

  insertFile(row: FileInsert): Promise<void>;
  findFile(id: string): Promise<FileRow | null>;
  listFiles(filter?: FileListFilter): Promise<FileRow[]>;
  updateFilePage(id: string, patch: FilePagePatch): Promise<void>;

  /** Object keys referenced by pages, versions, and files. Site keys are not included. */
  listReferencedObjectKeys(): Promise<string[]>;

  insertSiteRelease(row: SiteReleaseInsert): Promise<void>;
  findSiteRelease(id: string): Promise<SiteReleaseRow | null>;
  listSiteReleases(): Promise<SiteReleaseRow[]>;
  insertSiteFiles(rows: readonly SiteFileInsert[]): Promise<void>;
  findSiteFile(releaseId: string, path: string): Promise<SiteFileRow | null>;
  listSiteFiles(releaseId: string): Promise<SiteFileRow[]>;
  findSitePointer(): Promise<SitePointerRow | null>;
  upsertSitePointer(row: SitePointerInsert): Promise<void>;
  insertSiteActivation(row: SiteActivationInsert): Promise<void>;
  findSiteActivation(id: string): Promise<SiteActivationRow | null>;
  listSiteActivations(): Promise<SiteActivationRow[]>;
  updateSiteActivation(id: string, patch: SiteActivationPatch): Promise<void>;

  insertOwner(row: OwnerInsert): Promise<void>;
  findOwner(): Promise<OwnerRow | null>;
  updateOwner(patch: OwnerPatch): Promise<void>;

  insertApiKey(row: ApiKeyInsert): Promise<void>;
  findApiKey(id: string): Promise<ApiKeyRow | null>;
  findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null>;
  listApiKeys(): Promise<ApiKeyRow[]>;
  updateApiKey(id: string, patch: ApiKeyPatch): Promise<void>;

  insertApiKeyRequest(row: ApiKeyRequestInsert): Promise<void>;
  findApiKeyRequest(id: string): Promise<ApiKeyRequestRow | null>;
  listApiKeyRequests(): Promise<ApiKeyRequestRow[]>;
  updateApiKeyRequest(id: string, patch: ApiKeyRequestPatch): Promise<void>;

  insertOauthGrant(row: OauthGrantInsert): Promise<void>;
  findOauthGrant(id: string): Promise<OauthGrantRow | null>;
  listOauthGrants(): Promise<OauthGrantRow[]>;
  updateOauthGrant(id: string, patch: OauthGrantPatch): Promise<void>;
};

export type PostgresHandle = {
  readonly store: PostgresStore;
  close(): Promise<void>;
};

export function openPostgres(databaseUrl: string): PostgresHandle {
  const client = postgres(databaseUrl);
  const db = drizzle(client);
  return {
    store: createPostgresStore(db),
    close() {
      return client.end();
    },
  };
}

function createPostgresStore<TResult extends PgQueryResultHKT>(
  db: PgDatabase<TResult>,
): PostgresStore {
  const pageKey = (source: string, slug: string) =>
    and(eq(pages.source, source), eq(pages.slug, slug));

  return {
    transaction(run) {
      return db.transaction((tx) => run(createPostgresStore(tx)));
    },

    async insertSource(row) {
      await db.insert(sources).values(row);
    },
    findSource(id) {
      return first(db.select().from(sources).where(eq(sources.id, id)).limit(1));
    },
    listSources() {
      return db.select().from(sources).orderBy(asc(sources.id));
    },
    async updateSource(id, patch) {
      await db.update(sources).set(patch).where(eq(sources.id, id));
    },
    async deleteSource(id) {
      await db.delete(sources).where(eq(sources.id, id));
    },

    async upsertPage(row) {
      await db
        .insert(pages)
        .values(row)
        .onConflictDoUpdate({
          target: [pages.source, pages.slug],
          set: {
            type: sql`excluded.type`,
            title: sql`excluded.title`,
            visibility: sql`excluded.visibility`,
            frontmatter: sql`excluded.frontmatter`,
            body: sql`excluded.body`,
            content_hash: sql`excluded.content_hash`,
            object_key: sql`excluded.object_key`,
            updated_at: sql`excluded.updated_at`,
            deleted_at: sql`excluded.deleted_at`,
            hidden_by_source: sql`excluded.hidden_by_source`,
          },
        });
    },
    findPage(source, slug) {
      return first(db.select().from(pages).where(pageKey(source, slug)).limit(1));
    },
    listPages(filter) {
      return db
        .select()
        .from(pages)
        .where(whereAnd(pageFilterClauses(filter)))
        .orderBy(asc(pages.source), asc(pages.slug));
    },
    searchPages(query) {
      if (query.source_ids !== undefined && query.source_ids.length === 0) {
        return Promise.resolve([]);
      }
      const clauses = pageFilterClauses(query);
      const text = textClause(query.text);
      if (text !== undefined) {
        clauses.push(text);
      }
      if (query.source_ids !== undefined) {
        clauses.push(inArray(pages.source, [...query.source_ids]));
      }
      if (query.exclude_hidden === true) {
        clauses.push(eq(pages.hidden_by_source, false));
      }
      if (query.active_sources_only === true) {
        clauses.push(
          sql`${pages.source} in (select ${sources.id} from ${sources} where ${sources.deleted_at} is null)`,
        );
      }
      const filtered = db
        .select()
        .from(pages)
        .where(whereAnd(clauses))
        .orderBy(asc(pages.source), asc(pages.slug))
        .limit(query.limit);
      if (query.offset === undefined) {
        return filtered;
      }
      return filtered.offset(query.offset);
    },
    async deletePage(source, slug) {
      await db.transaction(async (tx) => {
        const key = and(eq(chunks.source, source), eq(chunks.slug, slug));
        await tx.delete(chunks).where(key);
        await tx.delete(facts).where(and(eq(facts.source, source), eq(facts.slug, slug)));
        await tx.delete(links).where(and(eq(links.from_source, source), eq(links.from_slug, slug)));
        await tx.delete(tags).where(and(eq(tags.source, source), eq(tags.slug, slug)));
        await tx
          .delete(timeline_entries)
          .where(and(eq(timeline_entries.source, source), eq(timeline_entries.slug, slug)));
        await tx
          .delete(page_versions)
          .where(and(eq(page_versions.source, source), eq(page_versions.slug, slug)));
        await tx.delete(pages).where(pageKey(source, slug));
      });
    },

    async replaceChunks(source, slug, rows) {
      await db.transaction(async (tx) => {
        await tx.delete(chunks).where(and(eq(chunks.source, source), eq(chunks.slug, slug)));
        if (rows.length > 0) {
          await tx.insert(chunks).values([...rows]);
        }
      });
    },
    listChunks(source, slug) {
      return db
        .select()
        .from(chunks)
        .where(and(eq(chunks.source, source), eq(chunks.slug, slug)))
        .orderBy(asc(chunks.ordinal));
    },
    async replaceLinks(source, slug, rows) {
      await db.transaction(async (tx) => {
        await tx.delete(links).where(and(eq(links.from_source, source), eq(links.from_slug, slug)));
        if (rows.length > 0) {
          await tx.insert(links).values([...rows]);
        }
      });
    },
    listLinks(filter) {
      return db
        .select()
        .from(links)
        .where(whereAnd(linkFilterClauses(filter)))
        .orderBy(
          asc(links.from_source),
          asc(links.from_slug),
          asc(links.to_source),
          asc(links.to_slug),
        );
    },
    async replaceTags(source, slug, rows) {
      await db.transaction(async (tx) => {
        await tx.delete(tags).where(and(eq(tags.source, source), eq(tags.slug, slug)));
        if (rows.length > 0) {
          await tx.insert(tags).values([...rows]);
        }
      });
    },
    listTags(source, slug) {
      return db
        .select()
        .from(tags)
        .where(and(eq(tags.source, source), eq(tags.slug, slug)))
        .orderBy(asc(tags.tag));
    },
    async replaceFacts(source, slug, rows) {
      await db.transaction(async (tx) => {
        await tx.delete(facts).where(and(eq(facts.source, source), eq(facts.slug, slug)));
        if (rows.length > 0) {
          await tx.insert(facts).values([...rows]);
        }
      });
    },
    listFacts(filter) {
      return db
        .select()
        .from(facts)
        .where(whereAnd(factFilterClauses(filter)))
        .orderBy(asc(facts.source), asc(facts.slug), asc(facts.id));
    },
    async replaceTimeline(source, slug, rows) {
      await db.transaction(async (tx) => {
        await tx
          .delete(timeline_entries)
          .where(and(eq(timeline_entries.source, source), eq(timeline_entries.slug, slug)));
        if (rows.length > 0) {
          await tx.insert(timeline_entries).values([...rows]);
        }
      });
    },
    listTimeline(source, slug) {
      return db
        .select()
        .from(timeline_entries)
        .where(and(eq(timeline_entries.source, source), eq(timeline_entries.slug, slug)))
        .orderBy(asc(timeline_entries.ordinal));
    },

    async insertPageVersion(row) {
      const inserted = await db.insert(page_versions).values(row).returning();
      const version = inserted[0];
      if (version === undefined) {
        throw new Error("page version insert did not return a row");
      }
      return version;
    },
    listPageVersions(source, slug) {
      return db
        .select()
        .from(page_versions)
        .where(and(eq(page_versions.source, source), eq(page_versions.slug, slug)))
        .orderBy(asc(page_versions.id));
    },
    async deletePageVersions(ids) {
      if (ids.length === 0) {
        return;
      }
      await db.delete(page_versions).where(inArray(page_versions.id, [...ids]));
    },

    async insertFile(row) {
      await db.insert(files).values(row);
    },
    findFile(id) {
      return first(db.select().from(files).where(eq(files.id, id)).limit(1));
    },
    listFiles(filter) {
      return db
        .select()
        .from(files)
        .where(whereAnd(fileFilterClauses(filter)))
        .orderBy(asc(files.id));
    },
    async updateFilePage(id, patch) {
      await db.update(files).set(patch).where(eq(files.id, id));
    },

    async listReferencedObjectKeys() {
      const pageRows = await db.select({ key: pages.object_key }).from(pages);
      const versionRows = await db.select({ key: page_versions.object_key }).from(page_versions);
      const fileRows = await db.select({ key: files.object_key }).from(files);
      return [...new Set([...pageRows, ...versionRows, ...fileRows].map((row) => row.key))];
    },

    async insertSiteRelease(row) {
      await db.insert(site_releases).values(row);
    },
    findSiteRelease(id) {
      return first(db.select().from(site_releases).where(eq(site_releases.id, id)).limit(1));
    },
    listSiteReleases() {
      return db.select().from(site_releases).orderBy(asc(site_releases.id));
    },
    async insertSiteFiles(rows) {
      if (rows.length === 0) {
        return;
      }
      await db.insert(site_files).values([...rows]);
    },
    findSiteFile(releaseId, path) {
      return first(
        db
          .select()
          .from(site_files)
          .where(and(eq(site_files.release_id, releaseId), eq(site_files.path, path)))
          .limit(1),
      );
    },
    listSiteFiles(releaseId) {
      return db
        .select()
        .from(site_files)
        .where(eq(site_files.release_id, releaseId))
        .orderBy(asc(site_files.path));
    },
    findSitePointer() {
      return first(db.select().from(site_pointers).limit(1));
    },
    async upsertSitePointer(row) {
      await db
        .insert(site_pointers)
        .values(row)
        .onConflictDoUpdate({
          target: site_pointers.id,
          set: { release_id: sql`excluded.release_id` },
        });
    },
    async insertSiteActivation(row) {
      await db.insert(site_activations).values(row);
    },
    findSiteActivation(id) {
      return first(db.select().from(site_activations).where(eq(site_activations.id, id)).limit(1));
    },
    listSiteActivations() {
      return db.select().from(site_activations).orderBy(asc(site_activations.created_at));
    },
    async updateSiteActivation(id, patch) {
      const set = definedPatch(patch);
      if (set === undefined) {
        return;
      }
      await db.update(site_activations).set(set).where(eq(site_activations.id, id));
    },

    async insertOwner(row) {
      await db.insert(owners).values(row);
    },
    findOwner() {
      return first(db.select().from(owners).limit(1));
    },
    async updateOwner(patch) {
      const set = definedPatch(patch);
      if (set === undefined) {
        return;
      }
      await db.update(owners).set(set);
    },

    async insertApiKey(row) {
      await db.insert(api_keys).values(row);
    },
    findApiKey(id) {
      return first(db.select().from(api_keys).where(eq(api_keys.id, id)).limit(1));
    },
    findApiKeyByHash(keyHash) {
      return first(db.select().from(api_keys).where(eq(api_keys.key_hash, keyHash)).limit(1));
    },
    listApiKeys() {
      return db.select().from(api_keys).orderBy(asc(api_keys.created_at), asc(api_keys.id));
    },
    async updateApiKey(id, patch) {
      const set = definedPatch(patch);
      if (set === undefined) {
        return;
      }
      await db.update(api_keys).set(set).where(eq(api_keys.id, id));
    },

    async insertApiKeyRequest(row) {
      await db.insert(api_key_requests).values(row);
    },
    findApiKeyRequest(id) {
      return first(db.select().from(api_key_requests).where(eq(api_key_requests.id, id)).limit(1));
    },
    listApiKeyRequests() {
      return db
        .select()
        .from(api_key_requests)
        .orderBy(asc(api_key_requests.created_at), asc(api_key_requests.id));
    },
    async updateApiKeyRequest(id, patch) {
      const set = definedPatch(patch);
      if (set === undefined) {
        return;
      }
      await db.update(api_key_requests).set(set).where(eq(api_key_requests.id, id));
    },

    async insertOauthGrant(row) {
      await db.insert(oauth_grants).values(row);
    },
    findOauthGrant(id) {
      return first(db.select().from(oauth_grants).where(eq(oauth_grants.id, id)).limit(1));
    },
    listOauthGrants() {
      return db
        .select()
        .from(oauth_grants)
        .orderBy(asc(oauth_grants.created_at), asc(oauth_grants.id));
    },
    async updateOauthGrant(id, patch) {
      const set = definedPatch(patch);
      if (set === undefined) {
        return;
      }
      await db.update(oauth_grants).set(set).where(eq(oauth_grants.id, id));
    },
  };
}

function first<T>(query: Promise<T[]>): Promise<T | null> {
  return query.then((rows) => rows[0] ?? null);
}

function whereAnd(clauses: readonly SQL[]): SQL | undefined {
  if (clauses.length === 0) {
    return undefined;
  }
  return and(...clauses);
}

function pageFilterClauses(filter: PageListFilter | undefined): SQL[] {
  if (filter === undefined) {
    return [];
  }
  const clauses: SQL[] = [];
  if (filter.source !== undefined) {
    clauses.push(eq(pages.source, filter.source));
  }
  if (filter.slug !== undefined) {
    clauses.push(eq(pages.slug, filter.slug));
  }
  if (filter.slug_prefix !== undefined) {
    clauses.push(sql`${pages.slug} LIKE ${`${escapeLike(filter.slug_prefix)}%`}`);
  }
  if (filter.type !== undefined) {
    clauses.push(eq(pages.type, filter.type));
  }
  if (filter.visibility !== undefined) {
    clauses.push(eq(pages.visibility, filter.visibility));
  }
  const deleted = nullablePresence(pages.deleted_at, filter.deleted_at);
  if (deleted !== undefined) {
    clauses.push(deleted);
  }
  if (filter.updated_from !== undefined) {
    clauses.push(gte(pages.updated_at, filter.updated_from));
  }
  if (filter.updated_to !== undefined) {
    clauses.push(lte(pages.updated_at, filter.updated_to));
  }
  return clauses;
}

export function pageSearchTextClause(text: string): SQL | undefined {
  return textClause(text);
}

function textClause(text: string): SQL | undefined {
  if (text === "") {
    return undefined;
  }
  const pattern = `%${escapeLike(text)}%`;
  const like = (expression: SQL) => sql`${expression} LIKE ${pattern} ESCAPE '\\'`;
  return or(
    like(sql`${pages.type}`),
    like(sql`${pages.title}`),
    like(sql`${pages.body}`),
    sql`exists (
      select 1
      from jsonb_each(${pages.frontmatter}) as entry(key, value)
      where (
        jsonb_typeof(entry.value) = 'string'
        and (entry.value #>> '{}') like ${pattern} escape '\\'
      ) or (
        jsonb_typeof(entry.value) = 'array'
        and exists (
          select 1
          from jsonb_array_elements(entry.value) as item(value)
          where jsonb_typeof(item.value) = 'string'
            and (item.value #>> '{}') like ${pattern} escape '\\'
        )
      )
    )`,
  );
}

function linkFilterClauses(filter: LinkListFilter | undefined): SQL[] {
  if (filter === undefined) {
    return [];
  }
  const clauses: SQL[] = [];
  if (filter.from_source !== undefined) {
    clauses.push(eq(links.from_source, filter.from_source));
  }
  if (filter.from_slug !== undefined) {
    clauses.push(eq(links.from_slug, filter.from_slug));
  }
  if (filter.to_source !== undefined) {
    clauses.push(eq(links.to_source, filter.to_source));
  }
  if (filter.to_slug !== undefined) {
    clauses.push(eq(links.to_slug, filter.to_slug));
  }
  return clauses;
}

function factFilterClauses(filter: FactListFilter | undefined): SQL[] {
  if (filter === undefined) {
    return [];
  }
  const clauses: SQL[] = [];
  if (filter.source !== undefined) {
    clauses.push(eq(facts.source, filter.source));
  }
  if (filter.slug !== undefined) {
    clauses.push(eq(facts.slug, filter.slug));
  }
  if (filter.id !== undefined) {
    clauses.push(eq(facts.id, filter.id));
  }
  if (filter.entity !== undefined) {
    clauses.push(eq(facts.entity, filter.entity));
  }
  return clauses;
}

function fileFilterClauses(filter: FileListFilter | undefined): SQL[] {
  if (filter === undefined) {
    return [];
  }
  const clauses: SQL[] = [];
  const source = nullableEqual(files.page_source, filter.page_source);
  if (source !== undefined) {
    clauses.push(source);
  }
  const slug = nullableEqual(files.page_slug, filter.page_slug);
  if (slug !== undefined) {
    clauses.push(slug);
  }
  return clauses;
}

function nullableEqual(column: PgColumn, value: string | null | undefined): SQL | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return isNull(column);
  }
  return eq(column, value);
}

function nullablePresence(column: PgColumn, value: NullablePresence | undefined): SQL | undefined {
  if (value === "null") {
    return isNull(column);
  }
  if (value === "not_null") {
    return isNotNull(column);
  }
  return undefined;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function definedPatch<T extends Record<string, unknown>>(patch: T): Partial<T> | undefined {
  const entries = Object.entries(patch).filter((entry) => entry[1] !== undefined);
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries) as Partial<T>;
}
