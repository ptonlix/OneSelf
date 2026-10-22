export {
  canAddSource,
  canApproveSiteActivation,
  canDeleteOrRestoreSource,
  canRequestSiteActivation,
  knowsSource,
  sourceFlags,
} from "./access.js";
export type { Credential, SourceFlags, SourceGrant } from "./access.js";

export {
  addMilliseconds,
  isPastRetention,
  SITE_ACTIVATION_TTL_MS,
  SOFT_DELETE_RETENTION_MS,
  timestampMs,
  UNREFERENCED_OBJECT_RETENTION_MS,
} from "./clock.js";

export { fileObjectKey, pageObjectKey, sha256Hex } from "./hash.js";

export {
  isSlug,
  isSourceName,
  isTypeName,
  PRELOADED_SOURCE_NAMES,
  SLUG_PATTERN,
  SOURCE_PATTERN,
} from "./identity.js";

export { projectMarkdown } from "./markdown.js";
export type { PageProjection, Visibility } from "./markdown.js";

export { parseFences } from "./fences.js";
export type { Fact, TimelineEntry } from "./fences.js";

export { chunkBody } from "./chunks.js";
export type { PageChunk } from "./chunks.js";

export { extractLinks } from "./links.js";
export type { PageLink } from "./links.js";

export { rebuildProjections, referencedObjectKeys, runHourlyMaintenance } from "./maintenance.js";

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
} from "./pages.js";
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
} from "./pages.js";

export {
  sourcesAdd,
  sourcesDelete,
  sourcesList,
  sourcesRestore,
  sourcesStatus,
} from "./sources.js";
export type { SourceStatus } from "./sources.js";

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
} from "./site-pointer.js";
export type { SiteArchiveEntry, SiteDecision, SitePointer } from "./site-pointer.js";

export { cloneState, emptyDomainState, VERSION_LIMIT } from "./state.js";
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
} from "./state.js";

export { fail, ok } from "./result.js";
export type { DomainErrorCode, DomainFailure, DomainResult, DomainSuccess } from "./result.js";
