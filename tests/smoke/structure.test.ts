import { expect, it } from "vitest";

import { addSource, boot, jsonHeaders, markdown, owner, putPage, readJson } from "./support.js";

it("remember adds a fact to the markdown and returns the new object hash", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const created = await readJson(
    await putPage(server, cookie, "notes", "hello", markdown("alpha")),
  );
  const remembered = await readJson(
    await server.request("/pcp/v1/facts", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({
        source: "notes",
        slug: "hello",
        id: "fact_01",
        entity: "ada",
        statement: "lives in shanghai",
      }),
    }),
  );
  expect(remembered).toMatchObject({ source: "notes", slug: "hello" });
  expect(remembered.hash).not.toBe(created.hash);
  const stored = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } }),
  );
  expect(stored.hash).toBe(remembered.hash);
  expect(stored.markdown).toContain("## Facts");
  expect(stored.markdown).toContain("id: fact_01");
  expect(stored.markdown).toContain("statement: lives in shanghai");
  const recalled = await readJson(
    await server.request("/pcp/v1/recall", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ q: "lives in shanghai" }),
    }),
  );
  expect(recalled.facts).toEqual([
    expect.objectContaining({
      source: "notes",
      slug: "hello",
      id: "fact_01",
      entity: "ada",
      statement: "lives in shanghai",
    }),
  ]);
  await server.close();
});

it("forget removes one fact from the current page but not an older version", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  const remembered = await readJson(
    await server.request("/pcp/v1/facts", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({
        source: "notes",
        slug: "hello",
        id: "fact_old",
        entity: "ada",
        statement: "lived in paris",
      }),
    }),
  );
  const forgotten = await server.request("/pcp/v1/facts/fact_old/forget", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ source: "notes", slug: "hello" }),
  });
  expect(forgotten.status, await forgotten.clone().text()).toBe(200);
  const stored = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } }),
  );
  expect(stored.markdown).not.toContain("fact_old");
  const recalled = await readJson(
    await server.request("/pcp/v1/recall", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ entity: "ada" }),
    }),
  );
  expect(recalled).toEqual({ facts: [] });
  const previous = await server.runtime.objectStore.get(
    `pages/notes/hello/${String(remembered.hash)}.md`,
  );
  if (previous === null) {
    throw new Error("older version object missing");
  }
  expect(new TextDecoder().decode(previous.body)).toContain("fact_old");
  await server.close();
});

it("reads and writes tags through the current frontmatter", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  const added = await readJson(
    await server.request("/pcp/v1/pages/notes/hello/tags/alpha", {
      method: "PUT",
      headers: { cookie },
    }),
  );
  expect(added).toMatchObject({ source: "notes", slug: "hello" });
  expect(
    await readJson(await server.request("/pcp/v1/pages/notes/hello/tags", { headers: { cookie } })),
  ).toEqual({ tags: ["alpha"] });
  expect(
    (
      await server.request("/pcp/v1/pages/notes/hello/tags/beta", {
        method: "PUT",
        headers: { cookie },
      })
    ).status,
  ).toBe(200);
  expect(
    await readJson(await server.request("/pcp/v1/pages/notes/hello/tags", { headers: { cookie } })),
  ).toEqual({ tags: ["alpha", "beta"] });
  const stored = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } }),
  );
  expect(stored.frontmatter).toMatchObject({ tags: ["alpha", "beta"] });
  expect(
    (
      await server.request("/pcp/v1/pages/notes/hello/tags/alpha", {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
  ).toBe(200);
  expect(
    await readJson(await server.request("/pcp/v1/pages/notes/hello/tags", { headers: { cookie } })),
  ).toEqual({ tags: ["beta"] });
  await server.close();
});

it("adds and reads a timeline entry", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  const added = await readJson(
    await server.request("/pcp/v1/pages/notes/hello/timeline", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ date: "2024-06-01", title: "Joined", detail: "backend" }),
    }),
  );
  expect(added).toMatchObject({ source: "notes", slug: "hello" });
  expect(
    await readJson(
      await server.request("/pcp/v1/pages/notes/hello/timeline", { headers: { cookie } }),
    ),
  ).toEqual({
    entries: [{ date: "2024-06-01", title: "Joined", detail: "backend" }],
  });
  const stored = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } }),
  );
  expect(stored.markdown).toContain("## Timeline");
  expect(stored.markdown).toContain("2024-06-01 | Joined | backend");
  await server.close();
});

it("adds, reads, and removes a link without a type", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "from", markdown("alpha"))).status).toBe(200);
  expect((await putPage(server, cookie, "notes", "to", markdown("beta"))).status).toBe(200);
  const link = { from: { source: "notes", slug: "from" }, to: { source: "notes", slug: "to" } };
  const added = await readJson(
    await server.request("/pcp/v1/links", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify(link),
    }),
  );
  expect(added).toMatchObject({ source: "notes", slug: "from" });
  expect(
    await readJson(await server.request("/pcp/v1/pages/notes/from/links", { headers: { cookie } })),
  ).toEqual({ links: [{ source: "notes", slug: "to" }] });
  expect(
    await readJson(
      await server.request("/pcp/v1/pages/notes/to/backlinks", { headers: { cookie } }),
    ),
  ).toEqual({ links: [{ source: "notes", slug: "from" }] });
  const stored = await readJson(
    await server.request("/pcp/v1/pages/notes/from", { headers: { cookie } }),
  );
  expect(stored.markdown).toContain("[[notes/to]]");
  expect(
    (
      await server.request("/pcp/v1/links", {
        method: "DELETE",
        headers: jsonHeaders({ cookie }),
        body: JSON.stringify(link),
      })
    ).status,
  ).toBe(200);
  expect(
    await readJson(await server.request("/pcp/v1/pages/notes/from/links", { headers: { cookie } })),
  ).toEqual({ links: [] });
  const removed = await readJson(
    await server.request("/pcp/v1/pages/notes/from", { headers: { cookie } }),
  );
  expect(removed.markdown).not.toContain("[[notes/to]]");
  await server.close();
});
