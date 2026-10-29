export type SourceGrant = {
  readonly id: string;
  readonly read: boolean;
  readonly write: boolean;
  readonly visibility: boolean;
};

export type Credential =
  | { readonly kind: "anonymous" }
  | { readonly kind: "owner" }
  | {
      readonly kind: "api_key";
      readonly unrestrictedData: boolean;
      readonly siteWrite: boolean;
      readonly sources: readonly SourceGrant[];
    }
  | {
      readonly kind: "oauth";
      readonly unrestrictedData: boolean;
      readonly siteWrite: boolean;
      readonly sources: readonly SourceGrant[];
    };

export type SourceFlags = {
  readonly read: boolean;
  readonly write: boolean;
  readonly visibility: boolean;
};

function hasUnrestrictedData(credential: Credential): boolean {
  return (
    (credential.kind === "api_key" || credential.kind === "oauth") && credential.unrestrictedData
  );
}

export function sourceFlags(credential: Credential, source: string): SourceFlags {
  if (credential.kind === "owner") {
    return { read: true, write: true, visibility: true };
  }
  if (credential.kind === "anonymous") {
    return { read: false, write: false, visibility: false };
  }
  if (hasUnrestrictedData(credential)) {
    return { read: true, write: true, visibility: true };
  }
  const grant = credential.sources.find((item) => item.id === source);
  if (!grant) {
    return { read: false, write: false, visibility: false };
  }
  return { read: grant.read, write: grant.write, visibility: grant.visibility };
}

export function knowsSource(credential: Credential, source: string): boolean {
  const flags = sourceFlags(credential, source);
  return flags.read || flags.write || flags.visibility;
}

export function canAddSource(credential: Credential): "ok" | "unauthorized" | "forbidden" {
  if (credential.kind === "anonymous") {
    return "unauthorized";
  }
  if (credential.kind === "owner" || hasUnrestrictedData(credential)) {
    return "ok";
  }
  return "forbidden";
}

export function canDeleteOrRestoreSource(
  credential: Credential,
): "ok" | "unauthorized" | "forbidden" {
  if (credential.kind === "anonymous") {
    return "unauthorized";
  }
  if (credential.kind === "owner") {
    return "ok";
  }
  return "forbidden";
}

export function canRequestSiteActivation(
  credential: Credential,
): "ok" | "unauthorized" | "forbidden" {
  if (credential.kind === "anonymous") {
    return "unauthorized";
  }
  if (credential.kind === "owner") {
    return "ok";
  }
  if (credential.siteWrite) {
    return "ok";
  }
  return "forbidden";
}

export function canApproveSiteActivation(
  credential: Credential,
): "ok" | "unauthorized" | "forbidden" {
  if (credential.kind === "anonymous") {
    return "unauthorized";
  }
  if (credential.kind === "owner") {
    return "ok";
  }
  return "forbidden";
}
