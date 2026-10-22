import type { PageChunk } from "./chunks.js";
import type { Fact, TimelineEntry } from "./fences.js";
import type { Frontmatter } from "./frontmatter.js";
import type { PageLink } from "./links.js";
import type { Visibility } from "./markdown.js";

export type StoredObjectKind = "page" | "file" | "site";

export type StoredObject = {
  key: string;
  bytes: string;
  writtenAt: string;
  kind: StoredObjectKind;
};

export type StoredFile = {
  id: string;
  objectKey: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  pageSource: string | null;
  pageSlug: string | null;
  createdAt: string;
};

export type PageVersion = {
  id: number;
  source: string;
  slug: string;
  contentHash: string;
  objectKey: string;
  frontmatter: Frontmatter;
  writtenAt: string;
};

export type PageRecord = {
  source: string;
  slug: string;
  type: string;
  title: string;
  visibility: Visibility;
  frontmatter: Frontmatter;
  body: string;
  markdown: string;
  contentHash: string;
  objectKey: string;
  updatedAt: string;
  deletedAt: string | null;
  hiddenBySource: boolean;
  chunks: PageChunk[];
  links: PageLink[];
  tags: string[];
  facts: Fact[];
  timeline: TimelineEntry[];
};

export type SourceRecord = {
  id: string;
  deletedAt: string | null;
};

export type SiteReleaseRecord = {
  id: string;
  createdAt: string;
};

export type SiteActivationStatus = "pending" | "approved" | "rejected" | "expired";

export type SiteActivationRecord = {
  id: string;
  releaseId: string;
  status: SiteActivationStatus;
  expiresAt: string;
  createdAt: string;
  decidedAt: string | null;
};

export type SiteState = {
  pointer: { releaseId: string };
  releases: SiteReleaseRecord[];
  activations: SiteActivationRecord[];
};

export type DomainState = {
  sources: SourceRecord[];
  pages: PageRecord[];
  versions: PageVersion[];
  objects: StoredObject[];
  files: StoredFile[];
  site: SiteState;
};

export const VERSION_LIMIT = 50;

export function emptyDomainState(): DomainState {
  return {
    sources: [],
    pages: [],
    versions: [],
    objects: [],
    files: [],
    site: {
      pointer: { releaseId: "public-page" },
      releases: [],
      activations: [],
    },
  };
}

export function cloneState(state: DomainState): DomainState {
  return structuredClone(state);
}
