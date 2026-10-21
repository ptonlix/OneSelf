/**
 * PCP operation registry. Names, methods, and paths are the architecture
 * section 6 tables. `GET /media/{id}` is byte delivery, not an operation.
 * Error codes are the shared protocol vocabulary, not a per-operation subset.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Operation = {
  readonly name: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly httpOnly: boolean;
};

export type ErrorCodeDefinition = {
  readonly error: string;
  readonly status: number;
};

const registeredOperations = [
  { name: "put_page", method: "PUT", path: "/pcp/v1/pages/{source}/{slug}", httpOnly: false },
  { name: "edit_page", method: "PATCH", path: "/pcp/v1/pages/{source}/{slug}", httpOnly: false },
  { name: "put_pages", method: "POST", path: "/pcp/v1/pages", httpOnly: false },
  { name: "get_page", method: "GET", path: "/pcp/v1/pages/{source}/{slug}", httpOnly: false },
  { name: "list_pages", method: "GET", path: "/pcp/v1/pages", httpOnly: false },
  { name: "delete_page", method: "DELETE", path: "/pcp/v1/pages/{source}/{slug}", httpOnly: false },
  {
    name: "restore_page",
    method: "POST",
    path: "/pcp/v1/pages/{source}/{slug}/restore",
    httpOnly: false,
  },
  {
    name: "get_versions",
    method: "GET",
    path: "/pcp/v1/pages/{source}/{slug}/versions",
    httpOnly: false,
  },
  {
    name: "revert_version",
    method: "POST",
    path: "/pcp/v1/pages/{source}/{slug}/revert",
    httpOnly: false,
  },
  { name: "resolve_slugs", method: "POST", path: "/pcp/v1/slugs/resolve", httpOnly: false },
  { name: "file_upload", method: "POST", path: "/pcp/v1/files", httpOnly: false },
  { name: "file_list", method: "GET", path: "/pcp/v1/files", httpOnly: false },
  { name: "file_url", method: "GET", path: "/pcp/v1/files/{id}", httpOnly: false },
  { name: "search", method: "POST", path: "/pcp/v1/search", httpOnly: false },
  { name: "query", method: "POST", path: "/pcp/v1/query", httpOnly: false },
  {
    name: "add_tag",
    method: "PUT",
    path: "/pcp/v1/pages/{source}/{slug}/tags/{tag}",
    httpOnly: false,
  },
  {
    name: "remove_tag",
    method: "DELETE",
    path: "/pcp/v1/pages/{source}/{slug}/tags/{tag}",
    httpOnly: false,
  },
  { name: "get_tags", method: "GET", path: "/pcp/v1/pages/{source}/{slug}/tags", httpOnly: false },
  { name: "add_link", method: "POST", path: "/pcp/v1/links", httpOnly: false },
  { name: "remove_link", method: "DELETE", path: "/pcp/v1/links", httpOnly: false },
  {
    name: "get_links",
    method: "GET",
    path: "/pcp/v1/pages/{source}/{slug}/links",
    httpOnly: false,
  },
  {
    name: "get_backlinks",
    method: "GET",
    path: "/pcp/v1/pages/{source}/{slug}/backlinks",
    httpOnly: false,
  },
  {
    name: "add_timeline_entry",
    method: "POST",
    path: "/pcp/v1/pages/{source}/{slug}/timeline",
    httpOnly: false,
  },
  {
    name: "get_timeline",
    method: "GET",
    path: "/pcp/v1/pages/{source}/{slug}/timeline",
    httpOnly: false,
  },
  { name: "remember", method: "POST", path: "/pcp/v1/facts", httpOnly: false },
  { name: "forget", method: "POST", path: "/pcp/v1/facts/{id}/forget", httpOnly: false },
  { name: "recall", method: "POST", path: "/pcp/v1/recall", httpOnly: false },
  { name: "sources_list", method: "GET", path: "/pcp/v1/sources", httpOnly: false },
  { name: "sources_add", method: "POST", path: "/pcp/v1/sources", httpOnly: false },
  { name: "sources_delete", method: "DELETE", path: "/pcp/v1/sources/{id}", httpOnly: false },
  {
    name: "sources_restore",
    method: "POST",
    path: "/pcp/v1/sources/{id}/restore",
    httpOnly: false,
  },
  { name: "sources_status", method: "GET", path: "/pcp/v1/sources/{id}", httpOnly: false },
  { name: "whoami", method: "GET", path: "/pcp/v1/whoami", httpOnly: false },
  { name: "list_skills", method: "GET", path: "/pcp/v1/skills", httpOnly: false },
  { name: "get_skill", method: "GET", path: "/pcp/v1/skills/{name}", httpOnly: false },
  { name: "list_sites", method: "GET", path: "/pcp/v1/site", httpOnly: false },
  { name: "get_site", method: "GET", path: "/pcp/v1/site/source", httpOnly: false },
  { name: "put_site", method: "POST", path: "/pcp/v1/site/releases", httpOnly: false },
  {
    name: "preview_site",
    method: "POST",
    path: "/pcp/v1/site/releases/{id}/preview",
    httpOnly: false,
  },
  { name: "activate_site", method: "POST", path: "/pcp/v1/site/activate", httpOnly: false },
  { name: "create_api_key", method: "POST", path: "/pcp/v1/api-keys", httpOnly: true },
  { name: "list_api_keys", method: "GET", path: "/pcp/v1/api-keys", httpOnly: true },
  { name: "revoke_api_key", method: "DELETE", path: "/pcp/v1/api-keys/{id}", httpOnly: true },
] as const satisfies readonly Operation[];

for (const operation of registeredOperations) {
  Object.freeze(operation);
}

export const operations: readonly Operation[] = Object.freeze(registeredOperations);

export type OperationName = (typeof registeredOperations)[number]["name"];

const registeredErrorCodes = [
  { error: "not_found", status: 404 },
  { error: "unauthorized", status: 401 },
  { error: "forbidden", status: 403 },
  { error: "conflict", status: 409 },
  { error: "invalid", status: 400 },
  { error: "payload_too_large", status: 413 },
  { error: "password_change_required", status: 403 },
] as const satisfies readonly ErrorCodeDefinition[];

for (const errorCode of registeredErrorCodes) {
  Object.freeze(errorCode);
}

export const errorCodes: readonly ErrorCodeDefinition[] = Object.freeze(registeredErrorCodes);

export type ErrorCode = (typeof registeredErrorCodes)[number]["error"];

export type ErrorStatus = (typeof registeredErrorCodes)[number]["status"];

/** Wire body is only these fields. The message text is not a protocol code. */
export const errorBodyFields = ["error", "message"] as const;

export type OperationErrorBody = {
  readonly error: ErrorCode;
  readonly message: string;
};

export type HttpRoute = {
  readonly name: string;
  readonly method: HttpMethod;
  readonly path: string;
};

export type McpTool = {
  readonly name: string;
};

export type TransportProjection = {
  readonly http: readonly HttpRoute[];
  readonly mcp: readonly McpTool[];
};

export function generateTransports(source: readonly Operation[] = operations): TransportProjection {
  return {
    http: source.map((operation) => ({
      name: operation.name,
      method: operation.method,
      path: operation.path,
    })),
    mcp: source
      .filter((operation) => !operation.httpOnly)
      .map((operation) => ({
        name: operation.name,
      })),
  };
}
