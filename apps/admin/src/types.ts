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
  site_write: boolean;
  sources: SourceGrant[];
}

export type SiteDecision = "approve" | "reject";

export interface SiteDecisionBody {
  decision: SiteDecision;
}

export type GrantFlag = "read" | "write" | "visibility";

export interface SourceDraft {
  id: string;
  read: boolean;
  write: boolean;
  visibility: boolean;
}
