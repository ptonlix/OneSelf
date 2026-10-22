export {
  canAddSource,
  canApproveSiteActivation,
  canDeleteOrRestoreSource,
  canRequestSiteActivation,
  knowsSource,
  sourceFlags,
} from "./access.ts";
export type { Credential, SourceFlags, SourceGrant } from "./access.ts";

export {
  addMilliseconds,
  isPastRetention,
  SITE_ACTIVATION_TTL_MS,
  SOFT_DELETE_RETENTION_MS,
  timestampMs,
  UNREFERENCED_OBJECT_RETENTION_MS,
} from "./clock.ts";

export { fileObjectKey, pageObjectKey, sha256Hex } from "./hash.ts";

export {
  isSlug,
  isSourceName,
  isTypeName,
  PRELOADED_SOURCE_NAMES,
  SLUG_PATTERN,
  SOURCE_PATTERN,
} from "./identity.ts";

export { projectMarkdown } from "./markdown.ts";
export type { PageProjection, Visibility } from "./markdown.ts";

export { parseFences } from "./fences.ts";
export type { Fact, TimelineEntry } from "./fences.ts";

export { chunkBody } from "./chunks.ts";
export type { PageChunk } from "./chunks.ts";

export { extractLinks } from "./links.ts";
export type { PageLink } from "./links.ts";

export { rebuildProjections, referencedObjectKeys, runHourlyMaintenance } from "./maintenance.ts";

export {
  deletePage,
  editPage,
  getPage,
  getVersions,
  listPages,
  putPage,
  putPages,
  readPublicPage,
  resolveSlugs,
  restorePage,
  revertPage,
} from "./pages.ts";
export type {
  CommandContext,
  ListPagesQuery,
  PageEdit,
  PageListItem,
  PageView,
  PageWrite,
  PublicPageView,
  PutPageInput,
  SlugResolution,
  VersionView,
} from "./pages.ts";

export {
  sourcesAdd,
  sourcesDelete,
  sourcesList,
  sourcesRestore,
  sourcesStatus,
} from "./sources.ts";
export type { SourceStatus } from "./sources.ts";

export {
  assessSiteArchive,
  decideSiteActivation,
  describeSite,
  initialSitePointer,
  isSitePointerTarget,
  isSiteReleaseId,
  MAX_SITE_ARCHIVE_BYTES,
  MAX_SITE_ARCHIVE_FILES,
  PUBLIC_PAGE_RELEASE_ID,
  previewSite,
  RELEASE_ID_PATTERN,
  requestSiteActivation,
  RESERVED_SITE_PATHS,
} from "./site-pointer.ts";
export type { SiteArchiveEntry, SiteDecision, SitePointer } from "./site-pointer.ts";

export { cloneState, emptyDomainState, VERSION_LIMIT } from "./state.ts";
export type {
  DomainState,
  PageRecord,
  PageVersion,
  SiteActivationRecord,
  SiteActivationStatus,
  SiteReleaseRecord,
  SiteState,
  SourceRecord,
  StoredFile,
  StoredObject,
  StoredObjectKind,
} from "./state.ts";

export { fail, ok } from "./result.ts";
export type { DomainErrorCode, DomainFailure, DomainResult, DomainSuccess } from "./result.ts";
