import { expect, it } from "vitest";

import { operations } from "../../packages/operations/src/index.js";
import {
  addSource,
  boot,
  jsonHeaders,
  markdown,
  mcpCall,
  mcpToolNames,
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
  const skill = await (await server.request("/skills/context-management.md")).text();
  const apiSkill = await (await server.request("/pcp/v1/skills/context-management")).text();
  expect(skill).toBe(apiSkill);
  expect((await server.request("/skills/context-management.md")).headers.get("cache-control")).toBe(
    "no-store",
  );

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
  expect(ids).toEqual(operations.map((operation) => operation.name).sort());
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

it("serves the same public-page skill bytes on both paths", async () => {
  const server = await boot();
  const anonymous = await server.request("/skills/public-page.md");
  const api = await server.request("/pcp/v1/skills/public-page");
  expect(anonymous.status).toBe(200);
  expect(api.status).toBe(200);
  expect(Array.from(new Uint8Array(await anonymous.arrayBuffer()))).toEqual(
    Array.from(new Uint8Array(await api.arrayBuffer())),
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

async function expectRateLimited(response: Response): Promise<void> {
  expect(response.status).toBe(429);
  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  expect(typeof body.error).toBe("string");
  expect(typeof body.message).toBe("string");
}
