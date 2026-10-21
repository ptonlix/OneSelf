/* eslint-disable @typescript-eslint/require-await -- mutations share one queue; some steps do not await */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  addMilliseconds,
  assessSiteArchive,
  canApproveSiteActivation,
  cloneState,
  decideSiteActivation,
  deletePage,
  describeSite,
  editPage,
  emptyDomainState,
  fail,
  fileObjectKey,
  getPage,
  getVersions,
  isPastRetention,
  isSiteReleaseId,
  isSlug,
  isSourceName,
  listPages,
  ok,
  previewSite,
  putPage,
  putPages,
  readPublicPage,
  referencedObjectKeys,
  requestSiteActivation,
  resolveSlugs,
  restorePage,
  revertPage,
  runHourlyMaintenance,
  SITE_ACTIVATION_TTL_MS,
  sourcesAdd,
  sourcesDelete,
  sourcesList,
  sourcesRestore,
  sourcesStatus,
  UNREFERENCED_OBJECT_RETENTION_MS,
  type Credential,
  type DomainFailure,
  type DomainResult,
  type DomainState,
  type Fact,
  type PageEdit,
  type PageRecord,
  type PutPageInput,
  type SourceGrant,
  type TimelineEntry,
} from "@oneself/domain";
import type { MarkdownParser, ObjectStore } from "@oneself/ports";

import { ManualClock } from "./clock.js";
import {
  hashesEqual,
  randomId,
  randomToken,
  sha256Base64Url,
  sha256Bytes,
  sha256Hex,
  userCode,
} from "./ids.js";
import { createMarkdownParser } from "./markdown-port.js";
import { hashPassword, verifyPassword } from "./password.js";
import { parseLimit, parseOffset, searchPages, visiblePages } from "./search.js";
import {
  addLink,
  addTag,
  addTimeline,
  forgetFact,
  rememberFact,
  removeLink,
  removeTag,
} from "./structure.js";
import { readZip, writeStoredZip } from "./zip.js";

const FILE_LIMIT = 20 * 1024 * 1024;
const MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const ACCESS_TTL_MS = 15 * 60 * 1000;
const RATE_WINDOW_MS = 60_000;

export type IngressMode = "none" | "cloudflared" | "caddy" | "tailscale";

export type ServerOptions = {
  readonly publicOrigin?: string;
  readonly ownerLogin?: string;
  readonly ownerPassword?: string;
  readonly ownerResetPassword?: string;
  readonly objectStore: ObjectStore;
  readonly clock?: ManualClock;
  readonly ingress?: IngressMode;
  readonly oauthAuthorizationCode?: boolean;
  readonly skillsDir: string;
  readonly originalPagesDir: string;
  readonly log?: (line: string) => void;
};

export type Actor = {
  readonly credential: Credential;
  readonly mustChangePassword: boolean;
  readonly sessionId: string | null;
};

export type OauthHttpResult = {
  readonly status: number;
  readonly body: Record<string, unknown>;
};

type OwnerRecord = {
  login: string;
  passwordHash: string;
  mustChangePassword: boolean;
};

type ApiKeyRecord = {
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

type ApiKeyRequestRecord = {
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

type AccessTokenRecord = {
  hash: string;
  expiresAt: string;
};

type OauthGrantRecord = {
  id: string;
  siteWrite: boolean;
  sources: SourceGrant[];
  refreshTokenHash: string | null;
  rotatedRefreshHashes: string[];
  revokedAt: string | null;
  createdAt: string;
  accessTokens: AccessTokenRecord[];
};

type DeviceRecord = {
  userCode: string;
  deviceCodeHash: string;
  status: "pending" | "approved" | "expired";
  expiresAt: string;
  grantId: string | null;
  consumed: boolean;
};

type AuthCodeRecord = {
  codeHash: string;
  challenge: string;
  siteWrite: boolean;
  sources: SourceGrant[];
  expiresAt: string;
  consumed: boolean;
};

type SiteFileRecord = {
  releaseId: string;
  path: string;
  objectKey: string;
};

type RateScope = "search" | "upload" | "login";

export class StartupRefused extends Error {
  constructor() {
    super("owner is not configured");
    this.name = "StartupRefused";
  }
}

export class Runtime {
  readonly origin: string;
  readonly ingress: IngressMode;
  readonly oauthAuthorizationCode: boolean;
  readonly clock: ManualClock;
  readonly objectStore: ObjectStore;
  readonly parser: MarkdownParser;
  state: DomainState;
  #owner: OwnerRecord | null = null;
  #sessions = new Map<string, { id: string }>();
  #apiKeys: ApiKeyRecord[] = [];
  #apiKeyRequests: ApiKeyRequestRecord[] = [];
  #grants: OauthGrantRecord[] = [];
  #devices: DeviceRecord[] = [];
  #authCodes: AuthCodeRecord[] = [];
  #siteFiles: SiteFileRecord[] = [];
  #rates = new Map<string, number[]>();
  #tail: Promise<unknown> = Promise.resolve();
  #skills: ReadonlyMap<string, Uint8Array>;
  #originalRoot: string;
  #log: (line: string) => void;

  constructor(options: ServerOptions) {
    this.origin = (options.publicOrigin ?? "http://127.0.0.1:3000").replace(/\/$/, "");
    this.ingress = options.ingress ?? "none";
    this.oauthAuthorizationCode = options.oauthAuthorizationCode ?? false;
    this.clock = options.clock ?? new ManualClock();
    this.objectStore = options.objectStore;
    this.parser = createMarkdownParser();
    this.state = emptyDomainState();
    this.#originalRoot = options.originalPagesDir;
    this.#log =
      options.log ??
      ((line) => {
        console.info(line);
      });
    this.#skills = new Map([
      ["data", readFileSync(path.join(options.skillsDir, "data.md"))],
      ["original-page", readFileSync(path.join(options.skillsDir, "original-page.md"))],
    ]);
  }

  async bootstrap(
    login: string | undefined,
    password: string | undefined,
    reset: string | undefined,
  ): Promise<void> {
    if (this.#owner === null) {
      if (
        login === undefined ||
        password === undefined ||
        login.length === 0 ||
        password.length === 0
      ) {
        throw new StartupRefused();
      }
      this.#owner = {
        login,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
      };
    }
    if (reset !== undefined && reset.length > 0) {
      this.#owner.passwordHash = await hashPassword(reset);
      this.#owner.mustChangePassword = true;
      this.#log("owner password hash replaced");
    }
  }

  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#tail.then(fn, fn);
    this.#tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  allow(scope: RateScope, address: string): Promise<boolean> {
    const limit = scope === "login" ? 10 : 30;
    return this.exclusive(() => {
      const now = this.clock.now().getTime();
      const key = `${scope}:${address}`;
      const recent = (this.#rates.get(key) ?? []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
      if (recent.length >= limit) {
        this.#rates.set(key, recent);
        return Promise.resolve(false);
      }
      recent.push(now);
      this.#rates.set(key, recent);
      return Promise.resolve(true);
    });
  }

  clientAddress(request: Request): string {
    if (this.ingress === "cloudflared") {
      const connecting = request.headers.get("cf-connecting-ip")?.trim();
      if (connecting !== undefined && connecting.length > 0) {
        return connecting;
      }
    }
    if (this.ingress === "caddy" || this.ingress === "tailscale") {
      const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (forwarded !== undefined && forwarded.length > 0) {
        return forwarded;
      }
    }
    return "direct";
  }

  passwordBlocked(actor: Actor): DomainFailure | null {
    if (actor.credential.kind === "owner" && actor.mustChangePassword) {
      return fail("password_change_required", "password change required");
    }
    return null;
  }

  authenticate(request: Request): Promise<Actor> {
    return this.exclusive(async () => this.#authenticate(request));
  }

  async login(
    login: string,
    password: string,
  ): Promise<DomainResult<{ must_change_password: boolean; sessionId: string }>> {
    return this.exclusive(async () => {
      const owner = this.#owner;
      if (
        owner === null ||
        owner.login !== login ||
        !(await verifyPassword(password, owner.passwordHash))
      ) {
        return fail("unauthorized", "login failed");
      }
      const sessionId = randomToken();
      this.#sessions.set(sessionId, { id: sessionId });
      return ok({ must_change_password: owner.mustChangePassword, sessionId });
    });
  }

  changePassword(
    actor: Actor,
    password: string,
  ): Promise<DomainResult<{ must_change_password: false }>> {
    return this.exclusive(async () => {
      if (
        actor.credential.kind !== "owner" ||
        actor.sessionId === null ||
        !this.#sessions.has(actor.sessionId)
      ) {
        return fail("unauthorized", "authentication required");
      }
      if (password.length === 0) {
        return fail("invalid", "password is required");
      }
      const owner = this.#requireOwner();
      owner.passwordHash = await hashPassword(password);
      owner.mustChangePassword = false;
      return ok({ must_change_password: false as const });
    });
  }

  logout(actor: Actor): Promise<DomainResult<{ ok: true }>> {
    return this.exclusive(async () => {
      if (actor.sessionId !== null) {
        this.#sessions.delete(actor.sessionId);
      }
      return ok({ ok: true as const });
    });
  }

  maintain(): Promise<void> {
    return this.exclusive(async () => {
      const now = this.clock.iso();
      this.state = runHourlyMaintenance(this.state, now);
      const referenced = referencedObjectKeys(this.state);
      const heads = await this.objectStore.list("");
      for (const head of heads) {
        if (head.key.startsWith("sites/")) {
          continue;
        }
        if (referenced.has(head.key)) {
          continue;
        }
        if (isPastRetention(head.writtenAt.toISOString(), now, UNREFERENCED_OBJECT_RETENTION_MS)) {
          await this.objectStore.delete(head.key);
        }
      }
    });
  }

  putPage(
    actor: Actor,
    input: PutPageInput,
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      return this.#writeOne(actor, input);
    });
  }

  putPages(
    actor: Actor,
    pages: readonly PutPageInput[],
  ): Promise<DomainResult<{ pages: { source: string; slug: string; hash: string }[] }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      for (const page of pages) {
        const parsed = this.parser.parse(page.markdown);
        if (!parsed.ok) {
          return fail("invalid", parsed.message);
        }
      }
      const written = putPages(
        this.state,
        { credential: actor.credential, now: this.clock.iso() },
        pages,
      );
      if (!written.ok) {
        return written;
      }
      await this.#publish(written.value.state);
      return ok({
        pages: written.value.pages.map((page) => ({
          source: page.source,
          slug: page.slug,
          hash: page.hash,
        })),
      });
    });
  }

  editPage(
    actor: Actor,
    input: { source: string; slug: string; hash: string; edits: readonly PageEdit[] },
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const edited = editPage(
        this.state,
        { credential: actor.credential, now: this.clock.iso() },
        input,
      );
      if (!edited.ok) {
        return edited;
      }
      const page = edited.value.state.pages.find(
        (item) => item.source === edited.value.source && item.slug === edited.value.slug,
      );
      if (page !== undefined) {
        const parsed = this.parser.parse(page.markdown);
        if (!parsed.ok) {
          return fail("invalid", parsed.message);
        }
      }
      await this.#publish(edited.value.state);
      return ok({ source: edited.value.source, slug: edited.value.slug, hash: edited.value.hash });
    });
  }

  getPage(
    actor: Actor,
    source: string,
    slug: string,
  ): Promise<DomainResult<Record<string, unknown>>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const page = getPage(this.state, actor.credential, source, slug);
      if (!page.ok) {
        return page;
      }
      return ok(pageView(page.value));
    });
  }

  listPages(
    actor: Actor,
    query: { source?: string; type?: string; prefix?: string },
  ): Promise<DomainResult<{ pages: Record<string, unknown>[] }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const listed = listPages(this.state, actor.credential, query);
      if (!listed.ok) {
        return listed;
      }
      return ok({
        pages: listed.value.map((page) => ({
          source: page.source,
          slug: page.slug,
          type: page.type,
          title: page.title,
          visibility: page.visibility,
          updated_at: page.updatedAt,
        })),
      });
    });
  }

  deletePage(
    actor: Actor,
    source: string,
    slug: string,
  ): Promise<DomainResult<{ source: string; slug: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const deleted = deletePage(
        this.state,
        { credential: actor.credential, now: this.clock.iso() },
        source,
        slug,
      );
      if (!deleted.ok) {
        return deleted;
      }
      await this.#publish(deleted.value.state);
      return ok({ source, slug });
    });
  }

  restorePage(
    actor: Actor,
    source: string,
    slug: string,
  ): Promise<DomainResult<{ source: string; slug: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const restored = restorePage(
        this.state,
        { credential: actor.credential, now: this.clock.iso() },
        source,
        slug,
      );
      if (!restored.ok) {
        return restored;
      }
      await this.#publish(restored.value.state);
      return ok({ source, slug });
    });
  }

  versions(
    actor: Actor,
    source: string,
    slug: string,
  ): Promise<DomainResult<{ versions: Record<string, unknown>[] }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const versions = getVersions(this.state, actor.credential, source, slug);
      if (!versions.ok) {
        return versions;
      }
      return ok({
        versions: versions.value.map((version) => ({
          hash: version.hash,
          frontmatter: version.frontmatter,
          written_at: version.writtenAt,
        })),
      });
    });
  }

  revert(
    actor: Actor,
    source: string,
    slug: string,
    hash: string,
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const reverted = revertPage(
        this.state,
        { credential: actor.credential, now: this.clock.iso() },
        { source, slug, hash },
      );
      if (!reverted.ok) {
        return reverted;
      }
      await this.#publish(reverted.value.state);
      return ok({
        source: reverted.value.source,
        slug: reverted.value.slug,
        hash: reverted.value.hash,
      });
    });
  }

  resolve(
    actor: Actor,
    slugs: readonly { source: string; slug: string }[],
  ): Promise<DomainResult<{ slugs: { source: string; slug: string; exists: boolean }[] }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const resolved = resolveSlugs(this.state, actor.credential, slugs);
      if (!resolved.ok) {
        return resolved;
      }
      return ok({
        slugs: resolved.value.map((item) => ({
          source: item.source,
          slug: item.slug,
          exists: item.exists,
        })),
      });
    });
  }

  uploadFile(
    actor: Actor,
    bytes: Uint8Array,
    mediaType: string,
  ): Promise<DomainResult<{ id: string; url: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      if (actor.credential.kind === "anonymous") {
        return fail("unauthorized", "authentication required");
      }
      if (!canUpload(actor.credential)) {
        return fail("forbidden", "write permission is required");
      }
      if (!MEDIA_TYPES.has(mediaType)) {
        return fail("invalid", "media type is not allowed");
      }
      if (bytes.byteLength > FILE_LIMIT) {
        return fail("payload_too_large", "file exceeds 20 MiB");
      }
      const id = randomId("file_");
      const objectKey = fileObjectKey(id);
      await this.objectStore.put(objectKey, bytes);
      const next = cloneState(this.state);
      next.files.push({
        id,
        objectKey,
        mediaType,
        byteSize: bytes.byteLength,
        sha256: sha256Bytes(bytes),
        pageSource: null,
        pageSlug: null,
        createdAt: this.clock.iso(),
      });
      this.state = next;
      return ok({ id, url: `${this.origin}/media/${id}` });
    });
  }

  listFiles(
    actor: Actor,
    source: string | undefined,
    slug: string | undefined,
  ): Promise<DomainResult<{ files: Record<string, unknown>[] }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      if (source === undefined && slug === undefined) {
        if (actor.credential.kind === "anonymous") {
          return fail("unauthorized", "authentication required");
        }
        if (actor.credential.kind !== "owner") {
          return fail("forbidden", "owner session required");
        }
        return ok({
          files: this.state.files
            .filter((file) => file.pageSource === null)
            .map((file) => this.#fileJson(file)),
        });
      }
      if (source === undefined || slug === undefined) {
        return fail("invalid", "source and slug are both required");
      }
      const page = getPage(this.state, actor.credential, source, slug);
      if (!page.ok) {
        return page;
      }
      const files = this.state.files.filter(
        (file) => file.pageSource === source && file.pageSlug === slug,
      );
      return ok({ files: files.map((file) => this.#fileJson(file)) });
    });
  }

  fileUrl(actor: Actor, id: string): Promise<DomainResult<Record<string, unknown>>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const file = this.state.files.find((item) => item.id === id);
      if (file === undefined || !this.#canReadFile(actor, file)) {
        return fail("not_found", "file not found");
      }
      return ok(this.#fileJson(file));
    });
  }

  readMedia(
    actor: Actor,
    id: string,
  ): Promise<DomainResult<{ bytes: Uint8Array; mediaType: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const file = this.state.files.find((item) => item.id === id);
      if (file === undefined || !this.#canReadFile(actor, file)) {
        return fail("not_found", "file not found");
      }
      const stored = await this.objectStore.get(file.objectKey);
      if (stored === null) {
        return fail("not_found", "file not found");
      }
      return ok({ bytes: stored.body, mediaType: file.mediaType });
    });
  }

  search(
    actor: Actor,
    input: unknown,
    publicOnly: boolean,
  ): Promise<DomainResult<Record<string, unknown>[]>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      if (!isPlainRecord(input)) {
        return fail("invalid", "search body is invalid");
      }
      const body = input;
      if (!publicOnly && actor.credential.kind === "anonymous") {
        return fail("unauthorized", "authentication required");
      }
      if (typeof body.q !== "string" || body.q.length === 0) {
        return fail("invalid", "q is required");
      }
      const limit = parseLimit(body.limit);
      const offset = parseOffset(body.cursor);
      if (limit === null || offset === null) {
        return fail("invalid", "limit or cursor is invalid");
      }
      if (body.source !== undefined && typeof body.source !== "string") {
        return fail("invalid", "source is invalid");
      }
      const hits = searchPages(
        this.state,
        actor.credential,
        {
          q: body.q,
          ...(typeof body.source === "string" ? { source: body.source } : {}),
          limit,
          offset,
        },
        publicOnly,
      );
      return ok(hits.map((hit) => ({ ...hit })));
    });
  }

  query(actor: Actor, input: unknown): Promise<DomainResult<Record<string, unknown>[]>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      if (!isPlainRecord(input)) {
        return fail("invalid", "query body is invalid");
      }
      const body = input;
      if (actor.credential.kind === "anonymous") {
        return fail("unauthorized", "authentication required");
      }
      const limit = parseLimit(body.limit);
      const offset = parseOffset(body.cursor);
      if (limit === null || offset === null) {
        return fail("invalid", "limit or cursor is invalid");
      }
      const source = optionalString(body.source);
      const type = optionalString(body.type);
      const tag = optionalString(body.tag);
      const updatedAfter = optionalString(body.updated_after);
      const updatedBefore = optionalString(body.updated_before);
      if (
        source === invalidString ||
        type === invalidString ||
        tag === invalidString ||
        updatedAfter === invalidString ||
        updatedBefore === invalidString
      ) {
        return fail("invalid", "query filter is invalid");
      }
      let pages = [...visiblePages(this.state, actor.credential, false)];
      if (typeof source === "string") {
        pages = pages.filter((page) => page.source === source);
      }
      if (typeof type === "string") {
        pages = pages.filter((page) => page.type === type);
      }
      if (typeof tag === "string") {
        pages = pages.filter((page) => page.tags.includes(tag));
      }
      if (typeof updatedAfter === "string") {
        const parsed = Date.parse(updatedAfter);
        if (Number.isNaN(parsed)) {
          return fail("invalid", "updated_after is invalid");
        }
        pages = pages.filter((page) => Date.parse(page.updatedAt) >= parsed);
      }
      if (typeof updatedBefore === "string") {
        const parsed = Date.parse(updatedBefore);
        if (Number.isNaN(parsed)) {
          return fail("invalid", "updated_before is invalid");
        }
        pages = pages.filter((page) => Date.parse(page.updatedAt) <= parsed);
      }
      pages.sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || left.slug.localeCompare(right.slug),
      );
      return ok(
        pages.slice(offset, offset + limit).map((page) => ({
          source: page.source,
          slug: page.slug,
          type: page.type,
          title: page.title,
          updated_at: page.updatedAt,
        })),
      );
    });
  }

  recall(
    actor: Actor,
    input: unknown,
  ): Promise<DomainResult<{ facts: Record<string, unknown>[] }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      if (!isPlainRecord(input)) {
        return fail("invalid", "recall body is invalid");
      }
      const body = input;
      if (actor.credential.kind === "anonymous") {
        return fail("unauthorized", "authentication required");
      }
      const limit = parseLimit(body.limit);
      if (limit === null) {
        return fail("invalid", "limit is invalid");
      }
      const entity = optionalString(body.entity);
      const q = optionalString(body.q);
      if (entity === invalidString || q === invalidString) {
        return fail("invalid", "recall filter is invalid");
      }
      if (entity === undefined && q === undefined) {
        return fail("invalid", "entity or q is required");
      }
      const facts: Record<string, unknown>[] = [];
      for (const page of visiblePages(this.state, actor.credential, false)) {
        for (const fact of page.facts) {
          if (typeof entity === "string" && fact.entity !== entity) {
            continue;
          }
          if (typeof q === "string" && !fact.statement.includes(q)) {
            continue;
          }
          facts.push({
            source: page.source,
            slug: page.slug,
            id: fact.id,
            entity: fact.entity,
            statement: fact.statement,
            confidence: fact.confidence,
            valid_until: fact.validUntil,
          });
        }
      }
      return ok({ facts: facts.slice(0, limit) });
    });
  }

  getTags(actor: Actor, source: string, slug: string): Promise<DomainResult<{ tags: string[] }>> {
    return this.#readPage(actor, source, slug, (page) => ok({ tags: [...page.tags] }));
  }

  addTag(
    actor: Actor,
    source: string,
    slug: string,
    tag: string,
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    return this.#rewrite(actor, source, slug, (markdown) => addTag(markdown, tag));
  }

  removeTag(
    actor: Actor,
    source: string,
    slug: string,
    tag: string,
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    return this.#rewrite(actor, source, slug, (markdown) => removeTag(markdown, tag));
  }

  getLinks(
    actor: Actor,
    source: string,
    slug: string,
  ): Promise<DomainResult<{ links: { source: string; slug: string }[] }>> {
    return this.#readPage(actor, source, slug, (page) =>
      ok({ links: page.links.map((link) => ({ source: link.toSource, slug: link.toSlug })) }),
    );
  }

  getBacklinks(
    actor: Actor,
    source: string,
    slug: string,
  ): Promise<DomainResult<{ links: { source: string; slug: string }[] }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const page = getPage(this.state, actor.credential, source, slug);
      if (!page.ok) {
        return page;
      }
      const links = visiblePages(this.state, actor.credential, false)
        .filter((item) =>
          item.links.some((link) => link.toSource === source && link.toSlug === slug),
        )
        .map((item) => ({ source: item.source, slug: item.slug }));
      return ok({ links });
    });
  }

  addLink(
    actor: Actor,
    from: { source: string; slug: string },
    to: { source: string; slug: string },
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    if (!isSourceName(to.source) || !isSlug(to.slug)) {
      return Promise.resolve(fail("invalid", "link target is invalid"));
    }
    return this.#rewrite(actor, from.source, from.slug, (markdown) =>
      addLink(markdown, to.source, to.slug),
    );
  }

  removeLink(
    actor: Actor,
    from: { source: string; slug: string },
    to: { source: string; slug: string },
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    return this.#rewrite(actor, from.source, from.slug, (markdown) =>
      removeLink(markdown, to.source, to.slug),
    );
  }

  getTimeline(
    actor: Actor,
    source: string,
    slug: string,
  ): Promise<DomainResult<{ entries: Record<string, unknown>[] }>> {
    return this.#readPage(actor, source, slug, (page) =>
      ok({
        entries: page.timeline.map((entry) => ({
          date: entry.occurredOn,
          title: entry.title,
          detail: entry.detail,
        })),
      }),
    );
  }

  addTimelineEntry(
    actor: Actor,
    source: string,
    slug: string,
    input: { date: string; title: string; detail: string | null },
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const page = getPage(this.state, actor.credential, source, slug);
      if (!page.ok) {
        return page;
      }
      const current = this.#pageRecord(source, slug);
      const entry: TimelineEntry = {
        ordinal: current?.timeline.length ?? 0,
        occurredOn: input.date,
        title: input.title,
        detail: input.detail,
      };
      const rewritten = addTimeline(page.value.markdown, entry);
      if (!rewritten.ok) {
        return rewritten;
      }
      return this.#writeOne(actor, { source, slug, markdown: rewritten.value });
    });
  }

  remember(
    actor: Actor,
    input: {
      source: string;
      slug: string;
      id?: string;
      entity: string;
      statement: string;
      confidence: number | null;
      validUntil: string | null;
    },
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const page = getPage(this.state, actor.credential, input.source, input.slug);
      if (!page.ok) {
        return page;
      }
      const fact: Fact = {
        id: input.id ?? randomId("fact_"),
        entity: input.entity,
        statement: input.statement,
        confidence: input.confidence,
        validUntil: input.validUntil,
      };
      const rewritten = rememberFact(page.value.markdown, fact);
      if (!rewritten.ok) {
        return rewritten;
      }
      return this.#writeOne(actor, {
        source: input.source,
        slug: input.slug,
        markdown: rewritten.value,
      });
    });
  }

  forget(
    actor: Actor,
    source: string,
    slug: string,
    id: string,
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const page = getPage(this.state, actor.credential, source, slug);
      if (!page.ok) {
        return page;
      }
      const rewritten = forgetFact(page.value.markdown, id);
      if (!rewritten.ok) {
        return rewritten;
      }
      return this.#writeOne(actor, { source, slug, markdown: rewritten.value });
    });
  }

  sourcesList(actor: Actor): Promise<DomainResult<{ sources: { id: string }[] }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const listed = sourcesList(this.state, actor.credential);
      if (!listed.ok) {
        return listed;
      }
      return ok({ sources: listed.value.map((source) => ({ id: source.id })) });
    });
  }

  sourcesAdd(actor: Actor, id: string): Promise<DomainResult<{ id: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const added = sourcesAdd(this.state, actor.credential, { id });
      if (!added.ok) {
        return added;
      }
      await this.#publish(added.value.state);
      return ok({ id });
    });
  }

  sourcesDelete(actor: Actor, id: string): Promise<DomainResult<{ id: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const deleted = sourcesDelete(this.state, actor.credential, { id, now: this.clock.iso() });
      if (!deleted.ok) {
        return deleted;
      }
      await this.#publish(deleted.value.state);
      return ok({ id });
    });
  }

  sourcesRestore(actor: Actor, id: string): Promise<DomainResult<{ id: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const restored = sourcesRestore(this.state, actor.credential, { id, now: this.clock.iso() });
      if (!restored.ok) {
        return restored;
      }
      await this.#publish(restored.value.state);
      return ok({ id });
    });
  }

  sourcesStatus(actor: Actor, id: string): Promise<DomainResult<Record<string, unknown>>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const status = sourcesStatus(this.state, actor.credential, id);
      if (!status.ok) {
        return status;
      }
      return ok({
        id: status.value.id,
        page_count: status.value.pageCount,
        latest_write_at: status.value.latestWriteAt,
      });
    });
  }

  whoami(actor: Actor): Promise<DomainResult<Record<string, unknown>>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      if (actor.credential.kind === "anonymous") {
        return fail("unauthorized", "authentication required");
      }
      return ok(this.#whoami(actor.credential));
    });
  }

  listSkills(actor: Actor): Promise<DomainResult<{ skills: { name: string }[] }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      return ok({ skills: [{ name: "data" }, { name: "original-page" }] });
    });
  }

  readSkill(actor: Actor, name: string): Promise<DomainResult<Uint8Array>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const bytes = this.#skills.get(name);
      if (bytes === undefined) {
        return fail("not_found", "skill not found");
      }
      return ok(bytes);
    });
  }

  skillBytes(name: string): Uint8Array | null {
    return this.#skills.get(name) ?? null;
  }

  listSites(actor: Actor): Promise<DomainResult<Record<string, unknown>>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      if (actor.credential.kind === "anonymous") {
        return fail("unauthorized", "authentication required");
      }
      const described = describeSite(this.state.site.pointer, this.state.site.releases);
      return ok({
        pointer: { release_id: described.pointer.releaseId },
        releases: described.releases.map((release) => ({
          id: release.id,
          created_at: release.createdAt,
        })),
      });
    });
  }

  siteSourceZip(actor: Actor): Promise<DomainResult<Uint8Array>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      if (!canSiteWrite(actor.credential)) {
        return actor.credential.kind === "anonymous"
          ? fail("unauthorized", "authentication required")
          : fail("forbidden", "site write is required");
      }
      const files = walkFiles(this.#originalRoot)
        .filter(
          (file) =>
            !file.path.split("/").includes("node_modules") &&
            !file.path.split("/").includes("dist"),
        )
        .map((file) => ({ path: file.path, data: readFileSync(file.absolute) }));
      return ok(writeStoredZip(files));
    });
  }

  putSite(actor: Actor, bytes: Uint8Array): Promise<DomainResult<{ id: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      if (!canSiteWrite(actor.credential)) {
        return actor.credential.kind === "anonymous"
          ? fail("unauthorized", "authentication required")
          : fail("forbidden", "site write is required");
      }
      if (bytes.byteLength > FILE_LIMIT) {
        return fail("payload_too_large", "archive exceeds the site upload limit");
      }
      const zip = readZip(bytes);
      if (!zip.ok) {
        return zip.message.includes("exceeds")
          ? fail("payload_too_large", zip.message)
          : fail("invalid", zip.message);
      }
      const assessed = assessSiteArchive(
        zip.entries.map((entry) => ({
          path: entry.path,
          size: entry.data.byteLength,
          symlink: entry.symlink,
        })),
      );
      if (!assessed.ok) {
        return assessed;
      }
      const accepted: { relative: string; data: Uint8Array }[] = [];
      for (const entry of zip.entries) {
        if (entry.directory || entry.symlink) {
          continue;
        }
        const relative = normalizeArchivePath(entry.path);
        if (relative === null) {
          return fail("invalid", "archive path is invalid");
        }
        accepted.push({ relative, data: entry.data });
      }
      const id = randomId("rel_");
      if (!isSiteReleaseId(id)) {
        return fail("invalid", "release id is invalid");
      }
      const stored: SiteFileRecord[] = [];
      for (const entry of accepted) {
        const objectKey = `sites/${id}/${entry.relative}`;
        await this.objectStore.put(objectKey, entry.data);
        stored.push({ releaseId: id, path: entry.relative, objectKey });
      }
      const next = cloneState(this.state);
      next.site.releases.push({ id, createdAt: this.clock.iso() });
      this.state = next;
      this.#siteFiles.push(...stored);
      return ok({ id });
    });
  }

  preview(actor: Actor, releaseId: string): Promise<DomainResult<{ url: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const previewed = previewSite(this.state.site.pointer, this.state.site.releases, releaseId);
      if (!previewed.ok) {
        return previewed;
      }
      return ok({ url: previewed.value.url });
    });
  }

  activate(actor: Actor, releaseId: string): Promise<DomainResult<Record<string, unknown>>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const id = randomId("act_");
      const requested = requestSiteActivation({
        pointer: this.state.site.pointer,
        releases: this.state.site.releases,
        credential: actor.credential,
        activationId: id,
        releaseId,
        now: this.clock.iso(),
      });
      if (!requested.ok) {
        return requested;
      }
      const next = cloneState(this.state);
      next.site.activations.push(requested.value.activation);
      this.state = next;
      return ok({
        id,
        status: "pending",
        approval_url: `${this.origin}/admin/site-activations/${id}`,
        expires_at: requested.value.activation.expiresAt,
      });
    });
  }

  getActivation(actor: Actor, id: string): Promise<DomainResult<Record<string, unknown>>> {
    return this.exclusive(async () => {
      const allowed = this.#ownerActor(actor);
      if (!allowed.ok) {
        return allowed;
      }
      const activation = this.state.site.activations.find((item) => item.id === id);
      if (activation === undefined) {
        return fail("not_found", "activation not found");
      }
      return ok({
        id: activation.id,
        release_id: activation.releaseId,
        status: this.#activationStatus(activation),
        expires_at: activation.expiresAt,
      });
    });
  }

  publicSources(actor: Actor): Promise<DomainResult<{ id: string }[]>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const ids = new Set(publicPageList(this.state).map((page) => String(page.source)));
      return ok([...ids].sort().map((id) => ({ id })));
    });
  }

  publicPages(actor: Actor): Promise<DomainResult<Record<string, unknown>[]>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      return ok(publicPageList(this.state));
    });
  }

  publicPage(
    actor: Actor,
    source: string,
    slug: string,
  ): Promise<DomainResult<Record<string, unknown>>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const page = readPublicPage(this.state, source, slug);
      if (!page.ok) {
        return page;
      }
      return ok(pageView(page.value));
    });
  }

  decideActivation(
    actor: Actor,
    id: string,
    decision: "approve" | "reject",
  ): Promise<DomainResult<{ status: string; release_id: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const activation = this.state.site.activations.find((item) => item.id === id);
      if (activation === undefined) {
        const allowed = canApproveSiteActivation(actor.credential);
        if (allowed !== "ok") {
          return fail(allowed, "site approval is owner only");
        }
        return fail("not_found", "activation not found");
      }
      const decided = decideSiteActivation({
        pointer: this.state.site.pointer,
        activation,
        decision,
        credential: actor.credential,
        now: this.clock.iso(),
      });
      if (!decided.ok) {
        if (decided.value.activation.status !== activation.status) {
          const next = cloneState(this.state);
          const index = next.site.activations.findIndex((item) => item.id === id);
          const current = next.site.activations[index];
          if (current !== undefined) {
            next.site.activations[index] = decided.value.activation;
            this.state = next;
          }
        }
        return fail(decided.error, decided.message);
      }
      const next = cloneState(this.state);
      next.site.pointer = { releaseId: decided.value.pointer.releaseId };
      const index = next.site.activations.findIndex((item) => item.id === id);
      const current = next.site.activations[index];
      if (current !== undefined) {
        next.site.activations[index] = decided.value.activation;
      }
      this.state = next;
      return ok({
        status: decided.value.activation.status,
        release_id: decided.value.pointer.releaseId,
      });
    });
  }

  createApiKey(
    actor: Actor,
    input: { label: string; unrestrictedData: boolean; siteWrite: boolean; sources: SourceGrant[] },
  ): Promise<DomainResult<Record<string, unknown>>> {
    return this.exclusive(async () => {
      const allowed = this.#ownerActor(actor);
      if (!allowed.ok) {
        return allowed;
      }
      const now = this.clock.iso();
      const expiresAt = addMilliseconds(now, SITE_ACTIVATION_TTL_MS);
      if (expiresAt === null) {
        return fail("invalid", "invalid timestamp");
      }
      const id = randomId("akr_");
      this.#apiKeyRequests.push({
        id,
        label: input.label,
        unrestrictedData: input.unrestrictedData,
        siteWrite: input.siteWrite,
        sources: input.unrestrictedData ? [] : input.sources,
        status: "pending",
        expiresAt,
        createdAt: now,
        apiKeyId: null,
      });
      return ok({
        id,
        status: "pending",
        approval_url: `${this.origin}/admin/api-keys/${id}`,
        expires_at: expiresAt,
      });
    });
  }

  listApiKeys(actor: Actor): Promise<DomainResult<{ api_keys: Record<string, unknown>[] }>> {
    return this.exclusive(async () => {
      const allowed = this.#ownerActor(actor);
      if (!allowed.ok) {
        return allowed;
      }
      return ok({
        api_keys: this.#apiKeys.map((key) => ({
          id: key.id,
          label: key.label,
          unrestricted_data: key.unrestrictedData,
          site_write: key.siteWrite,
          sources: key.sources,
          created_at: key.createdAt,
          last_used_at: key.lastUsedAt,
          revoked_at: key.revokedAt,
        })),
      });
    });
  }

  revokeApiKey(actor: Actor, id: string): Promise<DomainResult<{ id: string }>> {
    return this.exclusive(async () => {
      const allowed = this.#ownerActor(actor);
      if (!allowed.ok) {
        return allowed;
      }
      const key = this.#apiKeys.find((item) => item.id === id);
      if (key === undefined) {
        return fail("not_found", "api key not found");
      }
      if (key.revokedAt !== null) {
        return fail("conflict", "api key is already revoked");
      }
      key.revokedAt = this.clock.iso();
      return ok({ id });
    });
  }

  getApiKeyRequest(actor: Actor, id: string): Promise<DomainResult<Record<string, unknown>>> {
    return this.exclusive(async () => {
      const allowed = this.#ownerActor(actor);
      if (!allowed.ok) {
        return allowed;
      }
      const request = this.#apiKeyRequests.find((item) => item.id === id);
      if (request === undefined) {
        return fail("not_found", "api key request not found");
      }
      this.#expireKeyRequest(request);
      return ok({
        id: request.id,
        label: request.label,
        unrestricted_data: request.unrestrictedData,
        site_write: request.siteWrite,
        sources: request.sources,
        status: request.status,
        expires_at: request.expiresAt,
      });
    });
  }

  approveApiKey(actor: Actor, id: string): Promise<DomainResult<{ key: string }>> {
    return this.exclusive(async () => {
      const allowed = this.#ownerActor(actor);
      if (!allowed.ok) {
        return allowed;
      }
      const request = this.#apiKeyRequests.find((item) => item.id === id);
      if (request === undefined) {
        return fail("not_found", "api key request not found");
      }
      this.#expireKeyRequest(request);
      if (request.status === "expired") {
        return fail("conflict", "api key request has expired");
      }
      if (request.status !== "pending") {
        return fail("conflict", "api key request is not pending");
      }
      const key = randomToken("osk_");
      const apiKeyId = randomId("key_");
      this.#apiKeys.push({
        id: apiKeyId,
        keyHash: sha256Hex(key),
        label: request.label,
        unrestrictedData: request.unrestrictedData,
        siteWrite: request.siteWrite,
        sources: request.sources.map((source) => ({ ...source })),
        createdAt: this.clock.iso(),
        lastUsedAt: null,
        revokedAt: null,
      });
      request.status = "confirmed";
      request.apiKeyId = apiKeyId;
      return ok({ key });
    });
  }

  startDevice(): Promise<Record<string, unknown>> {
    return this.exclusive(async () => {
      const now = this.clock.iso();
      const expiresAt = addMilliseconds(now, SITE_ACTIVATION_TTL_MS) ?? now;
      const device = randomToken();
      const code = userCode();
      this.#devices.push({
        userCode: code,
        deviceCodeHash: sha256Hex(device),
        status: "pending",
        expiresAt,
        grantId: null,
        consumed: false,
      });
      return {
        device_code: device,
        user_code: code,
        verification_uri: `${this.origin}/admin/device`,
        verification_uri_complete: `${this.origin}/admin/device?user_code=${encodeURIComponent(code)}`,
        expires_in: 900,
        interval: 5,
      };
    });
  }

  approveDevice(
    actor: Actor,
    input: { userCode: string; siteWrite: boolean; sources: SourceGrant[] },
  ): Promise<DomainResult<Record<string, never>>> {
    return this.exclusive(async () => {
      const allowed = this.#ownerActor(actor);
      if (!allowed.ok) {
        return allowed;
      }
      const device = this.#devices.find((item) => item.userCode === input.userCode);
      if (device === undefined) {
        return fail("not_found", "device code not found");
      }
      if (Date.parse(device.expiresAt) < this.clock.now().getTime()) {
        device.status = "expired";
        return fail("conflict", "device code has expired");
      }
      if (device.status !== "pending") {
        return fail("conflict", "device code is not pending");
      }
      const grant: OauthGrantRecord = {
        id: randomId("gr_"),
        siteWrite: input.siteWrite,
        sources: input.sources.map((source) => ({ ...source })),
        refreshTokenHash: null,
        rotatedRefreshHashes: [],
        revokedAt: null,
        createdAt: this.clock.iso(),
        accessTokens: [],
      };
      this.#grants.push(grant);
      device.status = "approved";
      device.grantId = grant.id;
      return ok({});
    });
  }

  issueAuthCode(
    actor: Actor,
    input: { challenge: string; method: string; siteWrite: boolean; sources: SourceGrant[] },
  ): Promise<DomainResult<{ code: string }>> {
    return this.exclusive(async () => {
      if (!this.oauthAuthorizationCode) {
        return fail("not_found", "authorization code is not enabled");
      }
      const allowed = this.#ownerActor(actor);
      if (!allowed.ok) {
        return allowed;
      }
      if (input.method !== "S256" || input.challenge.length === 0) {
        return fail("invalid", "pkce challenge is invalid");
      }
      const code = randomToken();
      const expiresAt = addMilliseconds(this.clock.iso(), ACCESS_TTL_MS);
      if (expiresAt === null) {
        return fail("invalid", "invalid timestamp");
      }
      this.#authCodes.push({
        codeHash: sha256Hex(code),
        challenge: input.challenge,
        siteWrite: input.siteWrite,
        sources: input.sources,
        expiresAt,
        consumed: false,
      });
      return ok({ code });
    });
  }

  oauthToken(params: URLSearchParams): Promise<OauthHttpResult> {
    return this.exclusive(async () => this.#oauthToken(params));
  }

  currentPointer(): Promise<string> {
    return this.exclusive(async () => this.state.site.pointer.releaseId);
  }

  readOriginal(relative: string): Uint8Array | null {
    const absolute = safeJoin(this.#originalRoot, relative);
    if (absolute === null) {
      return null;
    }
    try {
      const info = statSync(absolute);
      if (!info.isFile()) {
        return null;
      }
      return readFileSync(absolute);
    } catch {
      return null;
    }
  }

  readReleaseFile(releaseId: string, relative: string): Promise<Uint8Array | null> {
    return this.exclusive(async () => {
      const file = this.#siteFiles.find(
        (item) => item.releaseId === releaseId && item.path === relative,
      );
      if (file === undefined) {
        return null;
      }
      const stored = await this.objectStore.get(file.objectKey);
      return stored?.body ?? null;
    });
  }

  async #writeOne(
    actor: Actor,
    input: PutPageInput,
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    const parsed = this.parser.parse(input.markdown);
    if (!parsed.ok) {
      return fail("invalid", parsed.message);
    }
    const written = putPage(
      this.state,
      { credential: actor.credential, now: this.clock.iso() },
      input,
    );
    if (!written.ok) {
      return written;
    }
    await this.#publish(written.value.state);
    return ok({ source: written.value.source, slug: written.value.slug, hash: written.value.hash });
  }

  async #publish(next: DomainState): Promise<void> {
    const known = new Set(this.state.objects.map((object) => object.key));
    for (const object of next.objects) {
      if (known.has(object.key)) {
        continue;
      }
      await this.objectStore.put(object.key, new TextEncoder().encode(object.bytes));
    }
    this.state = next;
  }

  #rewrite(
    actor: Actor,
    source: string,
    slug: string,
    rewrite: (markdown: string) => DomainResult<string | null>,
  ): Promise<DomainResult<{ source: string; slug: string; hash: string }>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const page = getPage(this.state, actor.credential, source, slug);
      if (!page.ok) {
        return page;
      }
      const rewritten = rewrite(page.value.markdown);
      if (!rewritten.ok) {
        return rewritten;
      }
      if (rewritten.value === null) {
        return ok({ source, slug, hash: page.value.hash });
      }
      return this.#writeOne(actor, { source, slug, markdown: rewritten.value });
    });
  }

  #readPage<T>(
    actor: Actor,
    source: string,
    slug: string,
    read: (page: PageRecord) => DomainResult<T>,
  ): Promise<DomainResult<T>> {
    return this.exclusive(async () => {
      const blocked = this.passwordBlocked(actor);
      if (blocked !== null) {
        return blocked;
      }
      const page = getPage(this.state, actor.credential, source, slug);
      if (!page.ok) {
        return page;
      }
      const record = this.#pageRecord(source, slug);
      if (record === undefined) {
        return fail("not_found", "page not found");
      }
      return read(record);
    });
  }

  #pageRecord(source: string, slug: string) {
    return this.state.pages.find((page) => page.source === source && page.slug === slug);
  }

  #authenticate(request: Request): Actor {
    const authorization = request.headers.get("authorization");
    if (authorization !== null) {
      const match = /^(ApiKey|Bearer)\s+(\S+)$/i.exec(authorization.trim());
      const scheme = match?.[1]?.toLowerCase();
      const token = match?.[2];
      if (scheme === "apikey" && token !== undefined) {
        return this.#actorFromApiKey(token);
      }
      if (scheme === "bearer" && token !== undefined) {
        return this.#actorFromAccessToken(token);
      }
    }
    const headerKey = request.headers.get("x-api-key");
    if (headerKey !== null && headerKey.trim().length > 0) {
      return this.#actorFromApiKey(headerKey.trim());
    }
    const sessionId = readCookie(request.headers.get("cookie"), "oneself_session");
    if (sessionId !== null && this.#sessions.has(sessionId) && this.#owner !== null) {
      return {
        credential: { kind: "owner" },
        mustChangePassword: this.#owner.mustChangePassword,
        sessionId,
      };
    }
    return { credential: { kind: "anonymous" }, mustChangePassword: false, sessionId: null };
  }

  #actorFromApiKey(token: string): Actor {
    const hash = sha256Hex(token);
    const key = this.#apiKeys.find((item) => hashesEqual(item.keyHash, hash));
    if (key === undefined || key.revokedAt !== null) {
      return { credential: { kind: "anonymous" }, mustChangePassword: false, sessionId: null };
    }
    key.lastUsedAt = this.clock.iso();
    return {
      credential: {
        kind: "api_key",
        unrestrictedData: key.unrestrictedData,
        siteWrite: key.siteWrite,
        sources: key.sources,
      },
      mustChangePassword: false,
      sessionId: null,
    };
  }

  #actorFromAccessToken(token: string): Actor {
    const hash = sha256Hex(token);
    const now = this.clock.now().getTime();
    for (const grant of this.#grants) {
      if (grant.revokedAt !== null) {
        continue;
      }
      const access = grant.accessTokens.find((item) => hashesEqual(item.hash, hash));
      if (access === undefined) {
        continue;
      }
      if (Date.parse(access.expiresAt) < now) {
        return { credential: { kind: "anonymous" }, mustChangePassword: false, sessionId: null };
      }
      return {
        credential: { kind: "oauth", siteWrite: grant.siteWrite, sources: grant.sources },
        mustChangePassword: false,
        sessionId: null,
      };
    }
    return { credential: { kind: "anonymous" }, mustChangePassword: false, sessionId: null };
  }

  #ownerActor(actor: Actor): DomainResult<true> {
    if (actor.credential.kind === "anonymous") {
      return fail("unauthorized", "authentication required");
    }
    if (actor.credential.kind !== "owner") {
      return fail("forbidden", "owner session required");
    }
    const blocked = this.passwordBlocked(actor);
    if (blocked !== null) {
      return blocked;
    }
    if (actor.sessionId === null || !this.#sessions.has(actor.sessionId)) {
      return fail("unauthorized", "authentication required");
    }
    return ok(true);
  }

  #requireOwner(): OwnerRecord {
    if (this.#owner === null) {
      throw new StartupRefused();
    }
    return this.#owner;
  }

  #expireKeyRequest(request: ApiKeyRequestRecord): void {
    if (
      request.status === "pending" &&
      Date.parse(request.expiresAt) < this.clock.now().getTime()
    ) {
      request.status = "expired";
    }
  }

  #activationStatus(activation: { status: string; expiresAt: string }): string {
    if (
      activation.status === "pending" &&
      Date.parse(activation.expiresAt) < this.clock.now().getTime()
    ) {
      return "expired";
    }
    return activation.status;
  }

  #canReadFile(actor: Actor, file: DomainState["files"][number]): boolean {
    if (file.pageSource === null || file.pageSlug === null) {
      return actor.credential.kind !== "anonymous";
    }
    const source = this.state.sources.find((item) => item.id === file.pageSource);
    if (source === undefined || source.deletedAt !== null) {
      return false;
    }
    const page = this.#pageRecord(file.pageSource, file.pageSlug);
    if (page === undefined || page.hiddenBySource) {
      return false;
    }
    if (page.deletedAt === null && page.visibility === "public") {
      return true;
    }
    return (
      actor.credential.kind !== "anonymous" && sourceFlagsRead(actor.credential, file.pageSource)
    );
  }

  #fileJson(file: DomainState["files"][number]): Record<string, unknown> {
    return {
      id: file.id,
      url: `${this.origin}/media/${file.id}`,
      media_type: file.mediaType,
      byte_size: file.byteSize,
      sha256: file.sha256,
    };
  }

  #whoami(credential: Credential): Record<string, unknown> {
    if (credential.kind === "owner") {
      return {
        credential: "owner",
        admin: true,
        site_write: true,
        sources: this.state.sources
          .filter((source) => source.deletedAt === null)
          .map((source) => ({ id: source.id, read: true, write: true, visibility: true })),
      };
    }
    if (credential.kind === "api_key" && credential.unrestrictedData) {
      return {
        credential: "api_key",
        admin: false,
        site_write: credential.siteWrite,
        sources: this.state.sources
          .filter((source) => source.deletedAt === null)
          .map((source) => ({ id: source.id, read: true, write: true, visibility: true })),
      };
    }
    if (credential.kind === "api_key" || credential.kind === "oauth") {
      return {
        credential: credential.kind,
        admin: false,
        site_write: credential.siteWrite,
        sources: credential.sources.map((source) => ({ ...source })),
      };
    }
    return { credential: "anonymous", admin: false, site_write: false, sources: [] };
  }

  #oauthToken(params: URLSearchParams): OauthHttpResult {
    const grantType = params.get("grant_type");
    if (grantType === "password" || grantType === "implicit") {
      return oauthError(400, "unsupported_grant_type", "grant type is not supported");
    }
    if (grantType === "authorization_code") {
      if (!this.oauthAuthorizationCode) {
        return oauthError(400, "unsupported_grant_type", "authorization code is not enabled");
      }
      return this.#authorizationCodeToken(params);
    }
    if (grantType === "refresh_token") {
      return this.#refresh(params.get("refresh_token") ?? "");
    }
    if (grantType !== "urn:ietf:params:oauth:grant-type:device_code") {
      return oauthError(400, "unsupported_grant_type", "grant type is not supported");
    }
    const deviceCode = params.get("device_code") ?? "";
    const device = this.#devices.find((item) =>
      hashesEqual(item.deviceCodeHash, sha256Hex(deviceCode)),
    );
    if (device === undefined) {
      return oauthError(400, "invalid_grant", "device code is invalid");
    }
    if (Date.parse(device.expiresAt) < this.clock.now().getTime()) {
      device.status = "expired";
      return oauthError(400, "expired_token", "device code has expired");
    }
    if (device.status === "pending") {
      return oauthError(400, "authorization_pending", "authorization pending");
    }
    if (device.consumed || device.grantId === null) {
      return oauthError(400, "invalid_grant", "device code is no longer valid");
    }
    const grant = this.#grants.find((item) => item.id === device.grantId);
    if (grant === undefined || grant.revokedAt !== null) {
      return oauthError(400, "invalid_grant", "grant is not available");
    }
    device.consumed = true;
    return this.#issueTokens(grant);
  }

  #authorizationCodeToken(params: URLSearchParams): OauthHttpResult {
    const code = params.get("code") ?? "";
    const verifier = params.get("code_verifier") ?? "";
    const record = this.#authCodes.find((item) => hashesEqual(item.codeHash, sha256Hex(code)));
    if (
      record === undefined ||
      record.consumed ||
      Date.parse(record.expiresAt) < this.clock.now().getTime()
    ) {
      return oauthError(400, "invalid_grant", "authorization code is invalid");
    }
    const digest = sha256Base64Url(verifier);
    if (verifier.length === 0 || !hashesEqual(digest, record.challenge)) {
      return oauthError(400, "invalid_grant", "pkce verification failed");
    }
    record.consumed = true;
    const grant: OauthGrantRecord = {
      id: randomId("gr_"),
      siteWrite: record.siteWrite,
      sources: record.sources,
      refreshTokenHash: null,
      rotatedRefreshHashes: [],
      revokedAt: null,
      createdAt: this.clock.iso(),
      accessTokens: [],
    };
    this.#grants.push(grant);
    return this.#issueTokens(grant);
  }

  #refresh(token: string): OauthHttpResult {
    if (token.length === 0) {
      return oauthError(400, "invalid_grant", "refresh token is invalid");
    }
    const hash = sha256Hex(token);
    for (const grant of this.#grants) {
      if (grant.rotatedRefreshHashes.some((item) => hashesEqual(item, hash))) {
        grant.revokedAt = this.clock.iso();
        grant.refreshTokenHash = null;
        grant.accessTokens = [];
        return oauthError(400, "invalid_grant", "refresh token was reused");
      }
    }
    const grant = this.#grants.find(
      (item) => item.refreshTokenHash !== null && hashesEqual(item.refreshTokenHash, hash),
    );
    if (grant === undefined || grant.revokedAt !== null) {
      return oauthError(400, "invalid_grant", "refresh token is invalid");
    }
    grant.rotatedRefreshHashes.push(hash);
    return this.#issueTokens(grant);
  }

  #issueTokens(grant: OauthGrantRecord): OauthHttpResult {
    const access = randomToken();
    const refresh = randomToken();
    const expiresAt = addMilliseconds(this.clock.iso(), ACCESS_TTL_MS);
    if (expiresAt === null) {
      return oauthError(400, "invalid_grant", "invalid timestamp");
    }
    grant.accessTokens.push({ hash: sha256Hex(access), expiresAt });
    grant.refreshTokenHash = sha256Hex(refresh);
    return {
      status: 200,
      body: {
        access_token: access,
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: refresh,
      },
    };
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const invalidString = Symbol("invalid-string");

function optionalString(value: unknown): string | undefined | typeof invalidString {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return invalidString;
  }
  return value;
}

function pageView(page: {
  source: string;
  slug: string;
  type: string;
  title: string;
  visibility: string;
  frontmatter: unknown;
  markdown: string;
  hash: string;
}): Record<string, unknown> {
  return {
    source: page.source,
    slug: page.slug,
    type: page.type,
    title: page.title,
    visibility: page.visibility,
    frontmatter: page.frontmatter,
    markdown: page.markdown,
    hash: page.hash,
  };
}

function canUpload(credential: Credential): boolean {
  if (credential.kind === "owner") {
    return true;
  }
  if (credential.kind === "api_key" && credential.unrestrictedData) {
    return true;
  }
  if (credential.kind === "api_key" || credential.kind === "oauth") {
    return credential.sources.some((source) => source.write);
  }
  return false;
}

function canSiteWrite(credential: Credential): boolean {
  if (credential.kind === "anonymous") {
    return false;
  }
  if (credential.kind === "owner") {
    return true;
  }
  return credential.siteWrite;
}

function sourceFlagsRead(credential: Credential, source: string): boolean {
  if (credential.kind === "owner") {
    return true;
  }
  if (credential.kind === "anonymous") {
    return false;
  }
  if (credential.kind === "api_key" && credential.unrestrictedData) {
    return true;
  }
  return credential.sources.some((item) => item.id === source && item.read);
}

function oauthError(status: number, error: string, message: string): OauthHttpResult {
  return { status, body: { error, message } };
}

function readCookie(header: string | null, name: string): string | null {
  if (header === null) {
    return null;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function normalizeArchivePath(input: string): string | null {
  if (input.startsWith("/") || input.includes("\\") || input.includes("\0")) {
    return null;
  }
  const parts: string[] = [];
  for (const part of input.split("/")) {
    if (part === "" || part === "." || part === "..") {
      if (part === "..") {
        return null;
      }
      continue;
    }
    parts.push(part);
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join("/");
}

function safeJoin(root: string, relative: string): string | null {
  if (relative.includes("\0") || path.isAbsolute(relative)) {
    return null;
  }
  const absolute = path.resolve(root, relative);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(prefix)) {
    return null;
  }
  return absolute;
}

function walkFiles(root: string): { path: string; absolute: string }[] {
  const files: { path: string; absolute: string }[] = [];
  const visit = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory)) {
      if (name === "node_modules" || name === "dist") {
        continue;
      }
      const absolute = path.join(directory, name);
      const relative = prefix.length === 0 ? name : `${prefix}/${name}`;
      const info = statSync(absolute);
      if (info.isDirectory()) {
        visit(absolute, relative);
        continue;
      }
      if (info.isFile()) {
        files.push({ path: relative, absolute });
      }
    }
  };
  visit(root, "");
  return files;
}

export function publicPageList(state: DomainState): Record<string, unknown>[] {
  return state.pages
    .filter((page) => {
      if (page.visibility !== "public" || page.deletedAt !== null || page.hiddenBySource) {
        return false;
      }
      const source = state.sources.find((item) => item.id === page.source);
      return source !== undefined && source.deletedAt === null;
    })
    .map((page) => ({ source: page.source, slug: page.slug, type: page.type, title: page.title }))
    .sort((left, right) =>
      left.source === right.source
        ? left.slug.localeCompare(right.slug)
        : left.source.localeCompare(right.source),
    );
}

export async function openRuntime(
  options: Omit<ServerOptions, "objectStore"> & { objectStore?: ObjectStore },
  objectStore: ObjectStore,
): Promise<Runtime> {
  const runtime = new Runtime({ ...options, objectStore });
  await runtime.bootstrap(options.ownerLogin, options.ownerPassword, options.ownerResetPassword);
  return runtime;
}
