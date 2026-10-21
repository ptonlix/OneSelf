import { expect, it } from "vitest";

import { writeStoredZip } from "../../apps/server/src/app/zip.js";
import {
  addSource,
  boot,
  markdown,
  owner,
  putPage,
  readJson,
  jsonHeaders,
  uploadArchive,
  uploadPng,
} from "./support.js";

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
  expect(await server.request("/pcp/v1/pages/notes/broken", { headers: { cookie } })).toMatchObject(
    { status: 404 },
  );

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
  const releaseObjects = (await server.runtime.objectStore.list("sites/")).map((item) => item.key);
  expect(releaseObjects.some((key) => key.startsWith(`sites/${String(releaseId)}/`))).toBe(true);
  await server.close();
});
