import { describe, expect, it } from "vitest";

import {
  errorBodyFields,
  errorCodes,
  generateTransports,
  operations,
  type HttpMethod,
  type Operation,
} from "./index.ts";

const documentedOperations: readonly Operation[] = [
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
];

const documentedErrorCodes: readonly { error: string; status: number }[] = [
  { error: "not_found", status: 404 },
  { error: "unauthorized", status: 401 },
  { error: "forbidden", status: 403 },
  { error: "conflict", status: 409 },
  { error: "invalid", status: 400 },
  { error: "payload_too_large", status: 413 },
  { error: "password_change_required", status: 403 },
];

const keyOperationNames = ["create_api_key", "list_api_keys", "revoke_api_key"] as const;

const allowedMethods: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

describe("operation registry", () => {
  it("registers names, methods, paths, error codes, and http-only from architecture section 6", () => {
    expect(operations).toEqual(documentedOperations);
    expect(new Set(operations.map((operation) => operation.name)).size).toBe(operations.length);
    expect(errorCodes).toEqual(documentedErrorCodes);
    expect(errorBodyFields).toEqual(["error", "message"]);

    for (const operation of operations) {
      expect(allowedMethods).toContain(operation.method);
      expect(operation.path.startsWith("/pcp/v1/")).toBe(true);
    }

    const paths = operations.map((operation) => operation.path);
    expect(paths).not.toContain("/media/{id}");
    expect(paths).not.toContain("/pcp/v1/public/files/{id}");
    expect(paths).not.toContain("/pcp/v1/public/query");
  });

  it("marks create_api_key, list_api_keys, and revoke_api_key as http-only", () => {
    const httpOnlyNames = operations
      .filter((operation) => operation.httpOnly)
      .map((operation) => operation.name);

    expect(httpOnlyNames).toEqual(keyOperationNames);

    for (const name of keyOperationNames) {
      const operation = operations.find((candidate) => candidate.name === name);
      expect(operation).toBeDefined();
      expect(operation?.httpOnly).toBe(true);
    }
  });

  it("generates HTTP and MCP together for every data and site operation", () => {
    const transports = generateTransports();
    const dataAndSite = documentedOperations.filter((operation) => !operation.httpOnly);
    const keys = documentedOperations.filter((operation) => operation.httpOnly);

    expect(transports.http).toEqual(
      documentedOperations.map((operation) => ({
        name: operation.name,
        method: operation.method,
        path: operation.path,
      })),
    );
    expect(transports.mcp).toEqual(dataAndSite.map((operation) => ({ name: operation.name })));

    for (const operation of dataAndSite) {
      expect(transports.http).toContainEqual({
        name: operation.name,
        method: operation.method,
        path: operation.path,
      });
      expect(transports.mcp).toContainEqual({ name: operation.name });
    }

    for (const operation of keys) {
      expect(transports.http).toContainEqual({
        name: operation.name,
        method: operation.method,
        path: operation.path,
      });
      expect(transports.mcp.map((tool) => tool.name)).not.toContain(operation.name);
    }
  });
});
