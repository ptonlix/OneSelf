import type { CreateApiKeyBody, DeviceApprovalBody, GrantFlag, SourceDraft } from "./types";

const RELEASE_ID = /^(?:public-page|rel_[0-9a-fA-F]{32})$/;

export function draftsFromDirectories(ids: readonly string[]): SourceDraft[] {
  return ids.map((id) => ({ id, read: false, write: false, visibility: false }));
}

export function toggleDraft(
  drafts: readonly SourceDraft[],
  id: string,
  flag: GrantFlag,
  value: boolean,
): SourceDraft[] {
  return drafts.map((draft) => (draft.id === id ? { ...draft, [flag]: value } : draft));
}

export function selectedGrants(drafts: readonly SourceDraft[]): SourceDraft[] {
  return drafts
    .filter((draft) => draft.read || draft.write || draft.visibility)
    .map((draft) => ({
      id: draft.id,
      read: draft.read,
      write: draft.write,
      visibility: draft.visibility,
    }));
}

export function createApiKeyBody(input: {
  label: string;
  unrestrictedData: boolean;
  siteWrite: boolean;
  drafts: readonly SourceDraft[];
}): CreateApiKeyBody {
  return {
    label: input.label.trim(),
    unrestricted_data: input.unrestrictedData,
    site_write: input.siteWrite,
    sources: input.unrestrictedData ? [] : selectedGrants(input.drafts),
  };
}

export function deviceApprovalBody(input: {
  userCode: string;
  siteWrite: boolean;
  drafts: readonly SourceDraft[];
}): DeviceApprovalBody {
  return {
    user_code: input.userCode.trim(),
    site_write: input.siteWrite,
    sources: selectedGrants(input.drafts),
  };
}

export function isReleaseId(value: string): boolean {
  return RELEASE_ID.test(value.trim());
}
