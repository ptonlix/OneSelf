import { expect, it } from "vitest";

import {
  addSource,
  boot,
  expectError,
  issueAccessToken,
  issueApiKey,
  jsonHeaders,
  markdown,
  ORIGIN,
  owner,
  putPage,
  readJson,
} from "./support.js";

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
    await server.request(`/admin/api-keys/${String(pending.id)}`, {
      headers: { cookie, accept: "application/json" },
    }),
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
      label: "agent",
      unrestricted_data: false,
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

it("returns the owner whoami result", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect(await readJson(await server.request("/pcp/v1/whoami", { headers: { cookie } }))).toEqual({
    credential: "owner",
    admin: true,
    site_write: true,
    unrestricted_data: true,
    sources: [{ id: "notes", read: true, write: true, visibility: true }],
  });
  await server.close();
});

it("revokes an API key on the next request", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  const issued = await issueApiKey(server, cookie, {
    label: "reader",
    sources: [{ id: "notes", read: true, write: false, visibility: false }],
  });
  expect(
    (
      await server.request("/pcp/v1/pages/notes/hello", {
        headers: { authorization: `ApiKey ${issued.key}` },
      })
    ).status,
  ).toBe(200);
  const revoked = await readJson(
    await server.request(`/pcp/v1/api-keys/${issued.id}`, {
      method: "DELETE",
      headers: { cookie },
    }),
  );
  expect(revoked).toEqual({ id: issued.id });
  const next = await server.request("/pcp/v1/pages/notes/hello", {
    headers: { authorization: `ApiKey ${issued.key}` },
  });
  await expectError(next, 404, "not_found");
  await expectError(
    await server.request("/pcp/v1/whoami", {
      headers: { authorization: `ApiKey ${issued.key}` },
    }),
    401,
    "unauthorized",
  );
  await server.close();
});

it("ends the owner session on logout", async () => {
  const server = await boot();
  const cookie = await owner(server);
  expect((await server.request("/pcp/v1/whoami", { headers: { cookie } })).status).toBe(200);
  const loggedOut = await server.request("/admin/logout", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
  });
  expect(loggedOut.status).toBe(200);
  const cleared = loggedOut.headers.get("set-cookie") ?? "";
  expect(cleared.startsWith("oneself_session=")).toBe(true);
  expect(cleared).toContain("Max-Age=0");
  const next = await server.request("/pcp/v1/whoami", { headers: { cookie } });
  await expectError(next, 401, "unauthorized");
  await server.close();
});

it("returns the same private page to an API key and an OAuth grant with the same flags", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("secret"))).status).toBe(200);
  const grants = [{ id: "notes", read: true, write: false, visibility: false }];
  const issued = await issueApiKey(server, cookie, { label: "reader", sources: grants });
  const accessToken = await issueAccessToken(server, cookie, {
    site_write: false,
    sources: grants,
  });
  const byKey = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", {
      headers: { authorization: `ApiKey ${issued.key}` },
    }),
  );
  const byOauth = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );
  expect(byKey).toEqual(byOauth);
  expect(byKey.visibility).toBe("private");
  expect(byKey.markdown).toContain("secret");
  await server.close();
});

it("leaves another key and an OAuth grant working after one key is revoked", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("secret"))).status).toBe(200);
  const grants = [{ id: "notes", read: true, write: false, visibility: false }];
  const first = await issueApiKey(server, cookie, { label: "first", sources: grants });
  const second = await issueApiKey(server, cookie, { label: "second", sources: grants });
  const accessToken = await issueAccessToken(server, cookie, { sources: grants });
  expect(
    (
      await server.request(`/pcp/v1/api-keys/${first.id}`, {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
  ).toBe(200);
  await expectError(
    await server.request("/pcp/v1/whoami", {
      headers: { authorization: `ApiKey ${first.key}` },
    }),
    401,
    "unauthorized",
  );
  const byKey = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", {
      headers: { authorization: `ApiKey ${second.key}` },
    }),
  );
  const byOauth = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );
  expect(byKey.markdown).toContain("secret");
  expect(byOauth.markdown).toContain("secret");
  await server.close();
});

it("does not approve a device when the label is missing, blank, or too long", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const device = await readJson(
    await server.request("/oauth/device/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  const base = {
    user_code: device.user_code,
    unrestricted_data: false,
    site_write: false,
    sources: [],
  };
  for (const label of [undefined, "   ", "a".repeat(81)]) {
    const body = label === undefined ? base : { ...base, label };
    const rejected = await server.request("/admin/device", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify(body),
    });
    await expectError(rejected, 400, "invalid");
  }
  expect(server.runtime.oauthGrants()).toEqual([]);
  await server.close();
});

it("does not approve a device when unrestricted_data is missing", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const device = await readJson(
    await server.request("/oauth/device/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  const missing = await server.request("/admin/device", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ user_code: device.user_code, site_write: false, sources: [] }),
  });
  await expectError(missing, 400, "invalid");
  expect(server.runtime.oauthGrants()).toEqual([]);
  const pending = await server.request("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: String(device.device_code),
    }),
  });
  expect(pending.status).not.toBe(200);
  expect(await pending.text()).not.toContain("access_token");
  await server.close();
});

it("lets an unrestricted device grant add a directory and shows that on whoami", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const ignored = [{ id: "notes", read: true, write: false, visibility: true }];
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
      label: "  agent  ",
      unrestricted_data: true,
      site_write: false,
      sources: ignored,
    }),
  });
  expect(approved.status, await approved.clone().text()).toBe(200);
  expect(await approved.text()).not.toContain("osk_");
  expect(server.runtime.oauthGrants()).toMatchObject([
    { unrestrictedData: true, siteWrite: false, sources: [] },
  ]);

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
  const headers = { authorization: `Bearer ${bearer}` };
  expect(await readJson(await server.request("/pcp/v1/whoami", { headers }))).toMatchObject({
    credential: "oauth",
    admin: false,
    unrestricted_data: true,
    site_write: false,
    sources: [],
  });

  const added = await server.request("/pcp/v1/sources", {
    method: "POST",
    headers: jsonHeaders(headers),
    body: JSON.stringify({ id: "notes" }),
  });
  expect(added.status, await added.clone().text()).toBe(200);
  expect(await readJson(await server.request("/pcp/v1/whoami", { headers }))).toMatchObject({
    unrestricted_data: true,
    sources: [{ id: "notes", read: true, write: true, visibility: true }],
  });
  const listed = await readJson(await server.request("/pcp/v1/sources", { headers }));
  expect(listed.sources).toEqual([{ id: "notes" }]);

  const deleted = await server.request("/pcp/v1/sources/notes", {
    method: "DELETE",
    headers,
  });
  await expectError(deleted, 403, "forbidden");
  expect((await server.request("/pcp/v1/sources/notes", { headers: { cookie } })).status).toBe(200);

  const grants = await server.request("/admin/oauth-grants", {
    headers: { accept: "application/json", cookie },
  });
  const grantText = await grants.text();
  expect(grantText).not.toContain(bearer);
  expect(grantText).not.toContain(String(token.refresh_token));
  expect(grantText).not.toMatch(/token|refresh|hash/i);
  const grantBody = JSON.parse(grantText) as {
    oauth_grants: { unrestricted_data: boolean; sources: unknown[] }[];
  };
  expect(grantBody.oauth_grants).toEqual([
    expect.objectContaining({ label: "agent", unrestricted_data: true, sources: [] }),
  ]);

  const restricted = await issueAccessToken(server, cookie, {
    unrestricted_data: false,
    sources: [{ id: "notes", read: true, write: true, visibility: true }],
  });
  const denied = await server.request("/pcp/v1/sources", {
    method: "POST",
    headers: jsonHeaders({ authorization: `Bearer ${restricted}` }),
    body: JSON.stringify({ id: "finance" }),
  });
  await expectError(denied, 403, "forbidden");
  expect((await server.request("/pcp/v1/sources/finance", { headers: { cookie } })).status).toBe(
    404,
  );
  const restrictedWho = await readJson(
    await server.request("/pcp/v1/whoami", {
      headers: { authorization: `Bearer ${restricted}` },
    }),
  );
  expect(restrictedWho.unrestricted_data).toBe(false);

  const key = await issueApiKey(server, cookie, { label: "all", unrestricted_data: true });
  expect(
    await readJson(
      await server.request("/pcp/v1/whoami", {
        headers: { authorization: `ApiKey ${key.key}` },
      }),
    ),
  ).toMatchObject({
    credential: "api_key",
    unrestricted_data: true,
    sources: [{ id: "notes", read: true, write: true, visibility: true }],
  });
  await server.close();
});

it("keeps last use when a grant is refreshed or revoked", async () => {
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
          label: "claude",
          unrestricted_data: true,
          site_write: false,
          sources: [],
        }),
      })
    ).status,
  ).toBe(200);
  const list = () =>
    server.request("/admin/oauth-grants", {
      headers: { accept: "application/json", cookie },
    });
  const fresh = await readJson(await list());
  expect(fresh.oauth_grants).toEqual([
    expect.objectContaining({ label: "claude", last_used_at: null, expires_at: null }),
  ]);
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
  const issued = (await readJson(await list())).oauth_grants as {
    id: string;
    expires_at: string;
    last_used_at: string | null;
  }[];
  expect(issued[0]?.last_used_at).toBeNull();
  expect(typeof issued[0]?.expires_at).toBe("string");
  expect(
    (
      await server.request("/pcp/v1/whoami", {
        headers: { authorization: `Bearer ${String(token.access_token)}` },
      })
    ).status,
  ).toBe(200);
  const used = (await readJson(await list())).oauth_grants as {
    id: string;
    expires_at: string;
    last_used_at: string;
  }[];
  expect(typeof used[0]?.last_used_at).toBe("string");
  const refreshed = await readJson(
    await server.request("/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: String(token.refresh_token),
      }),
    }),
  );
  expect(typeof refreshed.access_token).toBe("string");
  const afterRefresh = (await readJson(await list())).oauth_grants as {
    expires_at: string;
    last_used_at: string;
  }[];
  expect(afterRefresh[0]?.last_used_at).toBe(used[0]?.last_used_at);
  expect(Date.parse(String(afterRefresh[0]?.expires_at))).toBeGreaterThan(
    Date.parse(String(issued[0]?.expires_at)),
  );
  expect(
    (
      await server.request(`/admin/oauth-grants/${String(used[0]?.id)}/revoke`, {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: "{}",
      })
    ).status,
  ).toBe(200);
  const after = await readJson(await list());
  const revokedGrant = (
    after.oauth_grants as { last_used_at: string; expires_at: null; revoked_at: string }[]
  )[0];
  expect(revokedGrant?.last_used_at).toBe(used[0]?.last_used_at);
  expect(revokedGrant?.expires_at).toBeNull();
  expect(typeof revokedGrant?.revoked_at).toBe("string");
  expect(JSON.stringify(after)).not.toMatch(/token|refresh|hash/i);
  await server.close();
});

it("honors the stored refresh expiry after a restart", async () => {
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
          label: "agent",
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
  const snapshot = server.runtime.oauthGrants();
  expect(snapshot[0]?.refreshExpiresAt).not.toBeNull();
  await server.close();

  const alive = await boot({ seedGrants: snapshot });
  const still = await alive.request("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
  });
  expect(still.status).toBe(200);
  await alive.close();

  const expired = await boot({
    seedGrants: snapshot.map((grant) => ({
      ...grant,
      refreshExpiresAt: "2020-01-01T00:00:00.000Z",
    })),
  });
  const dead = await expired.request("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
  });
  expect(dead.status).not.toBe(200);
  await expired.close();
});

it("deletes an active grant and a revoked history row", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const token = await issueAccessToken(server, cookie, { unrestricted_data: true });
  const listed = await readJson(
    await server.request("/admin/oauth-grants", {
      headers: { accept: "application/json", cookie },
    }),
  );
  const grants = listed.oauth_grants as { id: string }[];
  const id = grants[0]?.id;
  expect(typeof id).toBe("string");
  const removed = await server.request(`/admin/oauth-grants/${String(id)}/delete`, {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: "{}",
  });
  expect(removed.status).toBe(200);
  const after = await readJson(
    await server.request("/admin/oauth-grants", {
      headers: { accept: "application/json", cookie },
    }),
  );
  expect(after.oauth_grants).toEqual([]);
  expect(
    server.runtime.oauthGrants().some((grant) => grant.id === id && grant.deletedAt !== null),
  ).toBe(true);
  await expectError(
    await server.request("/pcp/v1/whoami", { headers: { authorization: `Bearer ${token}` } }),
    401,
    "unauthorized",
  );
  const missing = await server.request("/admin/oauth-grants/missing/delete", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: "{}",
  });
  await expectError(missing, 404, "not_found");
  const key = await issueApiKey(server, cookie, { label: "agent", unrestricted_data: true });
  await expectError(
    await server.request(`/admin/oauth-grants/${String(id)}/delete`, {
      method: "POST",
      headers: jsonHeaders({ authorization: `ApiKey ${key.key}` }),
      body: "{}",
    }),
    403,
    "forbidden",
  );

  const again = await issueAccessToken(server, cookie, { unrestricted_data: false, sources: [] });
  const second = await readJson(
    await server.request("/admin/oauth-grants", {
      headers: { accept: "application/json", cookie },
    }),
  );
  const secondId = (second.oauth_grants as { id: string }[])[0]?.id;
  expect(
    (
      await server.request(`/admin/oauth-grants/${String(secondId)}/revoke`, {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: "{}",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await server.request(`/admin/oauth-grants/${String(secondId)}/delete`, {
        method: "POST",
        headers: jsonHeaders({ cookie }),
        body: "{}",
      })
    ).status,
  ).toBe(200);
  const empty = await readJson(
    await server.request("/admin/oauth-grants", {
      headers: { accept: "application/json", cookie },
    }),
  );
  expect(empty.oauth_grants).toEqual([]);
  expect(again.length).toBeGreaterThan(0);
  await server.close();
});
