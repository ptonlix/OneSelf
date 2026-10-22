import { canApproveSiteActivation, canRequestSiteActivation, type Credential } from "./access.js";
import { addMilliseconds, SITE_ACTIVATION_TTL_MS, timestampMs } from "./clock.js";
import { fail, ok, type DomainErrorCode, type DomainResult } from "./result.js";
import type { SiteActivationRecord, SiteReleaseRecord } from "./state.js";

export const PUBLIC_PAGE_RELEASE_ID = "public-page";

/** Paths the static tree must not cover. A single hit rejects the whole archive. */
export const RESERVED_SITE_PATHS = [
  "pcp",
  "oauth",
  ".well-known",
  "admin",
  "skills",
  "media",
  "_preview",
] as const;

export const MAX_SITE_ARCHIVE_FILES = 200;
export const MAX_SITE_ARCHIVE_BYTES = 20 * 1024 * 1024;

export const RELEASE_ID_PATTERN = /^rel_[0-9a-f]{32}$/;

export type SitePointer = {
  readonly releaseId: string;
};

export type SiteArchiveEntry = {
  readonly path: string;
  readonly size: number;
  readonly symlink: boolean;
};

export type SiteDecision = {
  readonly pointer: SitePointer;
  readonly activation: SiteActivationRecord;
};

export function initialSitePointer(): SitePointer {
  return { releaseId: PUBLIC_PAGE_RELEASE_ID };
}

export function isSiteReleaseId(value: string): boolean {
  return RELEASE_ID_PATTERN.test(value);
}

export function isSitePointerTarget(value: string): boolean {
  return value === PUBLIC_PAGE_RELEASE_ID || isSiteReleaseId(value);
}

export function describeSite(
  pointer: SitePointer,
  releases: readonly SiteReleaseRecord[],
): { pointer: SitePointer; releases: readonly SiteReleaseRecord[] } {
  return { pointer: { releaseId: pointer.releaseId }, releases };
}

/**
 * Preview is anonymous and must return the pointer it was given.
 * The live path changes only in {@link decideSiteActivation}.
 */
export function previewSite(
  pointer: SitePointer,
  releases: readonly SiteReleaseRecord[],
  releaseId: string,
): DomainResult<{ pointer: SitePointer; url: string }> {
  if (!isSiteReleaseId(releaseId)) {
    return fail("invalid", "release id is invalid");
  }
  if (!releases.some((release) => release.id === releaseId)) {
    return fail("not_found", "release not found");
  }
  return ok({
    pointer: { releaseId: pointer.releaseId },
    url: `/_preview/${releaseId}/`,
  });
}

export function assessSiteArchive(
  entries: readonly SiteArchiveEntry[],
): DomainResult<{ accepted: true }> {
  let fileCount = 0;
  let totalBytes = 0;
  let hasRootIndex = false;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
      return fail("invalid", "archive entry size is invalid");
    }
    totalBytes += entry.size;
    if (entry.symlink) {
      return rejectArchive("symlink");
    }
    const inspected = inspectArchivePath(entry.path);
    if (!inspected.ok) {
      return rejectArchive(inspected.reason);
    }
    if (isReservedSitePath(inspected.path)) {
      return rejectArchive("reserved path");
    }
    if (!inspected.directory) {
      fileCount += 1;
      if (inspected.path === "index.html") {
        hasRootIndex = true;
      }
    }
  }
  if (fileCount > MAX_SITE_ARCHIVE_FILES || totalBytes > MAX_SITE_ARCHIVE_BYTES) {
    return fail("payload_too_large", "archive exceeds the site upload limit");
  }
  if (!hasRootIndex) {
    return rejectArchive("root index.html");
  }
  return ok({ accepted: true });
}

export function requestSiteActivation(input: {
  readonly pointer: SitePointer;
  readonly releases: readonly SiteReleaseRecord[];
  readonly credential: Credential;
  readonly activationId: string;
  readonly releaseId: string;
  readonly now: string;
}): DomainResult<{ pointer: SitePointer; activation: SiteActivationRecord; approvalUrl: string }> {
  const allowed = canRequestSiteActivation(input.credential);
  if (allowed !== "ok") {
    return fail(allowed, "site activation cannot be requested");
  }
  if (input.activationId.length === 0) {
    return fail("invalid", "activation id is required");
  }
  if (!isSitePointerTarget(input.releaseId)) {
    return fail("invalid", "release id is invalid");
  }
  if (
    input.releaseId !== PUBLIC_PAGE_RELEASE_ID &&
    !input.releases.some((release) => release.id === input.releaseId)
  ) {
    return fail("not_found", "release not found");
  }
  const expiresAt = addMilliseconds(input.now, SITE_ACTIVATION_TTL_MS);
  if (timestampMs(input.now) === null || expiresAt === null) {
    return fail("invalid", "invalid timestamp");
  }
  return ok({
    pointer: { releaseId: input.pointer.releaseId },
    approvalUrl: `/admin/site-activations/${input.activationId}`,
    activation: {
      id: input.activationId,
      releaseId: input.releaseId,
      status: "pending",
      expiresAt,
      createdAt: input.now,
      decidedAt: null,
    },
  });
}

export function decideSiteActivation(input: {
  readonly pointer: SitePointer;
  readonly activation: SiteActivationRecord;
  readonly decision: "approve" | "reject";
  readonly credential: Credential;
  readonly now: string;
}):
  | { ok: true; value: SiteDecision }
  | { ok: false; error: DomainErrorCode; message: string; value: SiteDecision } {
  const unchanged: SiteDecision = {
    pointer: { releaseId: input.pointer.releaseId },
    activation: input.activation,
  };
  const allowed = canApproveSiteActivation(input.credential);
  if (allowed !== "ok") {
    return { ok: false, error: allowed, message: "site approval is owner only", value: unchanged };
  }
  if (timestampMs(input.now) === null) {
    return { ok: false, error: "invalid", message: "invalid timestamp", value: unchanged };
  }
  if (input.activation.status !== "pending") {
    return { ok: false, error: "conflict", message: "activation is not pending", value: unchanged };
  }
  if (!isSitePointerTarget(input.activation.releaseId)) {
    return { ok: false, error: "invalid", message: "release id is invalid", value: unchanged };
  }
  if (isActivationExpired(input.activation.expiresAt, input.now)) {
    return {
      ok: false,
      error: "conflict",
      message: "activation has expired",
      value: {
        pointer: unchanged.pointer,
        activation: { ...input.activation, status: "expired", decidedAt: input.now },
      },
    };
  }
  if (input.decision === "reject") {
    return {
      ok: true,
      value: {
        pointer: unchanged.pointer,
        activation: { ...input.activation, status: "rejected", decidedAt: input.now },
      },
    };
  }
  return {
    ok: true,
    value: {
      pointer: { releaseId: input.activation.releaseId },
      activation: { ...input.activation, status: "approved", decidedAt: input.now },
    },
  };
}

function isActivationExpired(expiresAt: string, now: string): boolean {
  const expires = timestampMs(expiresAt);
  const current = timestampMs(now);
  if (expires === null || current === null) {
    return true;
  }
  return current > expires;
}

function rejectArchive(reason: string): DomainResult<never> {
  return fail("invalid", `archive rejected: ${reason}`);
}

function isReservedSitePath(path: string): boolean {
  const [first] = path.split("/");
  return RESERVED_SITE_PATHS.some((reserved) => reserved === first);
}

function inspectArchivePath(
  input: string,
): { ok: true; path: string; directory: boolean } | { ok: false; reason: string } {
  if (input.length === 0) {
    return { ok: false, reason: "empty path" };
  }
  if (input.startsWith("/") || input.startsWith("\\") || /^[A-Za-z]:/.test(input)) {
    return { ok: false, reason: "absolute path" };
  }
  if (input.includes("\\") || input.includes("\0")) {
    return { ok: false, reason: "path traversal" };
  }
  const directory = input.endsWith("/");
  const trimmed = directory ? input.slice(0, -1) : input;
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty path" };
  }
  const parts: string[] = [];
  for (const part of trimmed.split("/")) {
    if (part === "" || part === "..") {
      return { ok: false, reason: "path traversal" };
    }
    if (part === ".") {
      continue;
    }
    parts.push(part);
  }
  if (parts.length === 0) {
    return { ok: false, reason: "empty path" };
  }
  return { ok: true, path: parts.join("/"), directory };
}
