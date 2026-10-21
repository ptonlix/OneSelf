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

it("returns the owner whoami result", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect(await readJson(await server.request("/pcp/v1/whoami", { headers: { cookie } }))).toEqual({
    credential: "owner",
    admin: true,
    site_write: true,
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
