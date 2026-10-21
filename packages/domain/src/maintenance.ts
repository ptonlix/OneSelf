import { fileObjectKey, sha256Hex } from "./hash.js";
import {
  isPastRetention,
  SOFT_DELETE_RETENTION_MS,
  timestampMs,
  UNREFERENCED_OBJECT_RETENTION_MS,
} from "./clock.js";
import { projectMarkdown } from "./markdown.js";
import { cloneState, type DomainState, type PageRecord, type PageVersion } from "./state.js";

export function runHourlyMaintenance(state: DomainState, now: string): DomainState {
  if (timestampMs(now) === null) {
    return cloneState(state);
  }
  const next = cloneState(state);
  const expiredPages = new Set<string>();
  for (const page of next.pages) {
    if (page.deletedAt !== null && isPastRetention(page.deletedAt, now, SOFT_DELETE_RETENTION_MS)) {
      expiredPages.add(pageKey(page.source, page.slug));
    }
  }
  const expiredSources = new Set(
    next.sources
      .filter(
        (source) =>
          source.deletedAt !== null &&
          isPastRetention(source.deletedAt, now, SOFT_DELETE_RETENTION_MS),
      )
      .map((source) => source.id),
  );
  if (expiredPages.size > 0 || expiredSources.size > 0) {
    next.pages = next.pages.filter((page) => {
      if (expiredSources.has(page.source) || expiredPages.has(pageKey(page.source, page.slug))) {
        return false;
      }
      return true;
    });
    next.versions = next.versions.filter(
      (version) =>
        !expiredSources.has(version.source) &&
        !expiredPages.has(pageKey(version.source, version.slug)),
    );
    next.sources = next.sources.filter((source) => !expiredSources.has(source.id));
    for (const file of next.files) {
      if (file.pageSource === null) {
        continue;
      }
      const attachedKey = pageKey(file.pageSource, file.pageSlug ?? "");
      if (expiredSources.has(file.pageSource) || expiredPages.has(attachedKey)) {
        file.pageSource = null;
        file.pageSlug = null;
      }
    }
  }
  const referenced = referencedObjectKeys(next);
  next.objects = next.objects.filter((object) => {
    if (object.kind === "site" || object.key.startsWith("sites/")) {
      return true;
    }
    if (referenced.has(object.key)) {
      return true;
    }
    return !isPastRetention(object.writtenAt, now, UNREFERENCED_OBJECT_RETENTION_MS);
  });
  return next;
}

/**
 * Rewrites page projections from stored Markdown objects.
 * Grants, key hashes, and the owner are not inputs. The site pointer is preserved.
 */
export function rebuildProjections(state: DomainState): DomainState {
  const next = cloneState(state);
  const targets = new Map<
    string,
    { source: string; slug: string; objectKey: string; writtenAt: string }
  >();
  for (const page of next.pages) {
    targets.set(pageKey(page.source, page.slug), {
      source: page.source,
      slug: page.slug,
      objectKey: page.objectKey,
      writtenAt: page.updatedAt,
    });
  }
  const latest = new Map<string, PageVersion>();
  for (const version of next.versions) {
    const key = pageKey(version.source, version.slug);
    const previous = latest.get(key);
    if (!previous || version.id > previous.id) {
      latest.set(key, version);
    }
  }
  for (const [key, version] of latest) {
    if (targets.has(key)) {
      continue;
    }
    targets.set(key, {
      source: version.source,
      slug: version.slug,
      objectKey: version.objectKey,
      writtenAt: version.writtenAt,
    });
  }
  for (const target of targets.values()) {
    const object = next.objects.find((item) => item.key === target.objectKey);
    if (!object) {
      continue;
    }
    const projected = projectMarkdown(object.bytes);
    if (!projected.ok) {
      continue;
    }
    const existing = next.pages.find(
      (page) => page.source === target.source && page.slug === target.slug,
    );
    const projection: Pick<
      PageRecord,
      | "type"
      | "title"
      | "visibility"
      | "frontmatter"
      | "body"
      | "markdown"
      | "contentHash"
      | "objectKey"
      | "chunks"
      | "links"
      | "tags"
      | "facts"
      | "timeline"
    > = {
      type: projected.value.type,
      title: projected.value.title,
      visibility: projected.value.visibility,
      frontmatter: projected.value.frontmatter,
      body: projected.value.body,
      markdown: object.bytes,
      contentHash: sha256Hex(object.bytes),
      objectKey: target.objectKey,
      chunks: [...projected.value.chunks],
      links: [...projected.value.links],
      tags: [...projected.value.tags],
      facts: [...projected.value.facts],
      timeline: [...projected.value.timeline],
    };
    if (existing) {
      Object.assign(existing, projection);
      continue;
    }
    next.pages.push({
      ...projection,
      source: target.source,
      slug: target.slug,
      updatedAt: target.writtenAt,
      deletedAt: null,
      hiddenBySource: false,
    });
  }
  return next;
}

export function referencedObjectKeys(state: DomainState): Set<string> {
  const keys = new Set<string>();
  for (const page of state.pages) {
    keys.add(page.objectKey);
  }
  for (const version of state.versions) {
    keys.add(version.objectKey);
  }
  for (const file of state.files) {
    keys.add(file.objectKey);
    keys.add(fileObjectKey(file.id));
  }
  return keys;
}

function pageKey(source: string, slug: string): string {
  return `${source}\u0000${slug}`;
}
