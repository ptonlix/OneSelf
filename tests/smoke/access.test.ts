import { expect, it } from "vitest";

import { boot, jsonHeaders, ORIGIN, owner, readJson } from "./support.js";

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
