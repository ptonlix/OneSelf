import { expect, it } from "vitest";

import { writeStoredZip } from "../../apps/server/src/app/zip.js";
import { boot, jsonHeaders, owner, readJson, uploadArchive } from "./support.js";

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
