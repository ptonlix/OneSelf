import { canAddSource, canDeleteOrRestoreSource, sourceFlags, type Credential } from "./access.js";
import { isPastRetention, SOFT_DELETE_RETENTION_MS, timestampMs } from "./clock.js";
import { isSourceName } from "./identity.js";
import { fail, ok, type DomainResult } from "./result.js";
import { cloneState, type DomainState } from "./state.js";

export type SourceStatus = {
  readonly id: string;
  readonly pageCount: number;
  readonly latestWriteAt: string | null;
};

export function sourcesAdd(
  state: DomainState,
  credential: Credential,
  input: { readonly id: string },
): DomainResult<{ state: DomainState }> {
  const allowed = canAddSource(credential);
  if (allowed !== "ok") {
    return fail(allowed, "source cannot be added");
  }
  if (!isSourceName(input.id)) {
    return fail("invalid", "source is invalid");
  }
  const existing = state.sources.find((source) => source.id === input.id);
  if (existing) {
    return fail("conflict", "source already exists");
  }
  const next = cloneState(state);
  next.sources.push({ id: input.id, deletedAt: null });
  return ok({ state: next });
}

export function sourcesDelete(
  state: DomainState,
  credential: Credential,
  input: { readonly id: string; readonly now: string },
): DomainResult<{ state: DomainState }> {
  const allowed = canDeleteOrRestoreSource(credential);
  if (allowed !== "ok") {
    return fail(allowed, "source cannot be deleted");
  }
  if (timestampMs(input.now) === null) {
    return fail("invalid", "invalid timestamp");
  }
  const existing = state.sources.find(
    (source) => source.id === input.id && source.deletedAt === null,
  );
  if (!existing) {
    return fail("not_found", "source not found");
  }
  const next = cloneState(state);
  const source = next.sources.find((item) => item.id === input.id);
  if (!source) {
    return fail("not_found", "source not found");
  }
  source.deletedAt = input.now;
  for (const page of next.pages) {
    if (page.source !== input.id || page.deletedAt !== null) {
      continue;
    }
    page.hiddenBySource = true;
  }
  return ok({ state: next });
}

export function sourcesRestore(
  state: DomainState,
  credential: Credential,
  input: { readonly id: string; readonly now: string },
): DomainResult<{ state: DomainState }> {
  const allowed = canDeleteOrRestoreSource(credential);
  if (allowed !== "ok") {
    return fail(allowed, "source cannot be restored");
  }
  if (timestampMs(input.now) === null) {
    return fail("invalid", "invalid timestamp");
  }
  const existing = state.sources.find(
    (source) => source.id === input.id && source.deletedAt !== null,
  );
  if (!existing || existing.deletedAt === null) {
    return fail("not_found", "source not found");
  }
  if (isPastRetention(existing.deletedAt, input.now, SOFT_DELETE_RETENTION_MS)) {
    return fail("conflict", "restore window has passed");
  }
  const next = cloneState(state);
  const source = next.sources.find((item) => item.id === input.id);
  if (!source) {
    return fail("not_found", "source not found");
  }
  source.deletedAt = null;
  for (const page of next.pages) {
    if (page.source === input.id && page.hiddenBySource) {
      page.hiddenBySource = false;
    }
  }
  return ok({ state: next });
}

export function sourcesList(
  state: DomainState,
  credential: Credential,
): DomainResult<readonly { id: string }[]> {
  if (credential.kind === "anonymous") {
    return fail("unauthorized", "authentication required");
  }
  const items = state.sources
    .filter((source) => source.deletedAt === null && sourceFlags(credential, source.id).read)
    .map((source) => ({ id: source.id }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return ok(items);
}

export function sourcesStatus(
  state: DomainState,
  credential: Credential,
  id: string,
): DomainResult<SourceStatus> {
  if (credential.kind === "anonymous") {
    return fail("unauthorized", "authentication required");
  }
  if (!isSourceName(id)) {
    return fail("not_found", "source not found");
  }
  const source = state.sources.find((item) => item.id === id && item.deletedAt === null);
  if (!source || !sourceFlags(credential, id).read) {
    return fail("not_found", "source not found");
  }
  const live = state.pages.filter(
    (page) => page.source === id && page.deletedAt === null && !page.hiddenBySource,
  );
  let latestWriteAt: string | null = null;
  for (const page of live) {
    if (latestWriteAt === null || page.updatedAt > latestWriteAt) {
      latestWriteAt = page.updatedAt;
    }
  }
  return ok({ id, pageCount: live.length, latestWriteAt });
}
