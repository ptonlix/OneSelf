import { expect, it } from "vitest";

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
} from "./support.js";

it("lists only directories the caller can read", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  await addSource(server, cookie, "work");
  const limited = await issueApiKey(server, cookie, {
    label: "notes-only",
    sources: [{ id: "notes", read: true, write: false, visibility: false }],
  });
  expect(
    await readJson(
      await server.request("/pcp/v1/sources", {
        headers: { authorization: `ApiKey ${limited.key}` },
      }),
    ),
  ).toEqual({ sources: [{ id: "notes" }] });
  expect(await readJson(await server.request("/pcp/v1/sources", { headers: { cookie } }))).toEqual({
    sources: [{ id: "notes" }, { id: "work" }],
  });
  expect(
    (await server.request("/pcp/v1/sources/work", { method: "DELETE", headers: { cookie } }))
      .status,
  ).toBe(200);
  expect(await readJson(await server.request("/pcp/v1/sources", { headers: { cookie } }))).toEqual({
    sources: [{ id: "notes" }],
  });
  await server.close();
});

it("reports the live page count and treats a deleted directory as not_found", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  server.clock.set(new Date("2026-10-21T00:00:00.000Z"));
  expect((await putPage(server, cookie, "notes", "older", markdown("gone"))).status).toBe(200);
  server.clock.set(new Date("2026-10-22T00:00:00.000Z"));
  expect((await putPage(server, cookie, "notes", "kept", markdown("here"))).status).toBe(200);
  expect(
    (
      await server.request("/pcp/v1/pages/notes/older", {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
  ).toBe(200);
  expect(
    await readJson(await server.request("/pcp/v1/sources/notes", { headers: { cookie } })),
  ).toEqual({
    id: "notes",
    page_count: 1,
    latest_write_at: "2026-10-22T00:00:00.000Z",
  });
  expect(
    (await server.request("/pcp/v1/sources/notes", { method: "DELETE", headers: { cookie } }))
      .status,
  ).toBe(200);
  const missing = await server.request("/pcp/v1/sources/notes", { headers: { cookie } });
  await expectError(missing, 404, "not_found");
  await server.close();
});

it("forbids an API key from deleting a directory", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  const agent = await issueApiKey(server, cookie, {
    label: "unrestricted",
    unrestricted_data: true,
  });
  const deleted = await server.request("/pcp/v1/sources/notes", {
    method: "DELETE",
    headers: { authorization: `ApiKey ${agent.key}` },
  });
  await expectError(deleted, 403, "forbidden");
  const status = await readJson(
    await server.request("/pcp/v1/sources/notes", {
      headers: { authorization: `ApiKey ${agent.key}` },
    }),
  );
  expect(status).toMatchObject({ id: "notes", page_count: 1 });
  const page = await readJson(
    await server.request("/pcp/v1/pages/notes/hello", {
      headers: { authorization: `ApiKey ${agent.key}` },
    }),
  );
  expect(page.markdown).toContain("alpha");
  await server.close();
});

it("restores a directory without resurrecting an older page delete", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const kept = `---
type: note
title: Kept
visibility: public
---

kept body
`;
  expect((await putPage(server, cookie, "notes", "kept", kept)).status).toBe(200);
  expect((await putPage(server, cookie, "notes", "older", markdown("older body"))).status).toBe(
    200,
  );
  expect(
    (
      await server.request("/pcp/v1/pages/notes/older", {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
  ).toBe(200);
  expect(
    (await server.request("/pcp/v1/sources/notes", { method: "DELETE", headers: { cookie } }))
      .status,
  ).toBe(200);
  await expectError(
    await server.request("/pcp/v1/pages/notes/kept", { headers: { cookie } }),
    404,
    "not_found",
  );
  const restored = await readJson(
    await server.request("/pcp/v1/sources/notes/restore", {
      method: "POST",
      headers: { cookie },
    }),
  );
  expect(restored).toEqual({ id: "notes" });
  expect(await readJson(await server.request("/pcp/v1/sources", { headers: { cookie } }))).toEqual({
    sources: [{ id: "notes" }],
  });
  const readable = await readJson(
    await server.request("/pcp/v1/pages/notes/kept", { headers: { cookie } }),
  );
  expect(readable.markdown).toContain("kept body");
  expect((await server.request("/pcp/v1/public/pages/notes/kept")).status).toBe(200);
  await expectError(
    await server.request("/pcp/v1/pages/notes/older", { headers: { cookie } }),
    404,
    "not_found",
  );
  await server.close();
});

it("conflicts when adding a source id that is still soft-deleted", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  expect((await putPage(server, cookie, "notes", "hello", markdown("alpha"))).status).toBe(200);
  expect(
    (await server.request("/pcp/v1/sources/notes", { method: "DELETE", headers: { cookie } }))
      .status,
  ).toBe(200);
  const again = await server.request("/pcp/v1/sources", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ id: "notes" }),
  });
  await expectError(again, 409, "conflict");
  expect(await readJson(await server.request("/pcp/v1/sources", { headers: { cookie } }))).toEqual({
    sources: [],
  });
  await expectError(
    await server.request("/pcp/v1/sources/notes", { headers: { cookie } }),
    404,
    "not_found",
  );
  await expectError(
    await server.request("/pcp/v1/pages/notes/hello", { headers: { cookie } }),
    404,
    "not_found",
  );
  expect(server.runtime.state.sources.filter((source) => source.id === "notes")).toHaveLength(1);
  await server.close();
});
