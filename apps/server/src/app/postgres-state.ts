import type {
  ApiKeyInsert,
  ApiKeyRequestInsert,
  OauthGrantInsert,
  PostgresStore,
} from "@oneself/adapters";
import {
  emptyDomainState,
  sha256Hex,
  type DomainState,
  type PageRecord,
  type PageVersion,
  type SiteActivationRecord,
  type SiteActivationStatus,
  type SourceGrant,
  type StoredObject,
} from "@oneself/domain";
import type { ObjectStore } from "@oneself/ports";

/**
 * Rows behind the in-memory projection.
 * Markdown bytes stay in the object store; page rows only point at them.
 * Sessions, device codes, authorization codes, access tokens, and rotated
 * refresh hashes are absent from PostgresStore, so Runtime keeps those in memory.
 */
export type OwnerRecord = {
  login: string;
  passwordHash: string;
  mustChangePassword: boolean;
};

export type ApiKeyRecord = {
  id: string;
  keyHash: string;
  label: string;
  unrestrictedData: boolean;
  siteWrite: boolean;
  sources: SourceGrant[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type ApiKeyRequestRecord = {
  id: string;
  label: string;
  unrestrictedData: boolean;
  siteWrite: boolean;
  sources: SourceGrant[];
  status: "pending" | "confirmed" | "expired";
  expiresAt: string;
  createdAt: string;
  apiKeyId: string | null;
};

export type AccessTokenRecord = {
  hash: string;
  expiresAt: string;
};

export type OauthGrantRecord = {
  id: string;
  siteWrite: boolean;
  sources: SourceGrant[];
  refreshTokenHash: string | null;
  rotatedRefreshHashes: string[];
  revokedAt: string | null;
  createdAt: string;
  accessTokens: AccessTokenRecord[];
};

export type SiteFileRecord = {
  releaseId: string;
  path: string;
  objectKey: string;
};

export type LoadedProjection = {
  readonly state: DomainState;
  readonly owner: OwnerRecord | null;
  readonly apiKeys: ApiKeyRecord[];
  readonly apiKeyRequests: ApiKeyRequestRecord[];
  readonly grants: OauthGrantRecord[];
  readonly siteFiles: SiteFileRecord[];
};

type Frontmatter = PageRecord["frontmatter"];
type FrontmatterValue = Frontmatter[string];

export async function loadProjection(
  store: PostgresStore,
  objectStore: ObjectStore,
): Promise<LoadedProjection> {
  const sourceRows = await store.listSources();
  const pageRows = await store.listPages();
  const fileRows = await store.listFiles();
  const linkRows = await store.listLinks();
  const factRows = await store.listFacts();
  const releaseRows = await store.listSiteReleases();
  const activationRows = await store.listSiteActivations();
  const pointer = await store.findSitePointer();
  const owner = await store.findOwner();
  const apiKeyRows = await store.listApiKeys();
  const requestRows = await store.listApiKeyRequests();
  const grantRows = await store.listOauthGrants();

  const links = groupBy(linkRows, (row) => pageKey(row.from_source, row.from_slug));
  const facts = groupBy(factRows, (row) => pageKey(row.source, row.slug));
  const objects = new Map<string, StoredObject>();
  const pages: PageRecord[] = [];
  const versions: PageVersion[] = [];

  for (const row of pageRows) {
    const key = pageKey(row.source, row.slug);
    const markdown = await readMarkdown(objectStore, objects, row.object_key, row.content_hash);
    const chunks = await store.listChunks(row.source, row.slug);
    const tags = await store.listTags(row.source, row.slug);
    const timeline = await store.listTimeline(row.source, row.slug);
    const pageVersions = await store.listPageVersions(row.source, row.slug);
    pages.push({
      source: row.source,
      slug: row.slug,
      type: row.type,
      title: row.title,
      visibility: asVisibility(row.visibility),
      frontmatter: asFrontmatter(row.frontmatter),
      body: row.body,
      markdown,
      contentHash: row.content_hash,
      objectKey: row.object_key,
      updatedAt: iso(row.updated_at),
      deletedAt: row.deleted_at === null ? null : iso(row.deleted_at),
      hiddenBySource: row.hidden_by_source,
      chunks: chunks.map((chunk) => ({ ordinal: chunk.ordinal, body: chunk.body })),
      links: (links.get(key) ?? []).map((link) => ({
        toSource: link.to_source,
        toSlug: link.to_slug,
      })),
      tags: tags.map((tag) => tag.tag),
      facts: (facts.get(key) ?? []).map((fact) => ({
        id: fact.id,
        entity: fact.entity,
        statement: fact.statement,
        confidence: asConfidence(fact.confidence),
        validUntil: fact.valid_until,
      })),
      timeline: timeline.map((entry) => ({
        ordinal: entry.ordinal,
        occurredOn: entry.occurred_on,
        title: entry.title,
        detail: entry.detail,
      })),
    });
    for (const version of pageVersions) {
      await readMarkdown(objectStore, objects, version.object_key, version.content_hash);
      versions.push({
        id: version.id,
        source: version.source,
        slug: version.slug,
        contentHash: version.content_hash,
        objectKey: version.object_key,
        frontmatter: asFrontmatter(version.frontmatter),
        writtenAt: iso(version.written_at),
      });
    }
  }

  const siteFiles: SiteFileRecord[] = [];
  for (const release of releaseRows) {
    const files = await store.listSiteFiles(release.id);
    for (const file of files) {
      siteFiles.push({
        releaseId: file.release_id,
        path: file.path,
        objectKey: file.object_key,
      });
    }
  }

  const state = emptyDomainState();
  state.sources = sourceRows.map((source) => ({
    id: source.id,
    deletedAt: source.deleted_at === null ? null : iso(source.deleted_at),
  }));
  state.pages = pages;
  state.versions = versions;
  state.objects = [...objects.values()];
  state.files = fileRows.map((file) => ({
    id: file.id,
    objectKey: file.object_key,
    mediaType: file.media_type,
    byteSize: file.byte_size,
    sha256: file.sha256,
    pageSource: file.page_source,
    pageSlug: file.page_slug,
    createdAt: iso(file.created_at),
  }));
  state.site = {
    pointer: { releaseId: pointer?.release_id ?? "original" },
    releases: releaseRows.map((release) => ({
      id: release.id,
      createdAt: iso(release.created_at),
    })),
    activations: activationRows.map((activation) => ({
      id: activation.id,
      releaseId: activation.release_id,
      status: asActivationStatus(activation.status),
      expiresAt: iso(activation.expires_at),
      createdAt: iso(activation.created_at),
      decidedAt: activation.decided_at === null ? null : iso(activation.decided_at),
    })),
  };

  return {
    state,
    owner:
      owner === null
        ? null
        : {
            login: owner.login,
            passwordHash: owner.password_hash,
            mustChangePassword: owner.must_change_password,
          },
    apiKeys: apiKeyRows.map((key) => ({
      id: key.id,
      keyHash: key.key_hash,
      label: key.label,
      unrestrictedData: key.unrestricted_data,
      siteWrite: key.site_write,
      sources: copyGrants(key.sources),
      createdAt: iso(key.created_at),
      lastUsedAt: key.last_used_at === null ? null : iso(key.last_used_at),
      revokedAt: key.revoked_at === null ? null : iso(key.revoked_at),
    })),
    apiKeyRequests: requestRows.map((request) => ({
      id: request.id,
      label: request.label,
      unrestrictedData: request.unrestricted_data,
      siteWrite: request.site_write,
      sources: copyGrants(request.sources),
      status: asRequestStatus(request.status),
      expiresAt: iso(request.expires_at),
      createdAt: iso(request.created_at),
      apiKeyId: request.api_key_id,
    })),
    grants: grantRows.map((grant) => ({
      id: grant.id,
      siteWrite: grant.site_write,
      sources: copyGrants(grant.sources),
      refreshTokenHash: grant.refresh_token_hash,
      rotatedRefreshHashes: [],
      revokedAt: grant.revoked_at === null ? null : iso(grant.revoked_at),
      createdAt: iso(grant.created_at),
      accessTokens: [],
    })),
    siteFiles,
  };
}

/**
 * Writes the projection diff inside the caller's transaction.
 * Version ids come from Postgres, so the returned state replaces temporary ids.
 */
export async function saveDomain(
  store: PostgresStore,
  previous: DomainState,
  next: DomainState,
): Promise<DomainState> {
  const previousSources = new Map(previous.sources.map((source) => [source.id, source]));
  const nextSources = new Map(next.sources.map((source) => [source.id, source]));
  for (const source of next.sources) {
    if (!previousSources.has(source.id)) {
      await store.insertSource({ id: source.id, deleted_at: dateOrNull(source.deletedAt) });
    }
  }

  const previousPages = new Map(
    previous.pages.map((page) => [pageKey(page.source, page.slug), page]),
  );
  const nextPages = new Map(next.pages.map((page) => [pageKey(page.source, page.slug), page]));
  for (const [key, page] of nextPages) {
    const before = previousPages.get(key);
    if (before !== undefined && pageSignature(before) === pageSignature(page)) {
      continue;
    }
    await store.upsertPage({
      source: page.source,
      slug: page.slug,
      type: page.type,
      title: page.title,
      visibility: page.visibility,
      frontmatter: page.frontmatter,
      body: page.body,
      content_hash: page.contentHash,
      object_key: page.objectKey,
      updated_at: new Date(page.updatedAt),
      deleted_at: dateOrNull(page.deletedAt),
      hidden_by_source: page.hiddenBySource,
    });
    await store.replaceChunks(
      page.source,
      page.slug,
      page.chunks.map((chunk) => ({
        source: page.source,
        slug: page.slug,
        ordinal: chunk.ordinal,
        body: chunk.body,
      })),
    );
    await store.replaceLinks(
      page.source,
      page.slug,
      page.links.map((link) => ({
        from_source: page.source,
        from_slug: page.slug,
        to_source: link.toSource,
        to_slug: link.toSlug,
      })),
    );
    await store.replaceTags(
      page.source,
      page.slug,
      page.tags.map((tag) => ({ source: page.source, slug: page.slug, tag })),
    );
    await store.replaceFacts(
      page.source,
      page.slug,
      page.facts.map((fact) => ({
        source: page.source,
        slug: page.slug,
        id: fact.id,
        entity: fact.entity,
        statement: fact.statement,
        confidence: fact.confidence === null ? null : String(fact.confidence),
        valid_until: fact.validUntil,
      })),
    );
    await store.replaceTimeline(
      page.source,
      page.slug,
      page.timeline.map((entry) => ({
        source: page.source,
        slug: page.slug,
        ordinal: entry.ordinal,
        occurred_on: entry.occurredOn,
        title: entry.title,
        detail: entry.detail,
      })),
    );
  }

  const previousVersionIds = new Set(previous.versions.map((version) => version.id));
  const nextVersionIds = new Set(next.versions.map((version) => version.id));
  const added = next.versions
    .filter((version) => !previousVersionIds.has(version.id))
    .sort((left, right) => left.id - right.id);
  const idMap = new Map<number, number>();
  for (const version of added) {
    const inserted = await store.insertPageVersion({
      source: version.source,
      slug: version.slug,
      content_hash: version.contentHash,
      object_key: version.objectKey,
      frontmatter: version.frontmatter,
      written_at: new Date(version.writtenAt),
    });
    idMap.set(version.id, inserted.id);
  }
  const removedVersionIds = previous.versions
    .filter((version) => !nextVersionIds.has(version.id))
    .map((version) => version.id);
  await store.deletePageVersions(removedVersionIds);

  const previousFiles = new Map(previous.files.map((file) => [file.id, file]));
  const nextFileIds = new Set(next.files.map((file) => file.id));
  for (const file of previous.files) {
    if (!nextFileIds.has(file.id)) {
      throw new Error("PostgresStore has no deleteFile");
    }
  }
  for (const file of next.files) {
    const before = previousFiles.get(file.id);
    if (before === undefined) {
      await store.insertFile({
        id: file.id,
        object_key: file.objectKey,
        media_type: file.mediaType,
        byte_size: file.byteSize,
        sha256: file.sha256,
        page_source: file.pageSource,
        page_slug: file.pageSlug,
        created_at: new Date(file.createdAt),
      });
      continue;
    }
    if (before.pageSource !== file.pageSource || before.pageSlug !== file.pageSlug) {
      await store.updateFilePage(file.id, {
        page_source: file.pageSource,
        page_slug: file.pageSlug,
      });
    }
  }

  for (const [key, page] of previousPages) {
    if (!nextPages.has(key)) {
      await store.deletePage(page.source, page.slug);
    }
  }
  for (const source of next.sources) {
    const before = previousSources.get(source.id);
    if (before !== undefined && before.deletedAt !== source.deletedAt) {
      await store.updateSource(source.id, { deleted_at: dateOrNull(source.deletedAt) });
    }
  }
  for (const source of previous.sources) {
    if (!nextSources.has(source.id)) {
      await store.deleteSource(source.id);
    }
  }

  const nextReleaseIds = new Set(next.site.releases.map((release) => release.id));
  for (const release of previous.site.releases) {
    if (!nextReleaseIds.has(release.id)) {
      throw new Error("PostgresStore has no deleteSiteRelease");
    }
  }
  const previousReleaseIds = new Set(previous.site.releases.map((release) => release.id));
  for (const release of next.site.releases) {
    if (!previousReleaseIds.has(release.id)) {
      await store.insertSiteRelease({ id: release.id, created_at: new Date(release.createdAt) });
    }
  }
  if (previous.site.pointer.releaseId !== next.site.pointer.releaseId) {
    await store.upsertSitePointer({ id: 1, release_id: next.site.pointer.releaseId });
  }

  const previousActivations = new Map(
    previous.site.activations.map((activation) => [activation.id, activation]),
  );
  const nextActivationIds = new Set(next.site.activations.map((activation) => activation.id));
  for (const activation of previous.site.activations) {
    if (!nextActivationIds.has(activation.id)) {
      throw new Error("PostgresStore has no deleteSiteActivation");
    }
  }
  for (const activation of next.site.activations) {
    const before = previousActivations.get(activation.id);
    if (before === undefined) {
      await store.insertSiteActivation({
        id: activation.id,
        release_id: activation.releaseId,
        status: activation.status,
        expires_at: new Date(activation.expiresAt),
        created_at: new Date(activation.createdAt),
        decided_at: dateOrNull(activation.decidedAt),
      });
      continue;
    }
    if (activationChanged(before, activation)) {
      await store.updateSiteActivation(activation.id, {
        status: activation.status,
        decided_at: dateOrNull(activation.decidedAt),
      });
    }
  }

  if (idMap.size === 0) {
    return next;
  }
  return {
    ...next,
    versions: next.versions.map((version) => {
      const id = idMap.get(version.id);
      return id === undefined ? version : { ...version, id };
    }),
  };
}

export function apiKeyInsert(record: ApiKeyRecord): ApiKeyInsert {
  return {
    id: record.id,
    key_hash: record.keyHash,
    label: record.label,
    unrestricted_data: record.unrestrictedData,
    site_write: record.siteWrite,
    sources: copyGrants(record.sources),
    created_at: new Date(record.createdAt),
    last_used_at: dateOrNull(record.lastUsedAt),
    revoked_at: dateOrNull(record.revokedAt),
  };
}

export function apiKeyRequestInsert(record: ApiKeyRequestRecord): ApiKeyRequestInsert {
  return {
    id: record.id,
    label: record.label,
    unrestricted_data: record.unrestrictedData,
    site_write: record.siteWrite,
    sources: copyGrants(record.sources),
    status: record.status,
    expires_at: new Date(record.expiresAt),
    created_at: new Date(record.createdAt),
    api_key_id: record.apiKeyId,
  };
}

export function oauthGrantInsert(record: OauthGrantRecord): OauthGrantInsert {
  return {
    id: record.id,
    site_write: record.siteWrite,
    sources: copyGrants(record.sources),
    refresh_token_hash: record.refreshTokenHash,
    revoked_at: dateOrNull(record.revokedAt),
    created_at: new Date(record.createdAt),
  };
}

function activationChanged(before: SiteActivationRecord, after: SiteActivationRecord): boolean {
  return before.status !== after.status || before.decidedAt !== after.decidedAt;
}

function pageSignature(page: PageRecord): string {
  return JSON.stringify([
    page.type,
    page.title,
    page.visibility,
    page.frontmatter,
    page.body,
    page.contentHash,
    page.objectKey,
    page.updatedAt,
    page.deletedAt,
    page.hiddenBySource,
    page.chunks,
    page.links,
    page.tags,
    page.facts,
    page.timeline,
  ]);
}

async function readMarkdown(
  objectStore: ObjectStore,
  objects: Map<string, StoredObject>,
  key: string,
  hash: string,
): Promise<string> {
  const existing = objects.get(key);
  if (existing !== undefined) {
    return existing.bytes;
  }
  const stored = await objectStore.get(key);
  if (stored === null) {
    throw new Error(`stored object is missing: ${key}`);
  }
  const markdown = new TextDecoder().decode(stored.body);
  if (sha256Hex(markdown) !== hash) {
    throw new Error(`stored object does not match ${hash}`);
  }
  objects.set(key, {
    key,
    bytes: markdown,
    writtenAt: iso(stored.writtenAt),
    kind: "page",
  });
  return markdown;
}

function copyGrants(sources: readonly SourceGrant[]): SourceGrant[] {
  return sources.map((source) => ({
    id: source.id,
    read: source.read,
    write: source.write,
    visibility: source.visibility,
  }));
}

function pageKey(source: string, slug: string): string {
  return `${source}\u0000${slug}`;
}

function iso(value: Date): string {
  return value.toISOString();
}

function dateOrNull(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function asVisibility(value: string): PageRecord["visibility"] {
  if (value === "public" || value === "private") {
    return value;
  }
  throw new Error(`page visibility is invalid: ${value}`);
}

function asActivationStatus(value: string): SiteActivationStatus {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }
  throw new Error(`site activation status is invalid: ${value}`);
}

function asRequestStatus(value: string): ApiKeyRequestRecord["status"] {
  if (value === "pending" || value === "confirmed" || value === "expired") {
    return value;
  }
  throw new Error(`api key request status is invalid: ${value}`);
}

function asConfidence(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    throw new Error("fact confidence is invalid");
  }
  return number;
}

function asFrontmatter(value: unknown): Frontmatter {
  if (!isRecord(value)) {
    throw new Error("page frontmatter is invalid");
  }
  const frontmatter: Record<string, FrontmatterValue> = {};
  for (const [key, item] of Object.entries(value)) {
    frontmatter[key] = asFrontmatterValue(item);
  }
  return frontmatter;
}

function asFrontmatterValue(value: unknown): FrontmatterValue {
  if (isScalar(value)) {
    return value;
  }
  if (Array.isArray(value) && value.every(isScalar)) {
    return value;
  }
  throw new Error("page frontmatter is invalid");
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = groups.get(id);
    if (list === undefined) {
      groups.set(id, [row]);
    } else {
      list.push(row);
    }
  }
  return groups;
}
