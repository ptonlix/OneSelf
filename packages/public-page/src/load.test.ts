import { describe, expect, it } from "vitest";
import { PublicClientFailure } from "@oneself/public-client";
import type {
  PublicClient,
  PublicMedia,
  PublicPage,
  PublicPageSummary,
} from "@oneself/public-client";
import { loadOriginalPage } from "./load";

const profile: PublicPage = {
  source: "life",
  slug: "me",
  type: "profile",
  title: "工程师",
  visibility: "public",
  frontmatter: { name: "张三", files: ["pic", "gone", "note.pdf"] },
  markdown: "---\nname: 张三\n---\n\n做个人工具。",
  hash: "hash-1",
};

const experience: PublicPage = {
  source: "work",
  slug: "acme",
  type: "experience",
  title: "后端工程师",
  visibility: "public",
  frontmatter: { org: "某公司", start: "2020-01" },
  markdown: "做后端",
  hash: "hash-2",
};

function summary(page: PublicPage): PublicPageSummary {
  return { source: page.source, slug: page.slug, type: page.type, title: page.title };
}

function client(pages: readonly PublicPage[]): { client: PublicClient; calls: string[] } {
  const calls: string[] = [];
  const byKey = new Map(pages.map((page) => [`${page.source}/${page.slug}`, page]));
  const publicClient: PublicClient = {
    listSources() {
      calls.push("sources");
      return Promise.resolve([]);
    },
    listPages() {
      calls.push("GET /pcp/v1/public/pages");
      return Promise.resolve(pages.map(summary));
    },
    getPage(source, slug) {
      calls.push(`GET /pcp/v1/public/pages/${source}/${slug}`);
      const found = byKey.get(`${source}/${slug}`);
      if (found === undefined) {
        return Promise.reject(new PublicClientFailure("not_found", "missing", 404));
      }
      return Promise.resolve(found);
    },
    search() {
      calls.push("POST /pcp/v1/public/search");
      return Promise.resolve([]);
    },
    getMedia(id) {
      calls.push(`GET /media/${id}`);
      if (id === "gone") {
        return Promise.reject(new PublicClientFailure("not_found", "missing", 404));
      }
      const media: PublicMedia =
        id === "pic"
          ? { id, mediaType: "image/jpeg", bytes: new Uint8Array([1]) }
          : { id, mediaType: "application/pdf", bytes: new Uint8Array([2]) };
      return Promise.resolve(media);
    },
  };
  return { client: publicClient, calls };
}

describe("loadOriginalPage", () => {
  it("loads bodies from the public single-page read and skips missing media", async () => {
    const fixture = client([profile, experience]);
    const html = await loadOriginalPage(fixture.client, (_bytes, mediaType) => `blob:${mediaType}`);

    expect(html).toContain("做个人工具。");
    expect(html).not.toContain("name: 张三");
    expect(html).toContain("做后端");
    expect(html).toContain('data-field="org">某公司');
    expect(html).toContain('data-field="start">2020-01');
    expect(html).not.toContain('data-field="end"');
    expect(html).toContain('src="blob:image/jpeg"');
    expect(html).toContain("note.pdf");
    expect(html).not.toContain(">gone<");

    expect(fixture.calls).toEqual([
      "GET /pcp/v1/public/pages",
      "GET /pcp/v1/public/pages/life/me",
      "GET /media/pic",
      "GET /media/gone",
      "GET /media/note.pdf",
      "GET /pcp/v1/public/pages/work/acme",
    ]);
    expect(fixture.calls.join("\n")).not.toMatch(
      /facts|timeline|tags|links|\/query|\/pcp\/v1\/files/,
    );
  });

  it("does not read single pages when the public list is empty", async () => {
    const fixture = client([]);
    const html = await loadOriginalPage(fixture.client, () => "blob:unused");
    expect(html).toContain('data-state="empty"');
    expect(fixture.calls).toEqual(["GET /pcp/v1/public/pages"]);
  });

  it("hides a page whose public read is not found", async () => {
    const fixture = client([experience]);
    const listed = fixture.client;
    const html = await loadOriginalPage(
      {
        ...listed,
        listPages: () => Promise.resolve([summary(profile), summary(experience)]),
      },
      () => "blob:unused",
    );
    expect(html).not.toContain("张三");
    expect(html).toContain("后端工程师");
  });
});
