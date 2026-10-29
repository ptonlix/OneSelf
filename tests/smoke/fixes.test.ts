import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import type {
  OauthGrantInsert,
  OauthGrantPatch,
  PostgresStore,
} from "../../packages/adapters/src/postgres-store.js";
import { loadProjection } from "../../apps/server/src/app/postgres-state.js";
import type { OauthGrantView } from "../../apps/server/src/app/runtime.js";
import {
  addSource,
  boot,
  expectError,
  issueAccessToken,
  issueApiKey,
  jsonHeaders,
  login,
  markdown,
  mcpToolNames,
  owner,
  putPage,
  readJson,
} from "./support.js";

it("serves admin HTML for browser navigation and JSON only for an explicit Accept", async () => {
  const admin = mkdtempSync(path.join(tmpdir(), "oneself-admin-"));
  mkdirSync(path.join(admin, "assets"));
  writeFileSync(
    path.join(admin, "index.html"),
    '<!doctype html><title>ADMIN-DIST</title><script src="/admin/assets/app.js"></script>',
  );
  writeFileSync(path.join(admin, "assets", "app.js"), "console.log('admin')");
  writeFileSync(path.join(admin, "assets", "x.woff2"), new Uint8Array([0x77, 0x4f, 0x46, 0x32]));
  const server = await boot({ adminDistDir: admin });
  const font = await server.request("/admin/assets/x.woff2");
  expect(font.status).toBe(200);
  expect(font.headers.get("content-type")).toBe("font/woff2");
  for (const pathName of [
    "/admin/",
    "/admin/login",
    "/admin/password",
    "/admin/device",
    "/admin/api-keys/new",
    "/admin/api-keys/req_1",
    "/admin/site-activations/new",
    "/admin/site-activations/act_1",
  ]) {
    const page = await server.request(pathName, { headers: { accept: "text/html" } });
    expect(page.status, pathName).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("ADMIN-DIST");
  }
  const json = await server.request("/admin/api-keys/req_1", {
    headers: { accept: "application/json" },
  });
  expect(json.status).toBe(401);
  expect((await readJson(json)).error).toBe("unauthorized");
  await server.close();
});

it("serves the original dist and keeps source HTML out of the live page", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "oneself-pages-"));
  mkdirSync(path.join(root, "dist", "assets"), { recursive: true });
  writeFileSync(
    path.join(root, "index.html"),
    '<title>SOURCE-TITLE</title><script type="module" src="/src/main.ts"></script>',
  );
  writeFileSync(path.join(root, "package.json"), '{"name":"@oneself/public-page"}');
  writeFileSync(
    path.join(root, "dist", "index.html"),
    '<title>DIST-TITLE</title><script src="/assets/app.js"></script>',
  );
  writeFileSync(path.join(root, "dist", "assets", "app.js"), "console.log('dist')");
  const server = await boot({ publicPageDir: root });
  const home = await server.request("/");
  const text = await home.text();
  expect(text).toContain("DIST-TITLE");
  expect(text).not.toContain("SOURCE-TITLE");
  expect(text).not.toContain("/src/main.ts");
  const cookie = await owner(server);
  const source = await server.request("/pcp/v1/site/source", { headers: { cookie } });
  expect(source.status).toBe(200);
  const zipText = new TextDecoder().decode(new Uint8Array(await source.arrayBuffer()));
  expect(zipText).toContain("SOURCE-TITLE");
  expect(zipText).not.toContain("DIST-TITLE");
  await server.close();
});

it("rejects a timeline title or fact statement that would not round-trip", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const { addSource } = await import("./support.js");
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  const titled = await server.request("/pcp/v1/pages/notes/hello/timeline", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ date: "2024-06-01", title: "a | b", detail: "ok" }),
  });
  await expectError(titled, 400, "invalid");
  const stated = await server.request("/pcp/v1/facts", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({
      source: "notes",
      slug: "hello",
      entity: "ada",
      statement: "line\nbreak",
    }),
  });
  await expectError(stated, 400, "invalid");
  const page = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } }),
  );
  expect(String(page.markdown)).not.toContain("a | b");
  expect(String(page.markdown)).not.toContain("line\nbreak");
  await server.close();
});

it("revokes a reused refresh token after the grant is reloaded", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const device = await readJson(
    await server.request("/oauth/device/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  expect(
    (
      await server.request("/admin/device", {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: JSON.stringify({
          user_code: device.user_code,
          unrestricted_data: false,
          site_write: false,
          sources: [],
        }),
      })
    ).status,
  ).toBe(200);
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
  const refresh = String(token.refresh_token);
  const rotated = await readJson(
    await server.request("/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
    }),
  );
  const snapshot = server.runtime.oauthGrants();
  expect(snapshot.some((grant) => grant.rotatedRefreshHashes.length > 0)).toBe(true);
  await server.close();
  const reloaded = await boot({ seedGrants: snapshot });
  const reused = await reloaded.request("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
  });
  expect(reused.status).toBe(400);
  const killed = await reloaded.request("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: String(rotated.refresh_token),
    }),
  });
  expect(killed.status).toBe(400);
  await reloaded.close();
});

it("lets the owner revoke one oauth grant", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const device = await readJson(
    await server.request("/oauth/device/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  expect(
    (
      await server.request("/admin/device", {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: JSON.stringify({
          user_code: device.user_code,
          unrestricted_data: false,
          site_write: false,
          sources: [],
        }),
      })
    ).status,
  ).toBe(200);
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
  const grantId = server.runtime.oauthGrants()[0]?.id;
  expect(grantId).toBeTypeOf("string");
  const revoked = await server.request(`/admin/oauth-grants/${String(grantId)}/revoke`, {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: "{}",
  });
  expect(revoked.status).toBe(200);
  const refresh = await server.request("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: String(token.refresh_token),
    }),
  });
  expect(refresh.status).toBe(400);
  await server.close();
});

it("lists oauth grants to the owner without any token material", async () => {
  const admin = mkdtempSync(path.join(tmpdir(), "oneself-admin-"));
  writeFileSync(path.join(admin, "index.html"), "<!doctype html><title>ADMIN-DIST</title>");
  const server = await boot({ adminDistDir: admin });
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const sources = [{ id: "notes", read: true, write: false, visibility: true }];
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
      unrestricted_data: false,
      site_write: true,
      sources,
    }),
  });
  expect(approved.status).toBe(200);
  const token = await readJson(
    await server.request(
      "/oauth/token",
      tokenRequest({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: String(device.device_code),
      }),
    ),
  );
  const accessToken = String(token.access_token);
  const refreshToken = String(token.refresh_token);
  expect(accessToken.length).toBeGreaterThan(0);

  const listGrants = (headers: Record<string, string>): Promise<Response> =>
    server.request("/admin/oauth-grants", {
      headers: { accept: "application/json", ...headers },
    });
  const listed = await listGrants({ cookie });
  expect(listed.status).toBe(200);
  const text = await listed.text();
  expect(text).not.toContain(accessToken);
  expect(text).not.toContain(refreshToken);
  expect(text).not.toMatch(/token|refresh|hash/i);
  expect(text).not.toMatch(/[0-9a-f]{64}/i);
  const body = JSON.parse(text) as { oauth_grants: OauthGrantView[] };
  expect(Object.keys(body)).toEqual(["oauth_grants"]);
  expect(body.oauth_grants).toHaveLength(1);
  const grant = body.oauth_grants[0];
  const fields: readonly (keyof OauthGrantView)[] = [
    "created_at",
    "id",
    "revoked_at",
    "site_write",
    "sources",
    "unrestricted_data",
  ];
  expect(Object.keys(grant ?? {}).sort()).toEqual(fields);
  expect(grant?.site_write).toBe(true);
  expect(grant?.unrestricted_data).toBe(false);
  expect(grant?.sources).toEqual(sources);
  expect(grant?.revoked_at).toBeNull();
  expect(grant?.id).toBe(server.runtime.oauthGrants()[0]?.id);

  const revoked = await server.request(`/admin/oauth-grants/${String(grant?.id)}/revoke`, {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: "{}",
  });
  expect(revoked.status).toBe(200);
  const after = (await readJson(await listGrants({ cookie }))) as {
    oauth_grants: { id: string; revoked_at: string | null }[];
  };
  expect(after.oauth_grants).toHaveLength(1);
  expect(after.oauth_grants[0]?.id).toBe(grant?.id);
  expect(typeof after.oauth_grants[0]?.revoked_at).toBe("string");

  await expectError(await listGrants({}), 401, "unauthorized");
  const key = await issueApiKey(server, cookie, { label: "agent", unrestricted_data: true });
  await expectError(await listGrants({ authorization: `ApiKey ${key.key}` }), 403, "forbidden");
  const bearer = await issueAccessToken(server, cookie, { sources });
  await expectError(await listGrants({ authorization: `Bearer ${bearer}` }), 403, "forbidden");

  const page = await server.request("/admin/oauth-grants", { headers: { accept: "text/html" } });
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toContain("text/html");
  expect(await page.text()).toContain("ADMIN-DIST");

  expect(await (await server.request("/openapi.json")).text()).not.toContain("oauth-grants");
  expect((await mcpToolNames(server)).join(" ")).not.toMatch(/oauth.?grant/i);
  await server.close();

  const fresh = await boot();
  const gated = await login(fresh);
  const blocked = await fresh.request("/admin/oauth-grants", {
    headers: { accept: "application/json", cookie: gated },
  });
  await expectError(blocked, 403, "password_change_required");
  await fresh.close();
});

it("keeps the issued refresh when a used device code is submitted again", async () => {
  const server = await boot();
  const issued = await deviceRefresh(server);
  const replay = await server.request(
    "/oauth/token",
    tokenRequest({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: issued.deviceCode,
    }),
  );
  expect(replay.status).toBe(400);
  const refresh = await server.request(
    "/oauth/token",
    tokenRequest({ grant_type: "refresh_token", refresh_token: issued.refresh }),
  );
  expect(refresh.status).toBe(200);
  expect(server.runtime.oauthGrants().every((grant) => grant.revokedAt === null)).toBe(true);
  await server.close();
});

it("revokes the grant when a rotated refresh is replayed after its adapter row is deleted", async () => {
  const server = await boot();
  const issued = await deviceRefresh(server);
  const rotated = await readJson(
    await server.request(
      "/oauth/token",
      tokenRequest({ grant_type: "refresh_token", refresh_token: issued.refresh }),
    ),
  );
  expect(typeof rotated.refresh_token).toBe("string");
  server.runtime.dropOauthRefreshAdapter(issued.refresh);
  const reused = await server.request(
    "/oauth/token",
    tokenRequest({ grant_type: "refresh_token", refresh_token: issued.refresh }),
  );
  expect(reused.status).toBe(400);
  const killed = await server.request(
    "/oauth/token",
    tokenRequest({
      grant_type: "refresh_token",
      refresh_token: String(rotated.refresh_token),
    }),
  );
  expect(killed.status).toBe(400);
  expect(server.runtime.oauthGrants().some((grant) => grant.revokedAt !== null)).toBe(true);
  await server.close();
});

it("reloads rotated refresh reuse through loadProjection", async () => {
  const backing = grantBacking();
  const postgres = { store: backing.store, close: () => Promise.resolve() };
  const server = await boot({ postgres });
  const issued = await deviceRefresh(server);
  const rotated = await readJson(
    await server.request(
      "/oauth/token",
      tokenRequest({ grant_type: "refresh_token", refresh_token: issued.refresh }),
    ),
  );
  const current = String(rotated.refresh_token);
  expect(current.length).toBeGreaterThan(0);
  expect(
    backing.writes.some(
      (write) =>
        Array.isArray(write.rotated_refresh_hashes) && write.rotated_refresh_hashes.length > 0,
    ),
  ).toBe(true);
  expect(
    backing.writes.some(
      (write) =>
        typeof write.refresh_token_payload === "object" &&
        write.refresh_token_payload !== null &&
        !Array.isArray(write.refresh_token_payload),
    ),
  ).toBe(true);
  const loaded = await loadProjection(backing.store, {
    put: () => Promise.resolve({ created: true }),
    get: () => Promise.resolve(null),
    delete: () => Promise.resolve(),
    list: () => Promise.resolve([]),
  });
  expect(loaded.grants).toHaveLength(1);
  expect(loaded.grants[0]?.rotatedRefreshHashes.length).toBeGreaterThan(0);
  expect(loaded.grants[0]?.refreshTokenPayload).not.toBeNull();
  await server.close();

  const reloaded = await boot({ postgres });
  const stillResponse = await reloaded.request(
    "/oauth/token",
    tokenRequest({ grant_type: "refresh_token", refresh_token: current }),
  );
  expect(stillResponse.status, await stillResponse.clone().text()).toBe(200);
  const still = await readJson(stillResponse);
  expect(typeof still.refresh_token).toBe("string");
  const reused = await reloaded.request(
    "/oauth/token",
    tokenRequest({ grant_type: "refresh_token", refresh_token: issued.refresh }),
  );
  expect(reused.status).toBe(400);
  const killed = await reloaded.request(
    "/oauth/token",
    tokenRequest({
      grant_type: "refresh_token",
      refresh_token: String(still.refresh_token),
    }),
  );
  expect(killed.status).toBe(400);
  expect(reloaded.runtime.oauthGrants().some((grant) => grant.revokedAt !== null)).toBe(true);
  await reloaded.close();
});

it("reloads unrestricted device data and keeps an older grant restricted", async () => {
  const backing = grantBacking([
    {
      id: "grant_old",
      site_write: false,
      unrestricted_data: false,
      sources: [{ id: "notes", read: true, write: false, visibility: false }],
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ]);
  const postgres = { store: backing.store, close: () => Promise.resolve() };
  const server = await boot({ postgres });
  const older = server.runtime.oauthGrants().find((grant) => grant.id === "grant_old");
  expect(older?.unrestrictedData).toBe(false);
  expect(older?.sources).toEqual([{ id: "notes", read: true, write: false, visibility: false }]);

  const cookie = await owner(server);
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
      unrestricted_data: true,
      site_write: false,
      sources: [{ id: "notes", read: true, write: true, visibility: true }],
    }),
  });
  expect(approved.status, await approved.clone().text()).toBe(200);
  await server.close();

  const reloaded = await boot({ postgres });
  const grants = reloaded.runtime.oauthGrants();
  expect(grants.find((grant) => grant.id === "grant_old")).toMatchObject({
    unrestrictedData: false,
    sources: [{ id: "notes", read: true, write: false, visibility: false }],
  });
  const created = grants.find((grant) => grant.id !== "grant_old");
  expect(created).toMatchObject({ unrestrictedData: true, sources: [] });
  await reloaded.close();
});

function tokenRequest(params: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  };
}

async function deviceRefresh(server: Awaited<ReturnType<typeof boot>>): Promise<{
  deviceCode: string;
  refresh: string;
}> {
  const cookie = await owner(server);
  const device = await readJson(
    await server.request("/oauth/device/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  expect(
    (
      await server.request("/admin/device", {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: JSON.stringify({
          user_code: device.user_code,
          unrestricted_data: false,
          site_write: false,
          sources: [],
        }),
      })
    ).status,
  ).toBe(200);
  const token = await readJson(
    await server.request(
      "/oauth/token",
      tokenRequest({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: String(device.device_code),
      }),
    ),
  );
  return { deviceCode: String(device.device_code), refresh: String(token.refresh_token) };
}

function grantBacking(
  seed: {
    id: string;
    site_write: boolean;
    unrestricted_data: boolean;
    sources: OauthGrantInsert["sources"];
    created_at: Date;
  }[] = [],
): {
  store: PostgresStore;
  writes: Array<{
    rotated_refresh_hashes?: unknown;
    refresh_token_payload?: unknown;
  }>;
} {
  const grants: Array<{
    id: string;
    site_write: boolean;
    unrestricted_data?: boolean;
    sources: OauthGrantInsert["sources"];
    refresh_token_hash: string | null;
    rotated_refresh_hashes: unknown;
    refresh_token_payload: unknown;
    revoked_at: Date | null;
    created_at: Date;
  }> = seed.map((row) => ({
    id: row.id,
    site_write: row.site_write,
    unrestricted_data: row.unrestricted_data,
    sources: row.sources,
    refresh_token_hash: null,
    rotated_refresh_hashes: [],
    refresh_token_payload: null,
    revoked_at: null,
    created_at: row.created_at,
  }));
  const writes: Array<{
    rotated_refresh_hashes?: unknown;
    refresh_token_payload?: unknown;
  }> = [];
  const store = new Proxy({} as PostgresStore, {
    get(_target, prop) {
      if (prop === "transaction") {
        return (run: (inner: PostgresStore) => Promise<unknown>) => run(store);
      }
      if (prop === "insertOauthGrant") {
        return (row: OauthGrantInsert) => {
          writes.push({
            rotated_refresh_hashes: row.rotated_refresh_hashes,
            refresh_token_payload: row.refresh_token_payload,
          });
          grants.push({
            id: row.id,
            site_write: row.site_write,
            unrestricted_data: row.unrestricted_data ?? false,
            sources: row.sources,
            refresh_token_hash: row.refresh_token_hash ?? null,
            rotated_refresh_hashes: row.rotated_refresh_hashes ?? [],
            refresh_token_payload: row.refresh_token_payload ?? null,
            revoked_at: row.revoked_at ?? null,
            created_at: row.created_at,
          });
          return Promise.resolve();
        };
      }
      if (prop === "updateOauthGrant") {
        return (id: string, patch: OauthGrantPatch) => {
          writes.push({
            rotated_refresh_hashes: patch.rotated_refresh_hashes,
            refresh_token_payload: patch.refresh_token_payload,
          });
          const grant = grants.find((item) => item.id === id);
          if (grant !== undefined) {
            if (patch.refresh_token_hash !== undefined) {
              grant.refresh_token_hash = patch.refresh_token_hash;
            }
            if (patch.rotated_refresh_hashes !== undefined) {
              grant.rotated_refresh_hashes = patch.rotated_refresh_hashes;
            }
            if (patch.refresh_token_payload !== undefined) {
              grant.refresh_token_payload = patch.refresh_token_payload;
            }
            if (patch.revoked_at !== undefined) {
              grant.revoked_at = patch.revoked_at;
            }
          }
          return Promise.resolve();
        };
      }
      if (prop === "listOauthGrants") {
        return () =>
          Promise.resolve(grants.map((grant) => ({ ...grant, sources: [...grant.sources] })));
      }
      if (prop === "findOwner" || prop === "findSitePointer") {
        return () => Promise.resolve(null);
      }
      if (String(prop).startsWith("list") || String(prop).startsWith("find")) {
        return () => Promise.resolve([]);
      }
      return () => Promise.resolve(undefined);
    },
  });
  return { store, writes };
}
