import { expect, it } from "vitest";

import {
  addSource,
  boot,
  jsonHeaders,
  markdown,
  mcpCall,
  mcpToolNames,
  ORIGIN,
  owner,
  putPage,
  readJson,
} from "./support.js";

it("omits key tools from MCP and ignores a spoofed forwarding header", async () => {
  const server = await boot();
  const cookie = await owner(server);
  await addSource(server, cookie, "notes");
  const page = markdown("same");
  const http = await putPage(server, cookie, "notes", "shared", page);
  const httpBody = await readJson(http);
  const mcp = await mcpCall(
    server,
    "put_page",
    { source: "notes", slug: "shared", markdown: page },
    { cookie },
  );
  expect(mcp.error).toBeUndefined();
  expect(mcp.hash).toBe(httpBody.hash);

  const anonymous = await mcpCall(server, "put_page", {
    source: "notes",
    slug: "other",
    markdown: page,
  });
  expect(anonymous.error).toBe("unauthorized");
  const names = await mcpToolNames(server);
  expect(names).not.toContain("create_api_key");
  expect(names).not.toContain("list_api_keys");
  expect(names).not.toContain("revoke_api_key");
  expect(names).toContain("put_page");

  const discovery = await readJson(
    await server.request("/.well-known/pcp", { headers: { host: "evil.example" } }),
  );
  expect(discovery.openapi).toBe(`${ORIGIN}/openapi.json`);
  expect(JSON.stringify(discovery.operations)).not.toContain("create_api_key");
  const skill = await (await server.request("/skills/data.md")).text();
  const apiSkill = await (await server.request("/pcp/v1/skills/data")).text();
  expect(skill).toBe(apiSkill);
  expect((await server.request("/skills/data.md")).headers.get("cache-control")).toBe("no-store");

  for (let index = 0; index < 9; index += 1) {
    const response = await server.request("/admin/login", {
      method: "POST",
      headers: jsonHeaders({ "x-forwarded-for": `203.0.113.${String(index)}` }),
      body: JSON.stringify({ login: "owner", password: "wrong" }),
    });
    expect(response.status).toBe(401);
  }
  const limited = await server.request("/admin/login", {
    method: "POST",
    headers: jsonHeaders({ "x-forwarded-for": "198.51.100.9" }),
    body: JSON.stringify({ login: "owner", password: "wrong" }),
  });
  expect(limited.status).toBe(429);
  await server.close();
});
