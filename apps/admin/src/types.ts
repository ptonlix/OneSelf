export interface SourceGrant {
  id: string;
  read: boolean;
  write: boolean;
  visibility: boolean;
}

export interface SourceDirectory {
  id: string;
}

export interface Whoami {
  credential: string;
  admin: boolean;
  site_write: boolean;
  sources: SourceGrant[];
}

export interface LoginResult {
  must_change_password: boolean;
}

export interface PasswordResult {
  must_change_password: false;
}

export interface PendingApproval {
  id: string;
  status: string;
  approval_url: string;
  expires_at: string;
}

export interface ApiKeyRequest {
  id: string;
  label: string;
  unrestricted_data: boolean;
  site_write: boolean;
  sources: SourceGrant[];
  status: string;
  expires_at: string;
}

export interface SiteActivation {
  id: string;
  release_id: string;
  status: string;
  expires_at: string;
}

export interface RevealedApiKey {
  key: string;
}

export interface CreateApiKeyBody {
  label: string;
  unrestricted_data: boolean;
  site_write: boolean;
  sources: SourceGrant[];
}

export interface DeviceApprovalBody {
  user_code: string;
  label: string;
  unrestricted_data: boolean;
  site_write: boolean;
  sources: SourceGrant[];
}

export type SiteDecision = "approve" | "reject";

export type GrantFlag = "read" | "write" | "visibility";

export interface SourceDraft {
  id: string;
  read: boolean;
  write: boolean;
  visibility: boolean;
}

export interface ApiKeySummary {
  id: string;
  label: string;
  unrestricted_data: boolean;
  site_write: boolean;
  sources: SourceGrant[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface SourceStatus {
  id: string;
  page_count: number;
  latest_write_at: string | null;
}

export interface SiteRelease {
  id: string;
  created_at: string;
}

export interface SiteList {
  pointer: string;
  releases: SiteRelease[];
}

export interface PublicPageSummary {
  source: string;
  slug: string;
  type: string;
  title: string;
}

/** One row of `GET /admin/oauth-grants`; mirrors the server's `OauthGrantView` field for field. */
export interface OauthGrantView {
  id: string;
  label: string | null;
  site_write: boolean;
  unrestricted_data: boolean;
  sources: SourceGrant[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface DeletedSource {
  id: string;
  deleted_at: string;
}

export interface QueryPage {
  source: string;
  slug: string;
  type: string;
  title: string;
  updated_at: string;
}

interface GraphEnd {
  source: string;
  slug: string;
}

export interface GraphPage {
  source: string;
  slug: string;
  type: string;
  title: string;
  visibility: "public" | "private";
  updated_at: string;
  file_count: number;
  media_types: string[];
}

export interface AdminGraph {
  sources: { id: string; page_count: number }[];
  pages: GraphPage[];
  links: { from: GraphEnd; to: GraphEnd; broken: boolean }[];
  truncated: boolean;
}
