import { knowsSource, sourceFlags, type Credential } from "./access.ts";
import { isPastRetention, SOFT_DELETE_RETENTION_MS, timestampMs } from "./clock.ts";
import { pageObjectKey, sha256Hex } from "./hash.ts";
import { isSlug, isSourceName } from "./identity.ts";
import type { PageProjection, Visibility } from "./markdown.ts";
import { projectMarkdown } from "./markdown.ts";
import { fail, ok, type DomainResult } from "./result.ts";
import {
  VERSION_LIMIT,
  cloneState,
  type DomainState,
  type PageRecord,
  type PageVersion,
  type StoredFile,
} from "./state.ts";

export type CommandContext = {
  readonly credential: Credential;
  readonly now: string;
};

export type PutPageInput = {
  readonly source: string;
  readonly slug: string;
  readonly markdown: string;
  readonly hash?: string;
};

export type PageEdit = {
  readonly search: string;
  readonly replace: string;
};

export type PageWrite = {
  readonly state: DomainState;
  readonly source: string;
  readonly slug: string;
  readonly hash: string;
};

export type PageView = {
  readonly source: string;
  readonly slug: string;
  readonly type: string;
  readonly title: string;
  readonly visibility: Visibility;
  readonly frontmatter: PageRecord["frontmatter"];
  readonly markdown: string;
  readonly hash: string;
};

export type PublicPageView = {
  readonly source: string;
  readonly slug: string;
  readonly type: string;
  readonly title: string;
  readonly visibility: "public";
  readonly frontmatter: PageRecord["frontmatter"];
  readonly markdown: string;
  readonly hash: string;
};

export type PageListItem = {
  readonly source: string;
  readonly slug: string;
  readonly type: string;
  readonly title: string;
  readonly visibility: Visibility;
  readonly updatedAt: string;
};

export type ListPagesQuery = {
  readonly source?: string;
  readonly type?: string;
  readonly prefix?: string;
};

export type SlugResolution = {
  readonly source: string;
  readonly slug: string;
  readonly exists: boolean;
};

export type VersionView = {
  readonly hash: string;
  readonly objectKey: string;
  readonly frontmatter: PageRecord["frontmatter"];
  readonly writtenAt: string;
};

export function putPage(
  state: DomainState,
  context: CommandContext,
  input: PutPageInput,
): DomainResult<PageWrite> {
  const prepared = preparePut(state, context, input);
  if (!prepared.ok) {
    return prepared;
  }
  return ok(commitWrite(state, context.now, prepared.value));
}

export function putPages(
  state: DomainState,
  context: CommandContext,
  pages: readonly PutPageInput[],
): DomainResult<{ state: DomainState; pages: readonly PageWrite[] }> {
  let draft = state;
  const written: PageWrite[] = [];
  for (const page of pages) {
    const result = putPage(draft, context, page);
    if (!result.ok) {
      return result;
    }
    draft = result.value.state;
    written.push(result.value);
  }
  return ok({ state: draft, pages: written });
}

export function editPage(
  state: DomainState,
  context: CommandContext,
  input: {
    readonly source: string;
    readonly slug: string;
    readonly hash: string;
    readonly edits: readonly PageEdit[];
  },
): DomainResult<PageWrite> {
  const located = locateLivePage(state, context, input.source, input.slug);
  if (!located.ok) {
    return located;
  }
  if (input.hash !== located.value.page.contentHash) {
    return fail("conflict", "hash does not match the current page");
  }
  const edited = applyEdits(located.value.page.markdown, input.edits);
  if (!edited.ok) {
    return edited;
  }
  const projected = projectMarkdown(edited.value);
  if (!projected.ok) {
    return projected;
  }
  const visibility = assertVisibilityChange(
    context.credential,
    input.source,
    located.value.page.visibility,
    projected.value.visibility,
  );
  if (!visibility.ok) {
    return visibility;
  }
  const files = assertFiles(state, input.source, input.slug, projected.value.fileIds);
  if (!files.ok) {
    return files;
  }
  return ok(
    commitWrite(state, context.now, {
      source: input.source,
      slug: input.slug,
      markdown: edited.value,
      projection: projected.value,
    }),
  );
}

export function getPage(
  state: DomainState,
  credential: Credential,
  source: string,
  slug: string,
): DomainResult<PageView> {
  const page = readablePage(state, credential, source, slug);
  if (!page.ok) {
    return page;
  }
  return ok(toPageView(page.value));
}

export function readPublicPage(
  state: DomainState,
  source: string,
  slug: string,
): DomainResult<PublicPageView> {
  const page = publiclyReadablePage(state, source, slug);
  if (!page) {
    return fail("not_found", "page not found");
  }
  return ok({
    source: page.source,
    slug: page.slug,
    type: page.type,
    title: page.title,
    visibility: "public",
    frontmatter: page.frontmatter,
    markdown: page.markdown,
    hash: page.contentHash,
  });
}

export function listPages(
  state: DomainState,
  credential: Credential,
  query: ListPagesQuery,
): DomainResult<readonly PageListItem[]> {
  if (credential.kind === "anonymous") {
    return fail("unauthorized", "authentication required");
  }
  if (query.source !== undefined && !isSourceName(query.source)) {
    return fail("invalid", "source is invalid");
  }
  if (query.type !== undefined && !isSourceName(query.type)) {
    return fail("invalid", "type is invalid");
  }
  if (query.prefix !== undefined && query.prefix.length > 0 && !isSlug(query.prefix)) {
    return fail("invalid", "slug prefix is invalid");
  }
  if (query.source !== undefined && !knowsSource(credential, query.source)) {
    return fail("not_found", "source not found");
  }
  const items = state.pages
    .filter((page) => isListed(state, credential, page, query))
    .map((page) => ({
      source: page.source,
      slug: page.slug,
      type: page.type,
      title: page.title,
      visibility: page.visibility,
      updatedAt: page.updatedAt,
    }))
    .sort((left, right) =>
      left.source === right.source
        ? left.slug.localeCompare(right.slug)
        : left.source.localeCompare(right.source),
    );
  return ok(items);
}

export function deletePage(
  state: DomainState,
  context: CommandContext,
  source: string,
  slug: string,
): DomainResult<{ state: DomainState }> {
  const located = locateLivePage(state, context, source, slug);
  if (!located.ok) {
    return located;
  }
  if (timestampMs(context.now) === null) {
    return fail("invalid", "invalid timestamp");
  }
  const next = cloneState(state);
  const page = findPage(next, source, slug);
  if (!page) {
    return fail("not_found", "page not found");
  }
  page.deletedAt = context.now;
  return ok({ state: next });
}

export function restorePage(
  state: DomainState,
  context: CommandContext,
  source: string,
  slug: string,
): DomainResult<{ state: DomainState }> {
  if (timestampMs(context.now) === null) {
    return fail("invalid", "invalid timestamp");
  }
  const access = writeAccess(state, context.credential, source, slug);
  if (!access.ok) {
    return access;
  }
  const page = findPage(state, source, slug);
  if (!page || page.hiddenBySource || page.deletedAt === null) {
    return fail("not_found", "page not found");
  }
  if (isExpired(page.deletedAt, context.now)) {
    return fail("conflict", "restore window has passed");
  }
  const next = cloneState(state);
  const target = findPage(next, source, slug);
  if (!target) {
    return fail("not_found", "page not found");
  }
  target.deletedAt = null;
  return ok({ state: next });
}

export function getVersions(
  state: DomainState,
  credential: Credential,
  source: string,
  slug: string,
): DomainResult<readonly VersionView[]> {
  const page = readablePage(state, credential, source, slug);
  if (!page.ok) {
    return page;
  }
  const versions = state.versions
    .filter((version) => version.source === source && version.slug === slug)
    .sort((left, right) => right.id - left.id)
    .slice(0, VERSION_LIMIT)
    .map((version) => ({
      hash: version.contentHash,
      objectKey: version.objectKey,
      frontmatter: version.frontmatter,
      writtenAt: version.writtenAt,
    }));
  return ok(versions);
}

export function revertPage(
  state: DomainState,
  context: CommandContext,
  input: { readonly source: string; readonly slug: string; readonly hash: string },
): DomainResult<PageWrite> {
  const located = locateLivePage(state, context, input.source, input.slug);
  if (!located.ok) {
    return located;
  }
  const version = latestVersionWithHash(state, input.source, input.slug, input.hash);
  if (!version) {
    return fail("not_found", "version not found");
  }
  const object = state.objects.find(
    (item) => item.key === version.objectKey && item.kind === "page",
  );
  if (!object || sha256Hex(object.bytes) !== input.hash) {
    return fail("not_found", "version object not found");
  }
  const projected = projectMarkdown(object.bytes);
  if (!projected.ok) {
    return projected;
  }
  const visibility = assertVisibilityChange(
    context.credential,
    input.source,
    located.value.page.visibility,
    projected.value.visibility,
  );
  if (!visibility.ok) {
    return visibility;
  }
  const files = assertFiles(state, input.source, input.slug, projected.value.fileIds);
  if (!files.ok) {
    return files;
  }
  return ok(
    commitWrite(state, context.now, {
      source: input.source,
      slug: input.slug,
      markdown: object.bytes,
      projection: projected.value,
    }),
  );
}

export function resolveSlugs(
  state: DomainState,
  credential: Credential,
  slugs: readonly { readonly source: string; readonly slug: string }[],
): DomainResult<readonly SlugResolution[]> {
  if (credential.kind === "anonymous") {
    return fail("unauthorized", "authentication required");
  }
  return ok(
    slugs.map((item) => ({
      source: item.source,
      slug: item.slug,
      exists: readablePage(state, credential, item.source, item.slug).ok,
    })),
  );
}

type PreparedWrite = {
  readonly source: string;
  readonly slug: string;
  readonly markdown: string;
  readonly projection: PageProjection;
};

function preparePut(
  state: DomainState,
  context: CommandContext,
  input: PutPageInput,
): DomainResult<PreparedWrite> {
  if (context.credential.kind === "anonymous") {
    return fail("unauthorized", "authentication required");
  }
  if (timestampMs(context.now) === null) {
    return fail("invalid", "invalid timestamp");
  }
  if (!isSourceName(input.source)) {
    return fail("invalid", "source is invalid");
  }
  if (!isSlug(input.slug)) {
    return fail("invalid", "slug is invalid");
  }
  const source = state.sources.find((item) => item.id === input.source);
  if (!source || source.deletedAt !== null) {
    return fail("not_found", "source not found");
  }
  if (!knowsSource(context.credential, input.source)) {
    return fail("not_found", "source not found");
  }
  const flags = sourceFlags(context.credential, input.source);
  if (!flags.write) {
    return fail("forbidden", "write permission is required");
  }
  const existing = findPage(state, input.source, input.slug);
  if (existing && (existing.deletedAt !== null || existing.hiddenBySource)) {
    return fail("not_found", "page not found");
  }
  if (input.hash !== undefined && input.hash !== (existing?.contentHash ?? null)) {
    return fail("conflict", "hash does not match the current page");
  }
  const projected = projectMarkdown(input.markdown);
  if (!projected.ok) {
    return projected;
  }
  const visibility = assertVisibilityChange(
    context.credential,
    input.source,
    existing?.visibility ?? null,
    projected.value.visibility,
  );
  if (!visibility.ok) {
    return visibility;
  }
  const files = assertFiles(state, input.source, input.slug, projected.value.fileIds);
  if (!files.ok) {
    return files;
  }
  return ok({
    source: input.source,
    slug: input.slug,
    markdown: input.markdown,
    projection: projected.value,
  });
}

function commitWrite(state: DomainState, now: string, prepared: PreparedWrite): PageWrite {
  const next = cloneState(state);
  const hash = sha256Hex(prepared.markdown);
  const objectKey = pageObjectKey(prepared.source, prepared.slug, hash);
  if (!next.objects.some((object) => object.key === objectKey)) {
    next.objects.push({
      key: objectKey,
      bytes: prepared.markdown,
      writtenAt: now,
      kind: "page",
    });
  }
  const page = findPage(next, prepared.source, prepared.slug);
  const record: PageRecord = {
    source: prepared.source,
    slug: prepared.slug,
    type: prepared.projection.type,
    title: prepared.projection.title,
    visibility: prepared.projection.visibility,
    frontmatter: structuredClone(prepared.projection.frontmatter),
    body: prepared.projection.body,
    markdown: prepared.markdown,
    contentHash: hash,
    objectKey,
    updatedAt: now,
    deletedAt: null,
    hiddenBySource: false,
    chunks: structuredClone([...prepared.projection.chunks]),
    links: structuredClone([...prepared.projection.links]),
    tags: structuredClone([...prepared.projection.tags]),
    facts: structuredClone([...prepared.projection.facts]),
    timeline: structuredClone([...prepared.projection.timeline]),
  };
  if (page) {
    Object.assign(page, record);
  } else {
    next.pages.push(record);
  }
  next.versions.push({
    id: nextVersionId(next),
    source: prepared.source,
    slug: prepared.slug,
    contentHash: hash,
    objectKey,
    frontmatter: structuredClone(prepared.projection.frontmatter),
    writtenAt: now,
  });
  trimVersions(next, prepared.source, prepared.slug);
  retargetFiles(next, prepared.source, prepared.slug, prepared.projection.fileIds);
  return { state: next, source: prepared.source, slug: prepared.slug, hash };
}

function locateLivePage(
  state: DomainState,
  context: CommandContext,
  source: string,
  slug: string,
): DomainResult<{ page: PageRecord }> {
  if (context.credential.kind === "anonymous") {
    return fail("unauthorized", "authentication required");
  }
  if (timestampMs(context.now) === null) {
    return fail("invalid", "invalid timestamp");
  }
  if (!isSourceName(source) || !isSlug(slug)) {
    return fail("invalid", "page identity is invalid");
  }
  const directory = state.sources.find((item) => item.id === source);
  if (!directory || directory.deletedAt !== null) {
    return fail("not_found", "source not found");
  }
  if (!knowsSource(context.credential, source)) {
    return fail("not_found", "source not found");
  }
  const page = findPage(state, source, slug);
  if (!page || page.deletedAt !== null || page.hiddenBySource) {
    return fail("not_found", "page not found");
  }
  if (!sourceFlags(context.credential, source).write) {
    return fail("forbidden", "write permission is required");
  }
  return ok({ page });
}

function writeAccess(
  state: DomainState,
  credential: Credential,
  source: string,
  slug: string,
): DomainResult<{ page: PageRecord | null }> {
  if (credential.kind === "anonymous") {
    return fail("unauthorized", "authentication required");
  }
  if (!isSourceName(source) || !isSlug(slug)) {
    return fail("invalid", "page identity is invalid");
  }
  const directory = state.sources.find((item) => item.id === source);
  if (!directory || directory.deletedAt !== null) {
    return fail("not_found", "source not found");
  }
  if (!knowsSource(credential, source)) {
    return fail("not_found", "source not found");
  }
  const page = findPage(state, source, slug);
  if (!sourceFlags(credential, source).write) {
    return page
      ? fail("forbidden", "write permission is required")
      : fail("not_found", "page not found");
  }
  return ok({ page: page ?? null });
}

function readablePage(
  state: DomainState,
  credential: Credential,
  source: string,
  slug: string,
): DomainResult<PageRecord> {
  if (!isSourceName(source) || !isSlug(slug)) {
    return fail("not_found", "page not found");
  }
  if (credential.kind === "anonymous" || !sourceFlags(credential, source).read) {
    return fail("not_found", "page not found");
  }
  const page =
    publiclyReadablePage(state, source, slug) ?? findVisibleToReader(state, source, slug);
  if (!page) {
    return fail("not_found", "page not found");
  }
  return ok(page);
}

function findVisibleToReader(state: DomainState, source: string, slug: string): PageRecord | null {
  const directory = state.sources.find((item) => item.id === source);
  if (!directory || directory.deletedAt !== null) {
    return null;
  }
  const page = findPage(state, source, slug);
  if (!page || page.deletedAt !== null || page.hiddenBySource) {
    return null;
  }
  return page;
}

function publiclyReadablePage(state: DomainState, source: string, slug: string): PageRecord | null {
  const page = findVisibleToReader(state, source, slug);
  if (!page || page.visibility !== "public") {
    return null;
  }
  return page;
}

function isListed(
  state: DomainState,
  credential: Credential,
  page: PageRecord,
  query: ListPagesQuery,
): boolean {
  if (page.deletedAt !== null || page.hiddenBySource) {
    return false;
  }
  const directory = state.sources.find((item) => item.id === page.source);
  if (!directory || directory.deletedAt !== null) {
    return false;
  }
  if (!sourceFlags(credential, page.source).read) {
    return false;
  }
  if (query.source !== undefined && page.source !== query.source) {
    return false;
  }
  if (query.type !== undefined && page.type !== query.type) {
    return false;
  }
  if (
    query.prefix !== undefined &&
    query.prefix.length > 0 &&
    !page.slug.startsWith(query.prefix)
  ) {
    return false;
  }
  return true;
}

function assertVisibilityChange(
  credential: Credential,
  source: string,
  current: Visibility | null,
  next: Visibility,
): DomainResult<null> {
  const changing = current === null ? next === "public" : current !== next;
  if (changing && !sourceFlags(credential, source).visibility) {
    return fail("forbidden", "visibility permission is required");
  }
  return ok(null);
}

function assertFiles(
  state: DomainState,
  source: string,
  slug: string,
  fileIds: readonly string[],
): DomainResult<null> {
  for (const id of fileIds) {
    const file = state.files.find((item) => item.id === id);
    if (!file) {
      return fail("invalid", "file is unknown");
    }
    if (file.pageSource === null && file.pageSlug === null) {
      continue;
    }
    if (file.pageSource === source && file.pageSlug === slug) {
      continue;
    }
    return fail("conflict", "file belongs to another page");
  }
  return ok(null);
}

function retargetFiles(
  state: DomainState,
  source: string,
  slug: string,
  fileIds: readonly string[],
): void {
  const wanted = new Set(fileIds);
  for (const file of state.files) {
    const onThisPage = file.pageSource === source && file.pageSlug === slug;
    if (onThisPage && !wanted.has(file.id)) {
      detachFile(file);
    }
    if (wanted.has(file.id)) {
      file.pageSource = source;
      file.pageSlug = slug;
    }
  }
}

function detachFile(file: StoredFile): void {
  file.pageSource = null;
  file.pageSlug = null;
}

function applyEdits(markdown: string, edits: readonly PageEdit[]): DomainResult<string> {
  if (edits.length === 0) {
    return fail("invalid", "edit requires a replacement");
  }
  let next = markdown;
  for (const edit of edits) {
    if (edit.search.length === 0) {
      return fail("invalid", "search must occur exactly once");
    }
    let count = 0;
    let from = 0;
    while (from <= next.length) {
      const found = next.indexOf(edit.search, from);
      if (found < 0) {
        break;
      }
      count += 1;
      if (count > 1) {
        return fail("invalid", "search must occur exactly once");
      }
      from = found + edit.search.length;
    }
    if (count !== 1) {
      return fail("invalid", "search must occur exactly once");
    }
    next = next.replace(edit.search, () => edit.replace);
  }
  return ok(next);
}

function findPage(state: DomainState, source: string, slug: string): PageRecord | undefined {
  return state.pages.find((page) => page.source === source && page.slug === slug);
}

function latestVersionWithHash(
  state: DomainState,
  source: string,
  slug: string,
  hash: string,
): PageVersion | undefined {
  let found: PageVersion | undefined;
  for (const version of state.versions) {
    if (version.source === source && version.slug === slug && version.contentHash === hash) {
      if (!found || version.id > found.id) {
        found = version;
      }
    }
  }
  return found;
}

function nextVersionId(state: DomainState): number {
  let max = 0;
  for (const version of state.versions) {
    if (version.id > max) {
      max = version.id;
    }
  }
  return max + 1;
}

function trimVersions(state: DomainState, source: string, slug: string): void {
  const mine = state.versions
    .filter((version) => version.source === source && version.slug === slug)
    .sort((left, right) => left.id - right.id);
  if (mine.length <= VERSION_LIMIT) {
    return;
  }
  const drop = new Set(mine.slice(0, mine.length - VERSION_LIMIT).map((version) => version.id));
  state.versions = state.versions.filter((version) => !drop.has(version.id));
}

function toPageView(page: PageRecord): PageView {
  return {
    source: page.source,
    slug: page.slug,
    type: page.type,
    title: page.title,
    visibility: page.visibility,
    frontmatter: page.frontmatter,
    markdown: page.markdown,
    hash: page.contentHash,
  };
}

function isExpired(deletedAt: string, now: string): boolean {
  return isPastRetention(deletedAt, now, SOFT_DELETE_RETENTION_MS);
}
