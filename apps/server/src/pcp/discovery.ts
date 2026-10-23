import {
  FILE_MEDIA_TYPES,
  MAX_FILE_BYTES,
  MAX_SITE_ARCHIVE_BYTES,
  MAX_SITE_ARCHIVE_FILES,
} from "@oneself/domain";
import { operations, publicEndpoints } from "@oneself/operations";

/**
 * Accepted credential headers. The runtime parses exactly these; discovery and
 * the OpenAPI security schemes are generated from this list.
 */
export const authHeaders = [
  { credential: "api_key", header: "Authorization", value: "ApiKey <key>" },
  { credential: "api_key", header: "X-Api-Key", value: "<key>" },
  { credential: "oauth", header: "Authorization", value: "Bearer <access_token>" },
] as const;

/**
 * The two uploads take multipart over HTTP and base64 arguments over MCP.
 * Limits come from the domain constants the runtime enforces.
 */
export const uploads = {
  file_upload: {
    field: "file",
    mcp_arguments: ["data_base64", "media_type"],
    media_types: FILE_MEDIA_TYPES,
    max_bytes: MAX_FILE_BYTES,
  },
  put_site: {
    field: "archive",
    mcp_arguments: ["archive_base64"],
    media_types: ["application/zip"],
    max_bytes: MAX_SITE_ARCHIVE_BYTES,
    max_files: MAX_SITE_ARCHIVE_FILES,
  },
} as const;

type UploadName = keyof typeof uploads;

export function isUpload(name: string): name is UploadName {
  return Object.hasOwn(uploads, name);
}

export function discoveryDocument(origin: string): Record<string, unknown> {
  return {
    protocol: "pcp",
    version: "1",
    operations: operations
      .filter((operation) => !operation.httpOnly)
      .map((operation) => ({
        name: operation.name,
        method: operation.method,
        path: operation.path,
      })),
    openapi: `${origin}/openapi.json`,
    mcp: `${origin}/mcp`,
    oauth: `${origin}/.well-known/oauth-authorization-server`,
    skills: {
      oneself: `${origin}/skills/oneself/SKILL.md`,
    },
    auth: {
      headers: authHeaders,
    },
    public: {
      credentials: "omit",
      endpoints: publicEndpoints.map((endpoint) => ({
        name: endpoint.name,
        method: endpoint.method,
        path: endpoint.path,
      })),
    },
    uploads,
  };
}

export function oauthMetadata(origin: string): Record<string, unknown> {
  return {
    issuer: origin,
    device_authorization_endpoint: `${origin}/oauth/device/auth`,
    token_endpoint: `${origin}/oauth/token`,
    grant_types_supported: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  };
}
