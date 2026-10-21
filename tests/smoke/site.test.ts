import { expect, it } from "vitest";

import type { ServerHandle } from "../../apps/server/src/index.js";
import { readZip, writeStoredZip } from "../../apps/server/src/app/zip.js";
import {
  boot,
  expectError,
  issueApiKey,
  jsonHeaders,
  owner,
  readJson,
  uploadArchive,
} from "./support.js";

it("rejects reserved site paths, has no release delete route, and forbids agent approval", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const home = await server.request("/");
  expect(home.status).toBe(200);
  expect(home.headers.get("cache-control")).toBe("no-store");
  const homeText = await home.text();
  expect(homeText).toContain("OneSelf");
  expect(homeText).not.toContain("/src/main.ts");
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
  const anonymousPreview = await server.request(`/pcp/v1/site/releases/${releaseId}/preview`, {
    method: "POST",
  });
  await expectError(anonymousPreview, 401, "unauthorized");
  const preview = await readJson(
    await server.request(`/pcp/v1/site/releases/${releaseId}/preview`, {
      method: "POST",
      headers: { cookie },
    }),
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

it("downloads the original page source zip rather than an uploaded dist", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const uploaded = await uploadArchive(
    server,
    cookie,
    writeStoredZip([
      { path: "index.html", data: new TextEncoder().encode("UPLOADED-DIST-MARKER") },
    ]),
  );
  expect(uploaded.status, await uploaded.clone().text()).toBe(200);
  const response = await server.request("/pcp/v1/site/source", { headers: { cookie } });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/zip");
  expect(response.headers.get("content-disposition")).toBe(
    'attachment; filename="original-page-source.zip"',
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(new TextDecoder().decode(bytes)).not.toContain("UPLOADED-DIST-MARKER");
  const zip = readZip(bytes);
  if (!zip.ok) {
    throw new Error(zip.message);
  }
  const packageJson = zip.entries.find((entry) => entry.path === "package.json");
  if (packageJson === undefined) {
    throw new Error("source zip has no package.json");
  }
  expect(new TextDecoder().decode(packageJson.data)).toContain("@oneself/original-pages");
  expect(zip.entries.some((entry) => entry.path === "index.html")).toBe(true);
  expect(zip.entries.some((entry) => entry.path === "dist" || entry.path.startsWith("dist/"))).toBe(
    false,
  );
  await server.close();
});

it("returns to original only after the owner approves that activation", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const releaseId = await publish(server, cookie, "RELEASE-MARKER");
  expect(await (await server.request("/")).text()).toContain("RELEASE-MARKER");
  const activation = await readJson(
    await server.request("/pcp/v1/site/activate", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ release_id: "original" }),
    }),
  );
  expect(activation.status).toBe("pending");
  expect(
    await readJson(await server.request("/pcp/v1/site", { headers: { cookie } })),
  ).toMatchObject({ pointer: { release_id: releaseId } });
  expect(await (await server.request("/")).text()).toContain("RELEASE-MARKER");
  const approved = await server.request(
    `/admin/site-activations/${String(activation.id)}/approve`,
    {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ decision: "approve" }),
    },
  );
  expect(approved.status).toBe(200);
  const home = await (await server.request("/")).text();
  expect(home).toContain("OneSelf");
  expect(home).not.toContain("RELEASE-MARKER");
  expect(
    await readJson(await server.request("/pcp/v1/site", { headers: { cookie } })),
  ).toMatchObject({ pointer: { release_id: "original" } });
  await server.close();
});

it("leaves the live pointer unchanged when an activation is rejected", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const releaseId = await publish(server, cookie, "MARKER-A");
  const uploaded = await uploadArchive(
    server,
    cookie,
    writeStoredZip([{ path: "index.html", data: new TextEncoder().encode("MARKER-B") }]),
  );
  const otherId = String((await readJson(uploaded)).id);
  const activation = await readJson(
    await server.request("/pcp/v1/site/activate", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ release_id: otherId }),
    }),
  );
  const rejected = await readJson(
    await server.request(`/admin/site-activations/${String(activation.id)}/approve`, {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ decision: "reject" }),
    }),
  );
  expect(rejected).toEqual({ status: "rejected", release_id: releaseId });
  const home = await (await server.request("/")).text();
  expect(home).toContain("MARKER-A");
  expect(home).not.toContain("MARKER-B");
  await server.close();
});

it("forbids a key without site:write from uploading or requesting activation", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const agent = await issueApiKey(server, cookie, {
    label: "no-site",
    unrestricted_data: true,
    site_write: false,
  });
  const form = new FormData();
  form.set(
    "archive",
    new File(
      [writeStoredZip([{ path: "index.html", data: new TextEncoder().encode("NOPE") }])],
      "site.zip",
      { type: "application/zip" },
    ),
  );
  const uploaded = await server.request("/pcp/v1/site/releases", {
    method: "POST",
    headers: { authorization: `ApiKey ${agent.key}`, origin: "http://127.0.0.1:3000" },
    body: form,
  });
  await expectError(uploaded, 403, "forbidden");
  expect(
    (await readJson(await server.request("/pcp/v1/site", { headers: { cookie } }))).releases,
  ).toEqual([]);
  const activation = await server.request("/pcp/v1/site/activate", {
    method: "POST",
    headers: jsonHeaders({ authorization: `ApiKey ${agent.key}` }),
    body: JSON.stringify({ release_id: "original" }),
  });
  await expectError(activation, 403, "forbidden");
  expect(await (await server.request("/")).text()).toContain("OneSelf");
  expect(await (await server.request("/")).text()).not.toContain("NOPE");
  await server.close();
});

async function publish(server: ServerHandle, cookie: string, marker: string): Promise<string> {
  const uploaded = await uploadArchive(
    server,
    cookie,
    writeStoredZip([{ path: "index.html", data: new TextEncoder().encode(marker) }]),
  );
  expect(uploaded.status, await uploaded.clone().text()).toBe(200);
  const releaseId = String((await readJson(uploaded)).id);
  const activation = await readJson(
    await server.request("/pcp/v1/site/activate", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ release_id: releaseId }),
    }),
  );
  const approved = await server.request(
    `/admin/site-activations/${String(activation.id)}/approve`,
    {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ decision: "approve" }),
    },
  );
  expect(approved.status, await approved.clone().text()).toBe(200);
  return releaseId;
}
