import { expect, it } from "vitest";

import {
  addSource,
  boot,
  expectError,
  issueAccessToken,
  issueApiKey,
  jsonHeaders,
  login,
  mcpToolNames,
  owner,
  putPage,
  readJson,
  uploadPng,
} from "./support.js";

function omitted(body: string, extra = ""): string {
  return `---\ntype: note\ntitle: Note\n${extra}---\n\n${body}\n`;
}

async function setVisibility(
  server: Awaited<ReturnType<typeof boot>>,
  cookie: string,
  source: string,
  slug: string,
  visibility: "public" | "private",
): Promise<Response> {
  return server.request(`/admin/pages/${source}/${slug}/visibility`, {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ visibility }),
  });
}

it("lets the owner publish and hide one page without a new protocol operation", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const uploaded = await uploadPng(server, cookie);
  const source = omitted("上海的正文", `files: [${uploaded.id}]\n`);
  expect((await putPage(server, cookie, "notes", "shanghai", source)).status).toBe(200);
  const before = await readJson(
    await server.request("/pcp/v1/pages/notes/shanghai/versions", { headers: { cookie } }),
  );
  const unchanged = await setVisibility(server, cookie, "notes", "shanghai", "private");
  expect(unchanged.status).toBe(200);
  const still = await readJson(
    await server.request("/pcp/v1/pages/notes/shanghai/versions", { headers: { cookie } }),
  );
  expect(still.versions).toHaveLength(Array.isArray(before.versions) ? before.versions.length : 0);

  const published = await setVisibility(server, cookie, "notes", "shanghai", "public");
  expect(published.status).toBe(200);
  const stored = await readJson(
    await server.request("/pcp/v1/pages/notes/shanghai", { headers: { cookie } }),
  );
  expect(stored.markdown).toContain("visibility: public");
  expect(stored.markdown).toContain("上海的正文");
  expect(String(stored.markdown).endsWith("上海的正文\n")).toBe(true);
  const anon = await server.request("/pcp/v1/public/pages/notes/shanghai");
  expect(anon.status).toBe(200);
  const media = await server.request(`/media/${uploaded.id}`);
  expect(media.status).toBe(200);

  const hidden = await setVisibility(server, cookie, "notes", "shanghai", "private");
  expect(hidden.status).toBe(200);
  await expectError(await server.request("/pcp/v1/public/pages/notes/shanghai"), 404, "not_found");
  await expectError(await server.request(`/media/${uploaded.id}`), 404, "not_found");
  const ownerPage = await server.request("/pcp/v1/pages/notes/shanghai", { headers: { cookie } });
  expect(ownerPage.status).toBe(200);
  const ownerMedia = await server.request(`/media/${uploaded.id}`, { headers: { cookie } });
  expect(ownerMedia.status).toBe(200);

  const key = await issueApiKey(server, cookie, {
    label: "writer",
    unrestricted_data: true,
  });
  const beforeAgent = await readJson(
    await server.request("/pcp/v1/pages/notes/shanghai", { headers: { cookie } }),
  );
  const agent = await server.request("/admin/pages/notes/shanghai/visibility", {
    method: "POST",
    headers: jsonHeaders({ authorization: `ApiKey ${key.key}` }),
    body: JSON.stringify({ visibility: "public" }),
  });
  await expectError(agent, 403, "forbidden");
  const token = await issueAccessToken(server, cookie, { unrestricted_data: true });
  const device = await server.request("/admin/pages/notes/shanghai/visibility", {
    method: "POST",
    headers: jsonHeaders({ authorization: `Bearer ${token}` }),
    body: JSON.stringify({ visibility: "public" }),
  });
  await expectError(device, 403, "forbidden");
  const afterAgent = await readJson(
    await server.request("/pcp/v1/pages/notes/shanghai", { headers: { cookie } }),
  );
  expect(afterAgent.markdown).toBe(beforeAgent.markdown);

  const openapi = await (await server.request("/openapi.json")).text();
  expect(openapi).not.toContain("/admin/pages");
  expect(await mcpToolNames(server)).not.toContain("set_visibility");
  await server.close();
});

it("rejects a visibility change before the owner changes the bootstrap password", async () => {
  const server = await boot();
  const cookie = await login(server);
  const response = await setVisibility(server, cookie, "notes", "shanghai", "public");
  await expectError(response, 403, "password_change_required");
  await server.close();
});

it("rejects a missing page and a bad visibility value", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  await expectError(
    await setVisibility(server, cookie, "notes", "missing", "public"),
    404,
    "not_found",
  );
  const invalid = await server.request("/admin/pages/notes/missing/visibility", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ visibility: "yes" }),
  });
  await expectError(invalid, 400, "invalid");
  await server.close();
});
