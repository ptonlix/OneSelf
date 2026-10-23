import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";

import {
  FILE_MEDIA_TYPES,
  MAX_FILE_BYTES,
  MAX_SITE_ARCHIVE_BYTES,
  MAX_SITE_ARCHIVE_FILES,
} from "../../packages/domain/src/index.js";
import { errorCodes, operations, publicEndpoints } from "../../packages/operations/src/index.js";
import {
  addSource,
  boot,
  issueAccessToken,
  issueApiKey,
  jsonHeaders,
  markdown,
  mcpCall,
  mcpToolNames,
  mcpTools,
  ORIGIN,
  owner,
  PNG_BYTES,
  putPage,
  readJson,
} from "./support.js";

it("omits key tools from MCP and ignores a spoofed forwarding header", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const page = markdown("same");
  const http = await putPage(server, cookie, "notes", "shared", page);
  const httpBody = await readJson(http);
  const mcp = await mcpCall(
    server,
    "put_page",
    { source: "notes", slug: "shared", markdown: page },
    { cookie },
  );
  expect(mcp.error).toBeUndefined();
  expect(mcp.hash).toBe(httpBody.hash);

  const anonymous = await mcpCall(server, "put_page", {
    source: "notes",
    slug: "other",
    markdown: page,
  });
  expect(anonymous.error).toBe("unauthorized");
  const names = await mcpToolNames(server);
  expect(names).not.toContain("create_api_key");
  expect(names).not.toContain("list_api_keys");
  expect(names).not.toContain("revoke_api_key");
  expect(names).toContain("put_page");

  const discovery = await readJson(
    await server.request("/.well-known/pcp", { headers: { host: "evil.example" } }),
  );
  expect(discovery.openapi).toBe(`${ORIGIN}/openapi.json`);
  expect(JSON.stringify(discovery.operations)).not.toContain("create_api_key");
  const discoverySkills = discovery.skills as Record<string, string>;
  expect(discoverySkills).toEqual({ oneself: `${ORIGIN}/skills/oneself/SKILL.md` });
  expect(discoverySkills).not.toHaveProperty("context_management");
  expect(discoverySkills).not.toHaveProperty("public_page");
  expect(JSON.stringify(discovery.operations)).toContain("get_skill");
  expect(JSON.stringify(discovery.operations)).toContain("get_site");

  for (let index = 0; index < 9; index += 1) {
    const response = await server.request("/admin/login", {
      method: "POST",
      headers: jsonHeaders({ "x-forwarded-for": `203.0.113.${String(index)}` }),
      body: JSON.stringify({ login: "owner", password: "wrong" }),
    });
    expect(response.status).toBe(401);
  }
  const limited = await server.request("/admin/login", {
    method: "POST",
    headers: jsonHeaders({ "x-forwarded-for": "198.51.100.9" }),
    body: JSON.stringify({ login: "owner", password: "wrong" }),
  });
  expect(limited.status).toBe(429);
  await server.close();
});

it("serves OpenAPI from the configured origin", async () => {
  const server = await boot();
  const response = await server.request("/openapi.json", { headers: { host: "evil.example" } });
  expect(response.status).toBe(200);
  const document = await readJson(response);
  expect(document.openapi).toBe("3.1.0");
  expect(document.servers).toEqual([{ url: ORIGIN }]);
  const ids = operationIds(document.paths);
  expect(ids).toEqual(
    [...operations, ...publicEndpoints].map((operation) => operation.name).sort(),
  );
  await server.close();
});

it("describes credentials, public endpoints, and upload limits in discovery", async () => {
  const server = await boot();
  const discovery = await readJson(await server.request("/.well-known/pcp"));
  expect(discovery.protocol).toBe("pcp");
  expect(discovery.version).toBe("1");
  expect(discovery.auth).toEqual({
    headers: [
      { credential: "api_key", header: "Authorization", value: "ApiKey <key>" },
      { credential: "api_key", header: "X-Api-Key", value: "<key>" },
      { credential: "oauth", header: "Authorization", value: "Bearer <access_token>" },
    ],
  });
  expect(discovery.public).toEqual({
    credentials: "omit",
    endpoints: publicEndpoints.map(({ name, method, path }) => ({ name, method, path })),
  });
  expect(discovery.uploads).toEqual({
    file_upload: {
      field: "file",
      mcp_arguments: ["data_base64", "media_type"],
      media_types: [...FILE_MEDIA_TYPES],
      max_bytes: MAX_FILE_BYTES,
    },
    put_site: {
      field: "archive",
      mcp_arguments: ["archive_base64"],
      media_types: ["application/zip"],
      max_bytes: MAX_SITE_ARCHIVE_BYTES,
      max_files: MAX_SITE_ARCHIVE_FILES,
    },
  });

  // Every listed public endpoint is routed and answers without a credential.
  for (const endpoint of publicEndpoints) {
    const path = endpoint.path.replace(/\{\w+\}/g, "missing");
    const response = await server.request(path, {
      method: endpoint.method,
      ...(endpoint.method === "POST"
        ? { headers: jsonHeaders(), body: JSON.stringify({ q: "anything" }) }
        : {}),
    });
    if (path.includes("missing")) {
      expect(response.status, endpoint.name).toBe(404);
      expect((await readJson(response)).error, endpoint.name).toBe("not_found");
    } else {
      expect(response.status, endpoint.name).toBe(200);
    }
  }
  await server.close();
});

it("generates OpenAPI parameters from the MCP input schemas", async () => {
  const server = await boot();
  const document = await readJson(await server.request("/openapi.json"));
  const byId = openApiOperations(document.paths);
  const tools = await mcpTools(server);
  expect(tools.map((tool) => tool.name).sort()).toEqual(
    operations
      .filter((operation) => !operation.httpOnly)
      .map((operation) => operation.name)
      .sort(),
  );
  for (const tool of tools) {
    const operation = byId.get(tool.name);
    expect(operation, tool.name).toBeDefined();
    if (operation === undefined) {
      continue;
    }
    const mcpProperties = tool.inputSchema?.properties ?? {};
    const mcpRequired = [...(tool.inputSchema?.required ?? [])].sort();
    const upload = operation["x-oneself-upload"] as
      { field: string; mcp_arguments: string[] } | undefined;
    if (upload !== undefined) {
      // Multipart over HTTP, base64 arguments over MCP; the mapping is published.
      expect(Object.keys(mcpProperties).sort(), tool.name).toEqual(
        [...upload.mcp_arguments].sort(),
      );
      const multipart = bodySchema(operation, "multipart/form-data");
      expect(Object.keys(multipart.properties), tool.name).toEqual([upload.field]);
      expect(multipart.required, tool.name).toEqual([upload.field]);
      continue;
    }
    const http: Record<string, unknown> = {};
    const httpRequired: string[] = [];
    for (const parameter of (operation.parameters ?? []) as {
      name: string;
      required: boolean;
      schema: unknown;
    }[]) {
      http[parameter.name] = parameter.schema;
      if (parameter.required) {
        httpRequired.push(parameter.name);
      }
    }
    const json = bodySchema(operation, "application/json");
    Object.assign(http, json.properties);
    httpRequired.push(...json.required);
    expect(http, tool.name).toEqual(mcpProperties);
    expect(httpRequired.sort(), tool.name).toEqual(mcpRequired);
  }
  await server.close();
});

it("declares OpenAPI security for every operation", async () => {
  const server = await boot();
  const document = await readJson(await server.request("/openapi.json"));
  const components = document.components as { securitySchemes: Record<string, unknown> };
  expect(components.securitySchemes).toMatchObject({
    apiKeyHeader: { type: "apiKey", in: "header", name: "X-Api-Key" },
    oauthBearer: { type: "http", scheme: "bearer" },
    ownerSession: { type: "apiKey", in: "cookie", name: "oneself_session" },
  });
  // A raw apiKey scheme on Authorization would make clients send the bare key, which the
  // runtime rejects; the `ApiKey <key>` form is described, not declared.
  expect(Object.keys(components.securitySchemes).sort()).toEqual(
    ["apiKeyHeader", "oauthBearer", "ownerSession"].sort(),
  );
  expect(JSON.stringify(components.securitySchemes)).toContain("Authorization: ApiKey <key>");
  const byId = openApiOperations(document.paths);
  for (const operation of operations) {
    const security = byId.get(operation.name)?.security;
    if (operation.httpOnly) {
      expect(security, operation.name).toEqual([{ ownerSession: [] }]);
    } else {
      expect(security, operation.name).toEqual([
        { apiKeyHeader: [] },
        { oauthBearer: [] },
        { ownerSession: [] },
      ]);
    }
  }
  for (const endpoint of publicEndpoints) {
    const item = byId.get(endpoint.name);
    expect(item?.security, endpoint.name).toEqual([]);
    expect(item?.["x-oneself-credentials"], endpoint.name).toBe("omit");
  }
  await server.close();
});

it("accepts every credential exactly as OpenAPI and discovery describe it", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const key = (await issueApiKey(server, cookie, { label: "scheme" })).key;
  const token = await issueAccessToken(server, cookie);
  const secrets: Record<string, string> = {
    api_key: key,
    oauth: token,
    owner: cookie.slice("oneself_session=".length),
  };
  const whoami = async (headers: Record<string, string>): Promise<Response> =>
    server.request("/pcp/v1/whoami", { headers });

  // Headers built only from each declared security scheme, as a generated client would.
  const document = await readJson(await server.request("/openapi.json"));
  const schemes = (document.components as { securitySchemes: Record<string, SecurityScheme> })
    .securitySchemes;
  for (const [name, scheme] of Object.entries(schemes)) {
    const kind = name === "oauthBearer" ? "oauth" : name === "ownerSession" ? "owner" : "api_key";
    const secret = secrets[kind] ?? "";
    let headers: Record<string, string>;
    if (scheme.type === "http") {
      expect(scheme.scheme, name).toBe("bearer");
      headers = { authorization: `Bearer ${secret}` };
    } else if (scheme.in === "cookie") {
      headers = { cookie: `${String(scheme.name)}=${secret}` };
    } else {
      expect(scheme.in, name).toBe("header");
      headers = { [String(scheme.name)]: secret };
    }
    const response = await whoami(headers);
    expect(response.status, name).toBe(200);
    expect((await readJson(response)).credential, name).toBe(kind);
  }

  // Every header form discovery lists, with its placeholder filled in.
  const discovery = await readJson(await server.request("/.well-known/pcp"));
  const listed = (
    discovery.auth as { headers: { credential: string; header: string; value: string }[] }
  ).headers;
  for (const entry of listed) {
    const value = entry.value.replace(/<[^>]+>/, secrets[entry.credential] ?? "");
    const response = await whoami({ [entry.header]: value });
    expect(response.status, entry.value).toBe(200);
    expect((await readJson(response)).credential, entry.value).toBe(entry.credential);
  }
  await server.close();
});

it("declares upload part types that match what the server accepts", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const byId = openApiOperations((await readJson(await server.request("/openapi.json"))).paths);
  const declared = (name: string): { field: Record<string, unknown>; encoding: string } => {
    const body = byId.get(name)?.requestBody as {
      content: Record<
        string,
        {
          schema: { properties: Record<string, Record<string, unknown>> };
          encoding: Record<string, { contentType: string }>;
        }
      >;
    };
    const multipart = body.content["multipart/form-data"];
    const [fieldName, field] = Object.entries(multipart?.schema.properties ?? {})[0] ?? ["", {}];
    return { field, encoding: multipart?.encoding[fieldName]?.contentType ?? "" };
  };
  const mediaTypes = (field: Record<string, unknown>): string[] =>
    typeof field.contentMediaType === "string"
      ? [field.contentMediaType]
      : ((field.anyOf ?? []) as { contentMediaType: string }[]).map(
          (item) => item.contentMediaType,
        );

  const file = declared("file_upload");
  expect(file.field).toMatchObject({ type: "string", format: "binary" });
  expect(mediaTypes(file.field)).toEqual([...FILE_MEDIA_TYPES]);
  expect(file.encoding.split(", ")).toEqual([...FILE_MEDIA_TYPES]);
  expect(JSON.stringify(file.field)).not.toContain("octet-stream");
  for (const type of mediaTypes(file.field)) {
    const form = new FormData();
    form.set("file", new File([PNG_BYTES], "f", { type }));
    const response = await server.request("/pcp/v1/files", {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    expect(response.status, type).toBe(200);
  }
  const rejected = new FormData();
  rejected.set("file", new File([PNG_BYTES], "f", { type: "application/octet-stream" }));
  const refused = await server.request("/pcp/v1/files", {
    method: "POST",
    headers: { cookie },
    body: rejected,
  });
  expect(refused.status).toBe(400);

  const site = declared("put_site");
  expect(site.field).toMatchObject({
    type: "string",
    format: "binary",
    contentMediaType: "application/zip",
  });
  expect(site.encoding).toBe("application/zip");
  await server.close();
});

it("lists every error code of a shared status in one OpenAPI response", async () => {
  const server = await boot();
  const byId = openApiOperations((await readJson(await server.request("/openapi.json"))).paths);
  const responses = byId.get("put_page")?.responses as Record<
    string,
    {
      description: string;
      content: Record<string, { schema: { properties: Record<string, { enum: string[] }> } }>;
    }
  >;
  const forbidden = responses["403"];
  expect(forbidden?.description).toContain("forbidden");
  expect(forbidden?.description).toContain("password_change_required");
  expect(forbidden?.content["application/json"]?.schema.properties.error?.enum.sort()).toEqual([
    "forbidden",
    "password_change_required",
  ]);
  for (const errorCode of errorCodes) {
    expect(
      responses[String(errorCode.status)]?.content["application/json"]?.schema.properties.error
        ?.enum,
      errorCode.error,
    ).toContain(errorCode.error);
  }
  await server.close();
});

it("advertises only the device-code OAuth metadata", async () => {
  const server = await boot();
  const response = await server.request("/.well-known/oauth-authorization-server", {
    headers: { host: "evil.example" },
  });
  expect(response.status).toBe(200);
  expect(await readJson(response)).toEqual({
    issuer: ORIGIN,
    device_authorization_endpoint: `${ORIGIN}/oauth/device/auth`,
    token_endpoint: `${ORIGIN}/oauth/token`,
    grant_types_supported: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
  });
  await server.close();
});

it("serves one oneself skill and rejects the old names", async () => {
  const server = await boot();
  const listed = await readJson(await server.request("/pcp/v1/skills"));
  expect(listed.skills).toEqual([{ name: "oneself" }]);

  const anonymous = await server.request("/skills/oneself/SKILL.md", {
    headers: { host: "evil.example" },
  });
  const api = await server.request("/pcp/v1/skills/oneself", {
    headers: { host: "evil.example" },
  });
  expect(anonymous.status).toBe(200);
  expect(api.status).toBe(200);
  expect(anonymous.headers.get("cache-control")).toBe("no-store");
  expect(api.headers.get("cache-control")).toBe("no-store");
  const entry = new Uint8Array(await anonymous.arrayBuffer());
  expect(Array.from(entry)).toEqual(Array.from(new Uint8Array(await api.arrayBuffer())));
  const text = new TextDecoder().decode(entry);
  expect(text).toContain(`oneself_origin: "${ORIGIN}"`);
  expect(text).not.toContain("evil.example");
  expect(text).not.toContain("osk_");
  expect(text).not.toContain("OWNER_PASSWORD");

  const context = await server.request("/skills/oneself/references/context.md");
  const publicPage = await server.request("/skills/oneself/references/public-page.md");
  expect(context.status).toBe(200);
  expect(publicPage.status).toBe(200);
  const contextText = await context.text();
  const publicPageText = await publicPage.text();
  const skillRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../skills/oneself/references",
  );
  expect(contextText).toBe(readFileSync(resolve(skillRoot, "context.md"), "utf8"));
  expect(publicPageText).toBe(readFileSync(resolve(skillRoot, "public-page.md"), "utf8"));
  expect(contextText).not.toContain("oneself_origin");
  expect(publicPageText).not.toContain("oneself_origin");
  expect(contextText).not.toContain(ORIGIN);
  expect(publicPageText).not.toContain(ORIGIN);

  for (const path of [
    "/skills/context-management.md",
    "/skills/public-page.md",
    "/pcp/v1/skills/context-management",
    "/pcp/v1/skills/public-page",
  ]) {
    const missing = await server.request(path);
    expect(missing.status, path).toBe(404);
    expect((await readJson(missing)).error).toBe("not_found");
  }
  const mcp = await mcpCall(server, "get_skill", { name: "context-management" });
  expect(mcp.error).toBe("not_found");
  const publicPageSkill = await mcpCall(server, "get_skill", { name: "public-page" });
  expect(publicPageSkill.error).toBe("not_found");
  await server.close();
});

it("serves an anonymous agent-skills archive index that ignores Host", async () => {
  const server = await boot();
  const response = await server.request("/.well-known/agent-skills/index.json", {
    headers: { host: "evil.example" },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const index = await readJson(response);
  expect(index.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
  const skills = index.skills as {
    name: string;
    type: string;
    description: string;
    url: string;
    digest: string;
  }[];
  expect(skills).toHaveLength(1);
  const skill = skills[0];
  expect(skill?.name).toBe("oneself");
  expect(skill?.type).toBe("archive");
  expect(skill?.description.length).toBeGreaterThan(0);
  expect(skill?.description.length).toBeLessThanOrEqual(1024);
  expect(skill?.description).toContain("写成");
  expect(skill?.description).toContain("定制");
  expect(skill?.description).toContain("公开宣传页");
  expect(skill?.url).toBe(`${ORIGIN}/skills/oneself.tar.gz`);
  expect(skill?.url).not.toContain("evil.example");
  expect(skill?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);

  const archive = await server.request("/skills/oneself.tar.gz", {
    headers: { host: "evil.example" },
  });
  expect(archive.status).toBe(200);
  expect(archive.headers.get("cache-control")).toBe("no-store");
  const raw = new Uint8Array(await archive.arrayBuffer());
  expect(createHash("sha256").update(raw).digest("hex")).toBe(
    skill?.digest.slice("sha256:".length),
  );
  const files = unpackTarGz(raw);
  expect([...files.keys()].sort()).toEqual([
    "SKILL.md",
    "references/context.md",
    "references/public-page.md",
  ]);
  const archivedEntry = files.get("SKILL.md");
  const archivedContext = files.get("references/context.md");
  const archivedPublicPage = files.get("references/public-page.md");
  const servedEntry = new Uint8Array(
    await (await server.request("/skills/oneself/SKILL.md")).arrayBuffer(),
  );
  expect(archivedEntry).toEqual(servedEntry);
  expect(new TextDecoder().decode(archivedEntry ?? new Uint8Array())).toContain(
    `oneself_origin: "${ORIGIN}"`,
  );
  expect(new TextDecoder().decode(archivedContext ?? new Uint8Array())).not.toContain(
    "oneself_origin",
  );
  expect(new TextDecoder().decode(archivedPublicPage ?? new Uint8Array())).not.toContain(
    "oneself_origin",
  );
  await server.close();
});

it("rate limits anonymous public search", async () => {
  const server = await boot();
  for (let index = 0; index < 30; index += 1) {
    const response = await server.request("/pcp/v1/public/search", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ q: "token" }),
    });
    expect(response.status).toBe(200);
  }
  const limited = await server.request("/pcp/v1/public/search", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ q: "token" }),
  });
  await expectRateLimited(limited);
  await server.close();
});

it("rate limits uploads", async () => {
  const server = await boot();
  const cookie = await owner(server);
  for (let index = 0; index < 30; index += 1) {
    const body = new FormData();
    body.set("file", new File([PNG_BYTES], "a.png", { type: "image/png" }));
    const response = await server.request("/pcp/v1/files", {
      method: "POST",
      headers: { cookie },
      body,
    });
    expect(response.status, await response.clone().text()).toBe(200);
  }
  const body = new FormData();
  body.set("file", new File([PNG_BYTES], "a.png", { type: "image/png" }));
  const limited = await server.request("/pcp/v1/files", {
    method: "POST",
    headers: { cookie },
    body,
  });
  await expectRateLimited(limited);
  await server.close();
});

it("trusts only CF-Connecting-IP when the ingress is cloudflared", async () => {
  const server = await boot({ ingress: "cloudflared" });
  for (let index = 0; index < 30; index += 1) {
    const response = await server.request("/pcp/v1/public/search", {
      method: "POST",
      headers: forwarded("203.0.113.10", `198.51.100.${String(index)}`),
      body: JSON.stringify({ q: "token" }),
    });
    expect(response.status).toBe(200);
  }
  const spoofed = await server.request("/pcp/v1/public/search", {
    method: "POST",
    headers: forwarded("203.0.113.10", "203.0.113.99"),
    body: JSON.stringify({ q: "token" }),
  });
  await expectRateLimited(spoofed);
  const fresh = await server.request("/pcp/v1/public/search", {
    method: "POST",
    headers: forwarded("203.0.113.11", "203.0.113.10"),
    body: JSON.stringify({ q: "token" }),
  });
  expect(fresh.status).toBe(200);
  await server.close();
});

it("trusts only the overwritten X-Real-IP when the ingress is caddy", async () => {
  const server = await boot({ ingress: "caddy" });
  for (let index = 0; index < 30; index += 1) {
    const response = await server.request("/pcp/v1/public/search", {
      method: "POST",
      headers: jsonHeaders({
        "x-real-ip": "203.0.113.20",
        "x-forwarded-for": `198.51.100.${String(index)}`,
      }),
      body: JSON.stringify({ q: "token" }),
    });
    expect(response.status).toBe(200);
  }
  const spoofed = await server.request("/pcp/v1/public/search", {
    method: "POST",
    headers: jsonHeaders({
      "x-real-ip": "203.0.113.20",
      "x-forwarded-for": "203.0.113.99",
    }),
    body: JSON.stringify({ q: "token" }),
  });
  await expectRateLimited(spoofed);
  const fresh = await server.request("/pcp/v1/public/search", {
    method: "POST",
    headers: jsonHeaders({
      "x-real-ip": "203.0.113.21",
      "x-forwarded-for": "203.0.113.20",
    }),
    body: JSON.stringify({ q: "token" }),
  });
  expect(fresh.status).toBe(200);
  await server.close();
});

it("trusts the last ingress hop when the ingress is tailscale", async () => {
  const server = await boot({ ingress: "tailscale" });
  for (let index = 0; index < 30; index += 1) {
    const response = await server.request("/pcp/v1/public/search", {
      method: "POST",
      headers: jsonHeaders({
        "x-forwarded-for": `198.51.100.${String(index)}, 100.64.0.8`,
      }),
      body: JSON.stringify({ q: "token" }),
    });
    expect(response.status).toBe(200);
  }
  const spoofed = await server.request("/pcp/v1/public/search", {
    method: "POST",
    headers: jsonHeaders({ "x-forwarded-for": "203.0.113.99, 100.64.0.8" }),
    body: JSON.stringify({ q: "token" }),
  });
  await expectRateLimited(spoofed);
  const fresh = await server.request("/pcp/v1/public/search", {
    method: "POST",
    headers: jsonHeaders({ "x-forwarded-for": "100.64.0.8, 100.64.0.9" }),
    body: JSON.stringify({ q: "token" }),
  });
  expect(fresh.status).toBe(200);
  await server.close();
});

function forwarded(connecting: string, forwardedFor: string): Headers {
  return jsonHeaders({
    "cf-connecting-ip": connecting,
    "x-forwarded-for": forwardedFor,
  });
}

type OpenApiOperation = Record<string, unknown> & { parameters?: unknown; security?: unknown };

type SecurityScheme = { type: string; scheme?: string; in?: string; name?: string };

function openApiOperations(paths: unknown): Map<string, OpenApiOperation> {
  const result = new Map<string, OpenApiOperation>();
  for (const item of Object.values((paths ?? {}) as Record<string, Record<string, unknown>>)) {
    for (const operation of Object.values(item)) {
      const id = (operation as { operationId?: unknown }).operationId;
      if (typeof id === "string") {
        result.set(id, operation as OpenApiOperation);
      }
    }
  }
  return result;
}

function bodySchema(
  operation: OpenApiOperation,
  mediaType: string,
): { properties: Record<string, unknown>; required: string[] } {
  const body = operation.requestBody as
    | {
        content?: Record<
          string,
          { schema?: { properties?: Record<string, unknown>; required?: string[] } }
        >;
      }
    | undefined;
  const schema = body?.content?.[mediaType]?.schema;
  return { properties: schema?.properties ?? {}, required: schema?.required ?? [] };
}

function operationIds(paths: unknown): string[] {
  if (typeof paths !== "object" || paths === null) {
    return [];
  }
  const ids: string[] = [];
  for (const item of Object.values(paths)) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    for (const operation of Object.values(item as Record<string, unknown>)) {
      if (typeof operation !== "object" || operation === null || !("operationId" in operation)) {
        continue;
      }
      const id = (operation as { operationId?: unknown }).operationId;
      if (typeof id === "string") {
        ids.push(id);
      }
    }
  }
  return ids.sort();
}

function unpackTarGz(bytes: Uint8Array): Map<string, Uint8Array> {
  const tar = gunzipSync(bytes);
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const name = new TextDecoder().decode(header.subarray(0, 100)).replace(/\0+$/, "");
    const sizeText = new TextDecoder()
      .decode(header.subarray(124, 136))
      .replace(/\0.*$/, "")
      .trim();
    const size = Number.parseInt(sizeText, 8);
    files.set(name, new Uint8Array(tar.subarray(offset, offset + size)));
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

async function expectRateLimited(response: Response): Promise<void> {
  expect(response.status).toBe(429);
  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  expect(typeof body.error).toBe("string");
  expect(typeof body.message).toBe("string");
}
