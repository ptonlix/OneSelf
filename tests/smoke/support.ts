import { expect } from "vitest";

import { createServer, type ServerHandle } from "../../apps/server/src/index.js";

export const ORIGIN = "http://127.0.0.1:3000";

export function markdown(body: string, extra = ""): string {
  return `---\ntype: note\ntitle: Note\nvisibility: private\n${extra}---\n\n${body}\n`;
}

export async function boot(
  options: Parameters<typeof createServer>[0] = {},
): Promise<ServerHandle> {
  return createServer({
    publicOrigin: ORIGIN,
    ownerLogin: "owner",
    ownerPassword: "initial-password",
    ...options,
  });
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

export function jsonHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    origin: ORIGIN,
    "content-type": "application/json",
    ...extra,
  });
}

export async function login(server: ServerHandle, password = "initial-password"): Promise<string> {
  const response = await server.request("/admin/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ login: "owner", password }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie") ?? "";
  expect(cookie.startsWith("oneself_session=")).toBe(true);
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("SameSite=Lax");
  return cookie.split(";")[0] ?? "";
}

export async function changePassword(server: ServerHandle, cookie: string): Promise<void> {
  const response = await server.request("/admin/password", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ password: "new-password" }),
  });
  expect(response.status).toBe(200);
  expect(await readJson(response)).toEqual({ must_change_password: false });
}

export async function owner(server: ServerHandle): Promise<string> {
  const cookie = await login(server);
  await changePassword(server, cookie);
  return cookie;
}

export async function addSource(server: ServerHandle, cookie: string, id: string): Promise<void> {
  const response = await server.request("/pcp/v1/sources", {
    method: "POST",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify({ id }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
}

export async function putPage(
  server: ServerHandle,
  cookie: string,
  source: string,
  slug: string,
  body: string,
  hash?: string,
): Promise<Response> {
  return server.request(`/pcp/v1/pages/${source}/${slug}`, {
    method: "PUT",
    headers: jsonHeaders({ cookie }),
    body: JSON.stringify(hash === undefined ? { markdown: body } : { markdown: body, hash }),
  });
}

export async function uploadPng(server: ServerHandle, cookie: string): Promise<{ id: string }> {
  const body = new FormData();
  body.set("file", new File([new Uint8Array([137, 80, 78, 71])], "a.png", { type: "image/png" }));
  const response = await server.request("/pcp/v1/files", {
    method: "POST",
    headers: { cookie },
    body,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as { id: string };
}

export async function uploadArchive(
  server: ServerHandle,
  cookie: string,
  bytes: Uint8Array,
): Promise<Response> {
  const form = new FormData();
  form.set("archive", new File([bytes], "site.zip", { type: "application/zip" }));
  return server.request("/pcp/v1/site/releases", {
    method: "POST",
    headers: { cookie, origin: ORIGIN },
    body: form,
  });
}

export async function mcpToolNames(server: ServerHandle): Promise<string[]> {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const init = await server.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    }),
  });
  expect(init.status, await init.clone().text()).toBe(200);
  const listed = await server.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  const body = (await listed.json()) as { result?: { tools?: { name: string }[] } };
  return (body.result?.tools ?? []).map((tool) => tool.name);
}

export async function mcpCall(
  server: ServerHandle,
  name: string,
  args: Record<string, unknown>,
  extra: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const response = await server.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extra,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = (await response.json()) as {
    result?: { content?: { text?: string }[]; isError?: boolean };
    error?: { message?: string };
  };
  const text = body.result?.content?.[0]?.text ?? body.error?.message ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}
