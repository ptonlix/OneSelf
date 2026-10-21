import { expect, it } from "vitest";

import { addSource, boot, jsonHeaders, owner, putPage, readJson } from "./support.js";

it("returns an authorized search hit without the page body", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const body = `prefix ${"x".repeat(180)} only-credential-token`;
  expect(
    (
      await putPage(
        server,
        cookie,
        "notes",
        "hidden",
        `---
type: note
title: Hidden
visibility: private
---

${body}
`,
      )
    ).status,
  ).toBe(200);
  const response = await server.request("/pcp/v1/search", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ q: "only-credential-token" }),
  });
  expect(response.status).toBe(200);
  const hits = (await response.json()) as {
    source: string;
    slug: string;
    type: string;
    title: string;
    snippet: string;
  }[];
  expect(hits).toHaveLength(1);
  const hit = hits[0];
  if (hit === undefined) {
    throw new Error("search hit missing");
  }
  expect(Object.keys(hit).sort()).toEqual(["slug", "snippet", "source", "title", "type"]);
  expect(hit).toMatchObject({ source: "notes", slug: "hidden", type: "note", title: "Hidden" });
  expect(hit.snippet).toContain("only-credential-token");
  expect(hit.snippet.length).toBeLessThanOrEqual(140);
  expect(hit.snippet).not.toBe(body);
  await server.close();
});

it("finds a page by type when the type is not in the body", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect(
    (
      await putPage(
        server,
        cookie,
        "notes",
        "ledger",
        `---
type: ledger
title: Hidden
visibility: private
---

ordinary prose
`,
      )
    ).status,
  ).toBe(200);
  const response = await server.request("/pcp/v1/search", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ q: "ledger" }),
  });
  expect(response.status).toBe(200);
  const hits = (await response.json()) as { source: string; slug: string; snippet: string }[];
  expect(hits).toEqual([
    expect.objectContaining({ source: "notes", slug: "ledger", snippet: "ledger" }),
  ]);
  await server.close();
});

it("does not recall a fact removed from the current page", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect(
    (
      await putPage(
        server,
        cookie,
        "notes",
        "hello",
        `---
type: note
title: Note
visibility: private
---

## Facts

- id: fact_old
  entity: ada
  statement: lived in paris

- id: fact_keep
  entity: ada
  statement: lives in shanghai
`,
      )
    ).status,
  ).toBe(200);
  const forgotten = await server.request("/pcp/v1/facts/fact_old/forget", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ source: "notes", slug: "hello" }),
  });
  expect(forgotten.status, await forgotten.clone().text()).toBe(200);
  const recalled = await readJson(
    await server.request("/pcp/v1/recall", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ q: "lived in paris" }),
    }),
  );
  expect(recalled).toEqual({ facts: [] });
  const kept = await readJson(
    await server.request("/pcp/v1/recall", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ q: "lives in shanghai" }),
    }),
  );
  expect(kept.facts).toEqual([
    expect.objectContaining({
      source: "notes",
      slug: "hello",
      id: "fact_keep",
      statement: "lives in shanghai",
    }),
  ]);
  await server.close();
});
