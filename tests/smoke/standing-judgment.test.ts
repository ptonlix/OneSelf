import { expect, it } from "vitest";

import { boot, expectError, issueApiKey, jsonHeaders, owner, readJson } from "./support.js";

it("seeds soul and recent and refuses portrait rewrites", async () => {
  const server = await boot();
  const cookie = await owner(server);
  const listed = await readJson(
    await server.request("/pcp/v1/sources", { headers: jsonHeaders({ cookie }) }),
  );
  expect(listed.sources).toEqual([{ id: "self" }]);

  const soul = await readJson(
    await server.request("/pcp/v1/pages/self/soul", { headers: jsonHeaders({ cookie }) }),
  );
  const recent = await readJson(
    await server.request("/pcp/v1/pages/self/recent", { headers: jsonHeaders({ cookie }) }),
  );
  expect(soul.type).toBe("soul");
  expect(soul.visibility).toBe("private");
  expect(String(soul.markdown)).toContain("Observations — 候选观察");
  expect(String(recent.markdown)).toContain("01. Focus — 近期关注");
  expect(recent.frontmatter).toMatchObject({ type: "recent" });

  await expectError(
    await server.request("/pcp/v1/pages/self/soul", {
      method: "DELETE",
      headers: jsonHeaders({ cookie }),
    }),
    400,
    "invalid",
  );
  await expectError(
    await server.request("/pcp/v1/sources/self", {
      method: "DELETE",
      headers: jsonHeaders({ cookie }),
    }),
    400,
    "invalid",
  );
  await expectError(
    await server.request("/pcp/v1/pages/self/recent/timeline", {
      method: "POST",
      headers: jsonHeaders({ cookie }),
      body: JSON.stringify({ date: "2026-11-20", title: "变化" }),
    }),
    400,
    "invalid",
  );
  const reread = await server.request("/pcp/v1/pages/self/recent", {
    headers: jsonHeaders({ cookie }),
  });
  expect(reread.status).toBe(200);

  const before = String(soul.hash);
  await server.runtime.ensureStandingJudgment();
  const kept = await readJson(
    await server.request("/pcp/v1/pages/self/soul", { headers: jsonHeaders({ cookie }) }),
  );
  expect(kept.hash).toBe(before);

  const key = await issueApiKey(server, cookie, {
    label: "restricted",
    unrestricted_data: false,
    sources: [],
  });
  await expectError(
    await server.request("/pcp/v1/pages/self/recent", {
      headers: jsonHeaders({ "x-api-key": key.key }),
    }),
    404,
    "not_found",
  );

  const unrestricted = await issueApiKey(server, cookie, {
    label: "all",
    unrestricted_data: true,
  });
  const who = await readJson(
    await server.request("/pcp/v1/whoami", {
      headers: jsonHeaders({ "x-api-key": unrestricted.key }),
    }),
  );
  expect(who.sources).toEqual([{ id: "self", read: true, write: true, visibility: true }]);

  const reserved = server.runtime.state.sources.find((source) => source.id === "self");
  if (reserved === undefined) {
    throw new Error("self was not ensured");
  }
  reserved.deletedAt = "2026-03-01T00:00:00.000Z";
  await server.runtime.ensureStandingJudgment();
  const hidden = await readJson(
    await server.request("/pcp/v1/sources", { headers: jsonHeaders({ cookie }) }),
  );
  expect(hidden.sources).toEqual([]);
  await expectError(
    await server.request("/pcp/v1/pages/self/recent", { headers: jsonHeaders({ cookie }) }),
    404,
    "not_found",
  );
  await server.close();
});
