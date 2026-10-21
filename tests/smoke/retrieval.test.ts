import { expect, it } from "vitest";

import { addSource, boot, jsonHeaders, markdown, owner, putPage, readJson } from "./support.js";

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
  const listed = await readJson(await server.request("/pcp/v1/api-keys", { headers: { cookie } }));
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
