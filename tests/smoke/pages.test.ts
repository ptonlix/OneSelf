import { expect, it } from "vitest";

import { writeStoredZip } from "../../apps/server/src/app/zip.js";
import {
  addSource,
  boot,
  expectError,
  issueApiKey,
  jsonHeaders,
  markdown,
  owner,
  putPage,
  readJson,
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

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

it("lists only non-deleted pages and filters by source, type, and prefix", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  await addSource(server, cookie, "work");
  expect(
    (await putPage(server, cookie, "notes", "alpha", page("note", "Alpha", "one"))).status,
  ).toBe(200);
  expect(
    (await putPage(server, cookie, "notes", "alpine", page("essay", "Alpine", "two"))).status,
  ).toBe(200);
  expect(
    (await putPage(server, cookie, "notes", "beta", page("note", "Beta", "three"))).status,
  ).toBe(200);
  expect(
    (await putPage(server, cookie, "work", "alpha", page("note", "Work", "four"))).status,
  ).toBe(200);
  expect(
    (
      await server.request("/pcp/v1/pages/notes/beta", {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
  ).toBe(200);

  const filtered = await readJson(
    await server.request("/pcp/v1/pages?source=notes&type=note&prefix=al", {
      headers: { cookie },
    }),
  );
  expect(filtered.pages).toEqual([
    {
      source: "notes",
      slug: "alpha",
      type: "note",
      title: "Alpha",
      visibility: "private",
      updated_at: "2026-10-20T00:00:00.000Z",
    },
  ]);
  const notes = await readJson(
    await server.request("/pcp/v1/pages?source=notes", { headers: { cookie } }),
  );
  expect(slugs(notes)).toEqual(["alpha", "alpine"]);
  const essays = await readJson(
    await server.request("/pcp/v1/pages?type=essay", { headers: { cookie } }),
  );
  expect(slugs(essays)).toEqual(["alpine"]);
  const deleted = await readJson(
    await server.request("/pcp/v1/pages?prefix=be", { headers: { cookie } }),
  );
  expect(deleted.pages).toEqual([]);
  await server.close();
});

it("restores a soft-deleted page inside the 30 day window", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  expect(
    (
      await server.request("/pcp/v1/pages/notes/hello", {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
  ).toBe(200);
  expect((await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } })).status).toBe(
    404,
  );

  const restored = await readJson(
    await server.request("/pcp/v1/pages/notes/hello/restore", {
      method: "POST",
      headers: { cookie },
    }),
  );
  expect(restored).toEqual({ source: "notes", slug: "hello" });
  const pageBody = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } }),
  );
  expect(pageBody.markdown).toContain("alpha");
  await server.close();
});

it("lists retained versions without a second copy of the body", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const first = await readJson(
    await putPage(server, cookie, "notes", "hello", markdown("version one")),
  );
  const second = await readJson(
    await putPage(server, cookie, "notes", "hello", markdown("version two")),
  );
  const listed = await readJson(
    await server.request("/pcp/v1/pages/notes/hello/versions", { headers: { cookie } }),
  );
  expect(listed.versions).toEqual([
    expect.objectContaining({
      hash: second.hash,
      written_at: "2026-10-20T00:00:00.000Z",
    }),
    expect.objectContaining({ hash: first.hash }),
  ]);
  const serialized = JSON.stringify(listed.versions);
  expect(serialized).not.toContain("version one");
  expect(serialized).not.toContain("version two");
  await server.close();
});

it("reverts the current page to a retained version", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const first = await readJson(
    await putPage(server, cookie, "notes", "hello", markdown("version one")),
  );
  expect((await putPage(server, cookie, "notes", "hello", markdown("version two"))).status).toBe(
    200,
  );
  const reverted = await readJson(
    await server.request("/pcp/v1/pages/notes/hello/revert", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ hash: first.hash }),
    }),
  );
  expect(reverted).toEqual({ source: "notes", slug: "hello", hash: first.hash });
  const current = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } }),
  );
  expect(current.markdown).toContain("version one");
  expect(current.markdown).not.toContain("version two");
  expect(current.hash).toBe(first.hash);
  const listed = await readJson(
    await server.request("/pcp/v1/pages/notes/hello/versions", { headers: { cookie } }),
  );
  const versions = listed.versions;
  if (!Array.isArray(versions)) {
    throw new Error("versions missing");
  }
  expect(versions).toHaveLength(3);
  expect(versions[0]).toMatchObject({ hash: first.hash });
  await server.close();
});

it("stores a new page as private when visibility is omitted", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const created = await putPage(
    server,
    cookie,
    "notes",
    "hello",
    "---\ntype: note\ntitle: Note\n---\n\nhidden\n",
  );
  expect(created.status).toBe(200);
  const stored = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } }),
  );
  expect(stored.visibility).toBe("private");
  const anon = await server.request("/pcp/v1/public/pages/notes/hello");
  await expectError(anon, 404, "not_found");
  const listed = await readJson(await server.request("/pcp/v1/public/pages"));
  expect(listed).toEqual([]);
  await server.close();
});

it("forbids a writer without visibility permission from publishing", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  const writer = await issueApiKey(server, cookie, {
    label: "writer",
    sources: [{ id: "notes", read: true, write: true, visibility: false }],
  });
  const published = await server.request("/pcp/v1/pages/notes/hello", {
    method: "PUT",
    headers: jsonHeaders({ authorization: `ApiKey ${writer.key}` }),
    body: JSON.stringify({
      markdown: "---\ntype: note\ntitle: Note\nvisibility: public\n---\n\nbeta\n",
    }),
  });
  await expectError(published, 403, "forbidden");
  const stored = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } }),
  );
  expect(stored.visibility).toBe("private");
  expect(stored.markdown).toContain("alpha");
  expect(stored.markdown).not.toContain("beta");
  await server.close();
});

it("lets a writer edit the body without changing visibility", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const created = await readJson(
    await putPage(server, cookie, "notes", "hello", markdown("Hello body")),
  );
  const writer = await issueApiKey(server, cookie, {
    label: "writer",
    sources: [{ id: "notes", read: true, write: true, visibility: false }],
  });
  const edited = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", {
      method: "PATCH",
      headers: jsonHeaders({ authorization: `ApiKey ${writer.key}` }),
      body: JSON.stringify({
        hash: created.hash,
        edits: [{ search: "Hello", replace: "Updated" }],
      }),
    }),
  );
  expect(edited).toMatchObject({ source: "notes", slug: "hello" });
  const stored = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", {
      headers: { authorization: `ApiKey ${writer.key}` },
    }),
  );
  expect(stored.markdown).toContain("Updated body");
  expect(stored.visibility).toBe("private");
  await server.close();
});

it("refuses to restore a page after the 30 day window", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  expect(
    (
      await server.request("/pcp/v1/pages/notes/hello", {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
  ).toBe(200);
  server.clock.set(new Date(server.clock.now().getTime() + RETENTION_MS + 1));
  const restored = await server.request("/pcp/v1/pages/notes/hello/restore", {
    method: "POST",
    headers: { cookie },
  });
  await expectError(restored, 409, "conflict");
  const missing = await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } });
  await expectError(missing, 404, "not_found");
  await server.close();
});

function page(type: string, title: string, body: string): string {
  return `---\ntype: ${type}\ntitle: ${title}\nvisibility: private\n---\n\n${body}\n`;
}

function slugs(body: Record<string, unknown>): string[] {
  if (!Array.isArray(body.pages)) {
    return [];
  }
  const values: string[] = [];
  for (const item of body.pages) {
    if (typeof item === "object" && item !== null && "slug" in item) {
      const slug = (item as { slug?: unknown }).slug;
      if (typeof slug === "string") {
        values.push(slug);
      }
    }
  }
  return values;
}
