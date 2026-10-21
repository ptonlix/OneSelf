import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createPublicClient, PublicClientFailure } from "./client";
import type { PublicFetch, PublicSearchQuery } from "./client";

const baseUrl = "https://oneself.test";

type Call = {
  readonly url: string;
  readonly init: RequestInit;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientFor(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl: PublicFetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { client: createPublicClient({ fetch: fetchImpl, baseUrl }), calls };
}

function expectAnonymous(init: RequestInit): void {
  expect(init.credentials).toBe("omit");
  expect(init.cache).toBe("no-store");
  const headers = new Headers(init.headers);
  expect(headers.get("authorization")).toBeNull();
  expect(headers.get("cookie")).toBeNull();
  expect(headers.get("x-api-key")).toBeNull();
}

const page = {
  source: "life",
  slug: "me",
  type: "profile",
  title: "工程师",
  visibility: "public",
  frontmatter: { name: "张三", title: "工程师" },
  markdown: "---\ntitle: 工程师\n---\n\n正文",
  hash: "abc",
  tags: ["should-not-leak"],
};

describe("createPublicClient", () => {
  it("requests every public PCP route with credentials omit", async () => {
    const { client, calls } = clientFor(async (url, init) => {
      const pathName = new URL(url).pathname;
      if (pathName === "/pcp/v1/public/sources") {
        return jsonResponse([{ id: "life" }]);
      }
      if (pathName === "/pcp/v1/public/pages") {
        return jsonResponse([
          { source: "life", slug: "me", type: "profile", title: "工程师", markdown: "nope" },
        ]);
      }
      if (pathName === "/pcp/v1/public/pages/life/me") {
        return jsonResponse(page);
      }
      if (pathName === "/pcp/v1/public/search") {
        expect(init.method).toBe("POST");
        expect(await new Request("https://oneself.test", init).json()).toEqual({ q: "上海" });
        return jsonResponse([
          {
            source: "life",
            slug: "me",
            type: "profile",
            title: "工程师",
            snippet: "上海",
            body: "全文",
          },
        ]);
      }
      if (pathName === "/media/file_1") {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png; charset=binary" },
        });
      }
      return jsonResponse({ error: "not_found", message: "missing" }, 404);
    });

    expect(await client.listSources()).toEqual([{ id: "life" }]);
    expect(await client.listPages()).toEqual([
      { source: "life", slug: "me", type: "profile", title: "工程师" },
    ]);
    const read = await client.getPage("life", "me");
    expect(read.visibility).toBe("public");
    expect(read.markdown).toBe(page.markdown);
    expect(read.hash).toBe("abc");
    expect("tags" in read).toBe(false);
    expect(await client.search({ q: "上海" })).toEqual([
      { source: "life", slug: "me", type: "profile", title: "工程师", snippet: "上海" },
    ]);
    const media = await client.getMedia("file_1");
    expect(media.mediaType).toBe("image/png");
    expect(Array.from(media.bytes)).toEqual([1, 2, 3]);

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/pcp/v1/public/sources",
      "/pcp/v1/public/pages",
      "/pcp/v1/public/pages/life/me",
      "/pcp/v1/public/search",
      "/media/file_1",
    ]);
    for (const call of calls) {
      expectAnonymous(call.init);
    }
  });

  it("rejects a wrapped page list instead of guessing a key", async () => {
    const { client } = clientFor(() =>
      jsonResponse({ pages: [{ source: "life", slug: "me", type: "profile", title: "工程师" }] }),
    );
    await expect(client.listPages()).rejects.toMatchObject({ error: "invalid" });
  });

  it("treats a non-public single read as not found", async () => {
    const { client } = clientFor(() =>
      jsonResponse({ ...page, visibility: "private", markdown: "秘密" }),
    );
    await expect(client.getPage("life", "me")).rejects.toMatchObject({
      error: "not_found",
      status: 404,
    });
  });

  it("encodes path segments and refuses a slash", async () => {
    const { client, calls } = clientFor(() => jsonResponse(page));
    await client.getPage("life", "note-1");
    expect(calls[0]?.url).toBe("https://oneself.test/pcp/v1/public/pages/life/note-1");
    await expect(client.getPage("life", "a/b")).rejects.toBeInstanceOf(PublicClientFailure);
    expect(calls).toHaveLength(1);
  });

  it("sends only the documented search fields and enforces the limit", async () => {
    const { client, calls } = clientFor(async (_url, init) => {
      const body = (await new Request("https://oneself.test", init).json()) as PublicSearchQuery;
      return jsonResponse([
        {
          source: "life",
          slug: "me",
          type: "profile",
          title: "工程师",
          snippet: "x".repeat(body.limit ?? 1),
        },
      ]);
    });

    await client.search({ q: "工具", source: "life", limit: 50, cursor: "cur_1" });
    const sent = await new Request("https://oneself.test", calls[0]?.init).json();
    expect(sent).toEqual({ q: "工具", source: "life", limit: 50, cursor: "cur_1" });
    expect(calls[0]?.init.credentials).toBe("omit");

    await expect(client.search({ q: "工具", limit: 51 })).rejects.toMatchObject({
      error: "invalid",
    });
    expect(calls).toHaveLength(1);
  });

  it("rejects a search snippet longer than 140 characters", async () => {
    const { client } = clientFor(() =>
      jsonResponse([
        { source: "life", slug: "me", type: "profile", title: "工程师", snippet: "x".repeat(141) },
      ]),
    );
    await expect(client.search({ q: "工具" })).rejects.toMatchObject({ error: "invalid" });
  });

  it("returns the documented error code without sending credentials", async () => {
    const { client, calls } = clientFor(() =>
      jsonResponse({ error: "not_found", message: "missing" }, 404),
    );
    await expect(client.getPage("life", "missing")).rejects.toMatchObject({
      name: "PublicClientFailure",
      error: "not_found",
      message: "missing",
      status: 404,
    });
    expect(calls[0]?.init.credentials).toBe("omit");
  });

  it("does not reference domain or db", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const sources = walk(root).filter((file) => file.endsWith(".ts") || file.endsWith(".json"));
    const forbidden = /@oneself\/(domain|db|adapters)|packages\/(domain|db|adapters)/;
    for (const file of sources) {
      expect(readFileSync(file, "utf8")).not.toMatch(forbidden);
    }
  });
});

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}
