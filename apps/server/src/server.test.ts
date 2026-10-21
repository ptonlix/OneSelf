import { describe, expect, it } from "vitest";

import { createServer, type ServerHandle } from "./index.js";
import { writeStoredZip } from "./app/zip.js";

const ORIGIN = "http://127.0.0.1:3000";

function markdown(body: string, extra = ""): string {
  return `---\ntype: note\ntitle: Note\nvisibility: private\n${extra}---\n\n${body}\n`;
}

async function boot(options: Parameters<typeof createServer>[0] = {}): Promise<ServerHandle> {
  return createServer({
    publicOrigin: ORIGIN,
    ownerLogin: "owner",
    ownerPassword: "initial-password",
    ...options,
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function jsonHeaders(extra: Record<string, string> = {}): Headers {
  const headers = new Headers({
    origin: ORIGIN,
    "content-type": "application/json",
    ...extra,
  });
  return headers;
}

async function login(server: ServerHandle, password = "initial-password"): Promise<string> {
  const response = await server.request("/admin/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ login: "owner", password }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie") ?? "";
  expect(cookie.startsWith("oneself_session=")).toBe(true);
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("SameSite=Lax");
  return cookie.split(";")[0] ?? "";
}

async function changePassword(server: ServerHandle, cookie: string): Promise<void> {
  const response = await server.request("/admin/password", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ password: "new-password" }),
  });
  expect(response.status).toBe(200);
  expect(await readJson(response)).toEqual({ must_change_password: false });
}

async function owner(server: ServerHandle): Promise<string> {
  const cookie = await login(server);
  await changePassword(server, cookie);
  return cookie;
}

async function addSource(server: ServerHandle, cookie: string, id: string): Promise<void> {
  const response = await server.request("/pcp/v1/sources", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ id }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
}

async function putPage(
  server: ServerHandle,
  cookie: string,
  source: string,
  slug: string,
  body: string,
  hash?: string,
): Promise<Response> {
  return server.request(`/pcp/v1/pages/${source}/${slug}`, {
    method: "PUT",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify(hash === undefined ? { markdown: body } : { markdown: body, hash }),
  });
}

describe("server", () => {
  it("refuses to start without an owner and does not create an API key", async () => {
    await expect(createServer({ publicOrigin: ORIGIN })).rejects.toThrow(/owner/);
    const server = await boot();
    const cookie = await owner(server);
    const listed = await server.request("/pcp/v1/api-keys", { headers: { cookie } });
    expect(await readJson(listed)).toEqual({ api_keys: [] });
    await server.close();
  });

  it("blocks writes until the owner changes the bootstrap password", async () => {
    const server = await boot();
    const cookie = await login(server);
    await addSource(server, cookie, "notes").catch(() => undefined);
    const response = await putPage(server, cookie, "notes", "hello", markdown("secret"));
    expect(response.status).toBe(403);
    const body = await readJson(response);
    expect(body.error).toBe("password_change_required");
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
    expect(await server.runtime.objectStore.list("")).toEqual([]);
    await server.close();
  });

  it("rolls back stale hashes, ambiguous edits, cross-page files, and bad batches", async () => {
    const server = await boot();
    const cookie = await owner(server);
    await addSource(server, cookie, "notes");
    const created = await putPage(server, cookie, "notes", "hello", markdown("alpha"));
    expect(created.status).toBe(200);
    const first = await readJson(created);
    const before = await server.runtime.objectStore.list("");

    const stale = await putPage(server, cookie, "notes", "hello", markdown("beta"), "stale");
    expect(stale.status).toBe(409);
    expect((await readJson(stale)).error).toBe("conflict");
    const current = await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } });
    expect((await readJson(current)).markdown).toContain("alpha");

    const ambiguous = await server.request("/pcp/v1/pages/notes/hello", {
      method: "PATCH",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({
        hash: first.hash,
        edits: [{ search: "a", replace: "b" }],
      }),
    });
    expect(ambiguous.status).toBe(400);
    expect((await readJson(ambiguous)).error).toBe("invalid");
    expect((await server.runtime.objectStore.list("")).map((item) => item.key)).toEqual(
      before.map((item) => item.key),
    );

    const broken = await putPage(
      server,
      cookie,
      "notes",
      "broken",
      "---\ntype: note\ntitle: Broken\n---\n\n## Facts\n\n- id: fact_01\n  entity: 张三\n",
    );
    expect(broken.status).toBe(400);
    expect((await readJson(broken)).error).toBe("invalid");
    expect(
      await server.request("/pcp/v1/pages/notes/broken", { headers: { cookie } }),
    ).toMatchObject({
      status: 404,
    });

    const upload = await uploadPng(server, cookie);
    const fileId = upload.id;
    const attached = await putPage(
      server,
      cookie,
      "notes",
      "owner-page",
      markdown("owns", `files: [${fileId}]\n`),
    );
    expect(attached.status, await attached.clone().text()).toBe(200);
    const stolen = await putPage(
      server,
      cookie,
      "notes",
      "other-page",
      markdown("nope", `files: [${fileId}]\n`),
    );
    expect(stolen.status).toBe(409);
    expect((await readJson(stolen)).error).toBe("conflict");
    expect(
      (await server.request("/pcp/v1/pages/notes/other-page", { headers: { cookie } })).status,
    ).toBe(404);
    const files = await server.request("/pcp/v1/files?source=notes&slug=owner-page", {
      headers: { cookie },
    });
    expect(await readJson(files)).toMatchObject({ files: [{ id: fileId }] });

    const batch = await server.request("/pcp/v1/pages", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({
        pages: [
          { source: "notes", slug: "batch-ok", markdown: markdown("ok") },
          { source: "notes", slug: "/bad", markdown: markdown("bad") },
        ],
      }),
    });
    expect(batch.status).toBe(400);
    expect(
      (await server.request("/pcp/v1/pages/notes/batch-ok", { headers: { cookie } })).status,
    ).toBe(404);
    await server.close();
  });

  it("purges expired soft deletes and unreferenced objects without deleting releases", async () => {
    const server = await boot();
    const cookie = await owner(server);
    await addSource(server, cookie, "notes");
    expect((await putPage(server, cookie, "notes", "old", markdown("gone"))).status).toBe(200);
    expect(
      (
        await server.request("/pcp/v1/pages/notes/old", {
          method: "DELETE",
          headers: { cookie },
        })
      ).status,
    ).toBe(200);
    server.clock.set(new Date("2026-01-01T00:00:00.000Z"));
    await server.runtime.objectStore.put("pages/orphan/note/dead.md", new Uint8Array([1]));
    server.clock.set(new Date("2026-10-20T00:00:00.000Z"));
    const archive = writeStoredZip([
      { path: "index.html", data: new TextEncoder().encode("RELEASE") },
    ]);
    const uploaded = await uploadArchive(server, cookie, archive);
    expect(uploaded.status, await uploaded.clone().text()).toBe(200);
    const releaseId = (await readJson(uploaded)).id;
    server.clock.set(new Date("2026-11-21T00:00:00.000Z"));
    await server.maintain();
    expect((await server.request("/pcp/v1/pages/notes/old", { headers: { cookie } })).status).toBe(
      404,
    );
    expect(await server.runtime.objectStore.get("pages/orphan/note/dead.md")).toBeNull();
    const sites = await readJson(await server.request("/pcp/v1/site", { headers: { cookie } }));
    expect(sites.releases).toEqual([expect.objectContaining({ id: releaseId })]);
    const releaseObjects = (await server.runtime.objectStore.list("sites/")).map(
      (item) => item.key,
    );
    expect(releaseObjects.some((key) => key.startsWith(`sites/${String(releaseId)}/`))).toBe(true);
    await server.close();
  });

  it("keeps private pages out of public search and hides unreadable pages", async () => {
    const server = await boot();
    const cookie = await owner(server);
    await addSource(server, cookie, "notes");
    await addSource(server, cookie, "work");
    expect(
      (
        await putPage(
          server,
          cookie,
          "notes",
          "a-private",
          "---\ntype: secret\ntitle: Hidden shared-word\n---\n\nonly-private-token\n",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await putPage(
          server,
          cookie,
          "notes",
          "z-public",
          "---\ntype: note\ntitle: Shown shared-word\nvisibility: public\n---\n\npublic body\n",
        )
      ).status,
    ).toBe(200);
    const search = await server.request("/pcp/v1/public/search", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ q: "shared-word", limit: 1 }),
    });
    expect(search.headers.get("cache-control")).toBe("no-store");
    expect(search.headers.get("access-control-allow-origin")).toBeNull();
    const hits = (await search.json()) as { source: string; slug: string; snippet: string }[];
    expect(hits).toEqual([expect.objectContaining({ source: "notes", slug: "z-public" })]);
    expect(hits[0]?.snippet.length).toBeLessThanOrEqual(140);
    const absent = await server.request("/pcp/v1/public/search", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ q: "only-private-token" }),
    });
    expect(await absent.json()).toEqual([]);
    const typeHit = await server.request("/pcp/v1/public/search", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ q: "secret" }),
    });
    expect(await typeHit.json()).toEqual([]);

    const query = await server.request("/pcp/v1/query", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ q: "shared-word" }),
    });
    expect(query.status).toBe(401);
    const queryBody = await readJson(query);
    expect(queryBody.error).toBe("unauthorized");
    expect(Object.keys(queryBody).sort()).toEqual(["error", "message"]);

    expect(
      (await server.request("/pcp/v1/pages/notes/missing", { headers: { cookie } })).status,
    ).toBe(404);
    expect(
      (
        await server.request("/pcp/v1/pages/notes/a-private", {
          method: "DELETE",
          headers: { cookie },
        })
      ).status,
    ).toBe(200);
    const deleted = await readJson(
      await server.request("/pcp/v1/pages/notes/a-private", { headers: { cookie } }),
    );
    expect(deleted.error).toBe("not_found");
    expect(deleted.markdown).toBeUndefined();

    const created = await server.request("/pcp/v1/api-keys", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({
        label: "limited",
        unrestricted_data: false,
        site_write: false,
        sources: [{ id: "work", read: true, write: false, visibility: false }],
      }),
    });
    const requestId = String((await readJson(created)).id);
    const approved = await readJson(
      await server.request(`/admin/api-keys/${requestId}/approve`, {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: JSON.stringify({}),
      }),
    );
    const key = String(approved.key);
    expect(key.startsWith("osk_")).toBe(true);
    const hidden = await readJson(
      await server.request("/pcp/v1/pages/notes/z-public", {
        headers: { authorization: `ApiKey ${key}` },
      }),
    );
    expect(hidden.error).toBe("not_found");
    const listed = await readJson(
      await server.request("/pcp/v1/api-keys", { headers: { cookie } }),
    );
    expect(JSON.stringify(listed)).not.toContain(key);

    await putPage(server, cookie, "work", "link", markdown("see [[notes/z-public]]"));
    expect(
      (await server.request("/pcp/v1/sources/notes", { method: "DELETE", headers: { cookie } }))
        .status,
    ).toBe(200);
    const linked = await readJson(
      await server.request("/pcp/v1/pages/work/link", { headers: { cookie } }),
    );
    expect(linked.markdown).toContain("[[notes/z-public]]");
    const resolved = await readJson(
      await server.request("/pcp/v1/slugs/resolve", {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: JSON.stringify({ slugs: [{ source: "notes", slug: "z-public" }] }),
      }),
    );
    expect(resolved.slugs).toEqual([{ source: "notes", slug: "z-public", exists: false }]);
    await server.close();
  });

  it("rejects reserved site paths, has no release delete route, and forbids agent approval", async () => {
    const server = await boot();
    const cookie = await owner(server);
    const home = await server.request("/");
    expect(home.status).toBe(200);
    expect(home.headers.get("cache-control")).toBe("no-store");
    expect(await home.text()).toContain("OneSelf");
    expect((await server.request("/missing-path")).status).toBe(404);

    const rejected = await uploadArchive(
      server,
      cookie,
      writeStoredZip([
        { path: "index.html", data: new TextEncoder().encode("nope") },
        { path: "admin/index.html", data: new TextEncoder().encode("reserved") },
      ]),
    );
    expect(rejected.status).toBe(400);
    expect((await readJson(rejected)).error).toBe("invalid");
    expect(
      (await readJson(await server.request("/pcp/v1/site", { headers: { cookie } }))).releases,
    ).toEqual([]);

    const uploaded = await uploadArchive(
      server,
      cookie,
      writeStoredZip([{ path: "index.html", data: new TextEncoder().encode("RELEASE-MARKER") }]),
    );
    const releaseId = String((await readJson(uploaded)).id);
    expect(
      (
        await server.request(`/pcp/v1/site/releases/${releaseId}`, {
          method: "DELETE",
          headers: { cookie },
        })
      ).status,
    ).toBe(404);
    const preview = await readJson(
      await server.request(`/pcp/v1/site/releases/${releaseId}/preview`, { method: "POST" }),
    );
    expect(preview.url).toBe(`/_preview/${releaseId}/`);
    expect(await (await server.request(String(preview.url))).text()).toContain("RELEASE-MARKER");
    expect(await (await server.request("/")).text()).toContain("OneSelf");
    expect(await (await server.request("/")).text()).not.toContain("RELEASE-MARKER");

    const activation = await readJson(
      await server.request("/pcp/v1/site/activate", {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: JSON.stringify({ release_id: releaseId }),
      }),
    );
    const keyRequest = await readJson(
      await server.request("/pcp/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: JSON.stringify({
          label: "agent",
          unrestricted_data: true,
          site_write: true,
          sources: [],
        }),
      }),
    );
    const revealed = await readJson(
      await server.request(`/admin/api-keys/${String(keyRequest.id)}/approve`, {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: "{}",
      }),
    );
    const forbidden = await server.request(
      `/admin/site-activations/${String(activation.id)}/approve`,
      {
        method: "POST",
        headers: jsonHeaders({ authorization: `ApiKey ${String(revealed.key)}` }),
        body: JSON.stringify({ decision: "approve" }),
      },
    );
    expect(forbidden.status).toBe(403);
    expect((await readJson(forbidden)).error).toBe("forbidden");
    expect(await (await server.request("/")).text()).not.toContain("RELEASE-MARKER");
    const approved = await server.request(
      `/admin/site-activations/${String(activation.id)}/approve`,
      {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: JSON.stringify({ decision: "approve" }),
      },
    );
    expect(approved.status).toBe(200);
    expect(await (await server.request("/")).text()).toContain("RELEASE-MARKER");
    await server.close();
  });

  it("shows an API key once and does not let OAuth manage keys", async () => {
    const server = await boot();
    const cookie = await owner(server);
    const pending = await readJson(
      await server.request("/pcp/v1/api-keys", {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: JSON.stringify({
          label: "once",
          unrestricted_data: false,
          site_write: false,
          sources: [],
        }),
      }),
    );
    expect(pending.key).toBeUndefined();
    expect(String(pending.approval_url).startsWith(`${ORIGIN}/admin/api-keys/`)).toBe(true);
    const viewed = await readJson(
      await server.request(`/admin/api-keys/${String(pending.id)}`, { headers: { cookie } }),
    );
    expect(viewed.key).toBeUndefined();
    expect(viewed.label).toBe("once");
    const revealed = await readJson(
      await server.request(`/admin/api-keys/${String(pending.id)}/approve`, {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: "{}",
      }),
    );
    expect(String(revealed.key).startsWith("osk_")).toBe(true);
    const again = await server.request(`/admin/api-keys/${String(pending.id)}/approve`, {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: "{}",
    });
    expect(again.status).toBe(409);

    const device = await readJson(
      await server.request("/oauth/device/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    const approved = await server.request("/admin/device", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({
        user_code: device.user_code,
        site_write: false,
        sources: [],
      }),
    });
    expect(approved.status).toBe(200);
    expect(await approved.text()).not.toContain("osk_");
    const token = await readJson(
      await server.request("/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: String(device.device_code),
        }),
      }),
    );
    const bearer = String(token.access_token);
    const refresh = String(token.refresh_token);
    const managed = await server.request("/pcp/v1/api-keys", {
      method: "POST",
      headers: jsonHeaders({ authorization: `Bearer ${bearer}` }),
      body: JSON.stringify({
        label: "nope",
        unrestricted_data: true,
        site_write: false,
        sources: [],
      }),
    });
    expect(managed.status).toBe(403);
    expect((await readJson(managed)).error).toBe("forbidden");
    const rotated = await readJson(
      await server.request("/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
      }),
    );
    const reused = await server.request("/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
    });
    expect(reused.status).toBe(400);
    const killed = await server.request("/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: String(rotated.refresh_token),
      }),
    });
    expect(killed.status).toBe(400);
    const who = await server.request("/pcp/v1/whoami", {
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(who.status).toBe(401);
    await server.close();
  });

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
      {
        source: "notes",
        slug: "shared",
        markdown: page,
      },
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
    const skill = await (await server.request("/skills/data.md")).text();
    const apiSkill = await (await server.request("/pcp/v1/skills/data")).text();
    expect(skill).toBe(apiSkill);
    expect((await server.request("/skills/data.md")).headers.get("cache-control")).toBe("no-store");

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
});

async function uploadPng(server: ServerHandle, cookie: string): Promise<{ id: string }> {
  const body = new FormData();
  body.set("file", new File([new Uint8Array([137, 80, 78, 71])], "a.png", { type: "image/png" }));
  const response = await server.request("/pcp/v1/files", {
    method: "POST",
    headers: { cookie },
    body,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as { id: string };
}

async function uploadArchive(
  server: ServerHandle,
  cookie: string,
  bytes: Uint8Array,
): Promise<Response> {
  const body = new FormData();
  body.set("archive", new File([bytes], "site.zip", { type: "application/zip" }));
  return server.request("/pcp/v1/site/releases", {
    method: "POST",
    headers: { cookie, origin: ORIGIN },
    body,
  });
}

async function mcpToolNames(server: ServerHandle): Promise<string[]> {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const init = await server.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    }),
  });
  expect(init.status, await init.clone().text()).toBe(200);
  const listed = await server.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  const body = (await listed.json()) as { result?: { tools?: { name: string }[] } };
  return (body.result?.tools ?? []).map((tool) => tool.name);
}

async function mcpCall(
  server: ServerHandle,
  name: string,
  args: Record<string, unknown>,
  extra: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const response = await server.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extra,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = (await response.json()) as {
    result?: { content?: { text?: string }[]; isError?: boolean };
    error?: { message?: string };
  };
  const text = body.result?.content?.[0]?.text ?? body.error?.message ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}
