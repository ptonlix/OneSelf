import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
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
