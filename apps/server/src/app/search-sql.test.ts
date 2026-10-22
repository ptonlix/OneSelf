import { describe, expect, it } from "vitest";

import type { PageSearch, PostgresHandle, PostgresStore } from "@oneself/adapters";

import { createServer } from "../index.ts";

describe("search", () => {
  it("uses the postgres store instead of an in-memory scan", async () => {
    const calls: unknown[] = [];
    const store = new Proxy({} as PostgresStore, {
      get(_target, prop) {
        if (prop === "transaction") {
          return (run: (inner: PostgresStore) => Promise<unknown>) => run(store);
        }
        if (prop === "searchPages") {
          return (query: unknown) => {
            calls.push(query);
            return Promise.resolve([
              {
                source: "notes",
                slug: "from-sql",
                type: "note",
                title: "From SQL",
                visibility: "private",
                frontmatter: { title: "From SQL" },
                body: "sql-token",
                content_hash: "ab".repeat(32),
                object_key: "pages/notes/from-sql/hash.md",
                updated_at: new Date("2026-10-20T00:00:00.000Z"),
                deleted_at: null,
                hidden_by_source: false,
              },
            ]);
          };
        }
        if (prop === "findOwner" || prop === "findSitePointer") {
          return () => Promise.resolve(null);
        }
        if (String(prop).startsWith("list") || String(prop).startsWith("find")) {
          return () => Promise.resolve([]);
        }
        return () => Promise.resolve(undefined);
      },
    });
    const postgres: PostgresHandle = { store, close: () => Promise.resolve() };
    const server = await createServer({
      publicOrigin: "http://127.0.0.1:3000",
      ownerLogin: "owner",
      ownerPassword: "initial-password",
      postgres,
    });
    const cookie = await ownerCookie(server);
    const response = await server.request("/pcp/v1/search", {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ q: "sql-token" }),
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ source: "notes", slug: "from-sql", snippet: "sql-token" }),
    ]);
    expect(calls).toHaveLength(1);
    await server.close();
  });

  it("keeps a postgres hit whose only match is type", async () => {
    const postgres = postgresHandle(() =>
      Promise.resolve([pageRow("notes", "ledger", "private", "ledger", "ordinary prose")]),
    );
    const server = await createServer({
      publicOrigin: "http://127.0.0.1:3000",
      ownerLogin: "owner",
      ownerPassword: "initial-password",
      postgres,
    });
    const cookie = await ownerCookie(server);
    const response = await server.request("/pcp/v1/search", {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ q: "ledger" }),
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({
        source: "notes",
        slug: "ledger",
        type: "ledger",
        snippet: "ledger",
      }),
    ]);
    await server.close();
  });

  it("sends readable source ids and public visibility to postgres", async () => {
    const calls: PageSearch[] = [];
    const postgres = postgresHandle((query) => {
      calls.push(query);
      return Promise.resolve(filterPages(query));
    });
    const server = await createServer({
      publicOrigin: "http://127.0.0.1:3000",
      ownerLogin: "owner",
      ownerPassword: "initial-password",
      postgres,
    });
    const cookie = await ownerCookie(server);
    const notesKey = await issueKey(server, cookie, "notes-only", [
      { id: "notes", read: true, write: false, visibility: false },
      { id: "secrets", read: false, write: false, visibility: false },
    ]);
    const emptyKey = await issueKey(server, cookie, "empty", []);

    const restricted = await search(server, { authorization: `ApiKey ${notesKey}` });
    expect(restricted.status, await restricted.clone().text()).toBe(200);
    expect(await restricted.json()).toEqual([
      expect.objectContaining({ source: "notes", slug: "readable" }),
    ]);
    expect(calls[0]?.source_ids).toEqual(["notes"]);

    const empty = await search(server, { authorization: `ApiKey ${emptyKey}` });
    expect(empty.status, await empty.clone().text()).toBe(200);
    expect(await empty.json()).toEqual([]);
    expect(calls[1]?.source_ids).toEqual([]);

    const pub = await server.request("/pcp/v1/public/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: "shared-token" }),
    });
    expect(pub.status, await pub.clone().text()).toBe(200);
    expect(await pub.json()).toEqual([
      expect.objectContaining({ source: "publics", slug: "open" }),
    ]);
    expect(calls[2]?.visibility).toBe("public");
    expect(calls[2]?.source_ids ?? []).not.toContain("secrets");
    expect(calls[2]?.source_ids ?? []).not.toContain("notes");
    await server.close();
  });
});

async function ownerCookie(server: {
  request: (input: string, init?: RequestInit) => Promise<Response>;
}): Promise<string> {
  const headers = {
    origin: "http://127.0.0.1:3000",
    "content-type": "application/json",
  };
  const login = await server.request("/admin/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ login: "owner", password: "initial-password" }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  await server.request("/admin/password", {
    method: "POST",
    headers: { ...headers, cookie },
    body: JSON.stringify({ password: "new-password" }),
  });
  return cookie;
}

type Server = {
  request: (input: string, init?: RequestInit) => Promise<Response>;
};

type Grant = {
  id: string;
  read: boolean;
  write: boolean;
  visibility: boolean;
};

function postgresHandle(searchPages: PostgresStore["searchPages"]): PostgresHandle {
  const store = new Proxy({} as PostgresStore, {
    get(_target, prop) {
      if (prop === "transaction") {
        return (run: (inner: PostgresStore) => Promise<unknown>) => run(store);
      }
      if (prop === "searchPages") {
        return searchPages;
      }
      if (prop === "findOwner" || prop === "findSitePointer") {
        return () => Promise.resolve(null);
      }
      if (String(prop).startsWith("list") || String(prop).startsWith("find")) {
        return () => Promise.resolve([]);
      }
      return () => Promise.resolve(undefined);
    },
  });
  return { store, close: () => Promise.resolve() };
}

function pageRow(
  source: string,
  slug: string,
  visibility: string,
  type = "note",
  body = "shared-token",
) {
  return {
    source,
    slug,
    type,
    title: "Hidden",
    visibility,
    frontmatter: { title: "Hidden" },
    body,
    content_hash: "ab".repeat(32),
    object_key: `pages/${source}/${slug}/${"ab".repeat(32)}.md`,
    updated_at: new Date("2026-10-20T00:00:00.000Z"),
    deleted_at: null,
    hidden_by_source: false,
  };
}

const CATALOG = [
  pageRow("notes", "readable", "private"),
  pageRow("secrets", "hidden", "private"),
  pageRow("publics", "open", "public"),
];

function filterPages(query: PageSearch) {
  if (query.source_ids !== undefined && query.source_ids.length === 0) {
    return [];
  }
  return CATALOG.filter((page) => {
    if (query.visibility !== undefined && page.visibility !== query.visibility) {
      return false;
    }
    if (query.source_ids !== undefined && !query.source_ids.includes(page.source)) {
      return false;
    }
    return (
      page.type.includes(query.text) ||
      page.title.includes(query.text) ||
      page.body.includes(query.text)
    );
  });
}

function search(server: Server, headers: Record<string, string>): Promise<Response> {
  return server.request("/pcp/v1/search", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ q: "shared-token" }),
  });
}

async function issueKey(
  server: Server,
  cookie: string,
  label: string,
  sources: Grant[],
): Promise<string> {
  const headers = {
    origin: "http://127.0.0.1:3000",
    "content-type": "application/json",
    cookie,
  };
  const pending = await server.request("/pcp/v1/api-keys", {
    method: "POST",
    headers,
    body: JSON.stringify({
      label,
      unrestricted_data: false,
      site_write: false,
      sources,
    }),
  });
  expect(pending.status, await pending.clone().text()).toBe(200);
  const created = (await pending.json()) as { id?: unknown };
  expect(typeof created.id).toBe("string");
  const approved = await server.request(`/admin/api-keys/${String(created.id)}/approve`, {
    method: "POST",
    headers,
    body: "{}",
  });
  expect(approved.status, await approved.clone().text()).toBe(200);
  const revealed = (await approved.json()) as { key?: unknown };
  expect(typeof revealed.key).toBe("string");
  return String(revealed.key);
}
