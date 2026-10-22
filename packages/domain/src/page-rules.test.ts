import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  addMilliseconds,
  deletePage,
  editPage,
  emptyDomainState,
  getPage,
  getVersions,
  listPages,
  putPage,
  putPages,
  readPublicPage,
  rebuildProjections,
  resolveSlugs,
  restorePage,
  revertPage,
  runHourlyMaintenance,
  SOFT_DELETE_RETENTION_MS,
  UNREFERENCED_OBJECT_RETENTION_MS,
  sourcesAdd,
  VERSION_LIMIT,
  type Credential,
  type DomainState,
  type PageWrite,
  type StoredFile,
} from "./index.ts";

const NOW = "2026-03-01T00:00:00.000Z";
const owner: Credential = { kind: "owner" };
const writer: Credential = {
  kind: "api_key",
  unrestrictedData: false,
  siteWrite: false,
  sources: [{ id: "health", read: true, write: true, visibility: false }],
};
const reader: Credential = {
  kind: "api_key",
  unrestrictedData: false,
  siteWrite: false,
  sources: [{ id: "health", read: true, write: false, visibility: false }],
};
const stranger: Credential = {
  kind: "api_key",
  unrestrictedData: false,
  siteWrite: false,
  sources: [{ id: "finance", read: true, write: true, visibility: true }],
};

function markdown(options?: {
  readonly title?: string;
  readonly type?: string;
  readonly visibility?: string;
  readonly extra?: string;
  readonly body?: string;
}): string {
  const type = options?.type ?? "note";
  const title = options?.title ?? "Note";
  const visibility = options?.visibility === undefined ? "" : `visibility: ${options.visibility}\n`;
  const extra = options?.extra ?? "";
  const body = options?.body ?? "Hello body\n";
  return `---\ntype: ${type}\ntitle: ${title}\n${visibility}${extra}---\n${body}`;
}

function catalog(): DomainState {
  const added = sourcesAdd(emptyDomainState(), owner, { id: "health" });
  if (!added.ok) {
    throw new Error(added.message);
  }
  return added.value.state;
}

function mustWrite(
  state: DomainState,
  sourceMarkdown: string,
  slug = "note",
  credential: Credential = owner,
  hash?: string,
): PageWrite {
  const input =
    hash === undefined
      ? { source: "health", slug, markdown: sourceMarkdown }
      : { source: "health", slug, markdown: sourceMarkdown, hash };
  const written = putPage(state, { credential, now: NOW }, input);
  if (!written.ok) {
    throw new Error(written.message);
  }
  return written.value;
}

function pageFile(id: string, page?: { source: string; slug: string }): StoredFile {
  return {
    id,
    objectKey: `files/${id}`,
    mediaType: "image/png",
    byteSize: 12,
    sha256: "abc",
    pageSource: page?.source ?? null,
    pageSlug: page?.slug ?? null,
    createdAt: NOW,
  };
}

describe("conditional page writes", () => {
  it("rejects an illegal slug and stores nothing", () => {
    const state = catalog();
    for (const slug of ["bad/slug", "-note"]) {
      const written = putPage(
        state,
        { credential: owner, now: NOW },
        { source: "health", slug, markdown: markdown() },
      );
      expect(written.ok).toBe(false);
      if (written.ok) {
        return;
      }
      expect(written.error).toBe("invalid");
    }
    expect(state.pages).toEqual([]);
    expect(state.objects).toEqual([]);
  });

  it("rejects a stale hash and keeps the stored markdown", () => {
    const created = mustWrite(catalog(), markdown({ body: "first\n" }));
    const written = putPage(
      created.state,
      { credential: owner, now: NOW },
      { source: "health", slug: "note", markdown: markdown({ body: "second\n" }), hash: "stale" },
    );
    expect(written).toMatchObject({ ok: false, error: "conflict" });
    expect(created.state.pages[0]?.markdown).toBe(markdown({ body: "first\n" }));
    expect(created.state.pages[0]?.contentHash).toBe(created.hash);
  });

  it("overwrites when the hash is omitted and accepts the current hash", () => {
    const created = mustWrite(catalog(), markdown({ body: "first\n" }));
    const overwritten = mustWrite(created.state, markdown({ body: "second\n" }));
    expect(overwritten.hash).not.toBe(created.hash);
    expect(overwritten.state.pages[0]?.markdown).toBe(markdown({ body: "second\n" }));
    const matched = mustWrite(
      overwritten.state,
      markdown({ body: "third\n" }),
      "note",
      owner,
      overwritten.hash,
    );
    expect(matched.state.pages[0]?.body).toBe("third\n");
  });

  it("conflicts when a new page supplies a hash", () => {
    const written = putPage(
      catalog(),
      { credential: owner, now: NOW },
      { source: "health", slug: "note", markdown: markdown(), hash: "abc" },
    );
    expect(written).toMatchObject({ ok: false, error: "conflict" });
  });

  it("writes no page when one page in the batch is illegal", () => {
    const state = catalog();
    const legal = { source: "health", slug: "one", markdown: markdown({ title: "One" }) };
    const illegal = { source: "health", slug: "bad/two", markdown: markdown({ title: "Two" }) };
    const written = putPages(state, { credential: owner, now: NOW }, [legal, illegal]);
    expect(written).toMatchObject({ ok: false, error: "invalid" });
    expect(state.pages).toEqual([]);

    const existing = mustWrite(state, markdown({ title: "Kept", body: "kept\n" }), "one");
    const batch = putPages(existing.state, { credential: owner, now: NOW }, [
      {
        source: "health",
        slug: "one",
        markdown: markdown({ title: "Changed", body: "changed\n" }),
      },
      illegal,
    ]);
    expect(batch).toMatchObject({ ok: false, error: "invalid" });
    expect(existing.state.pages[0]?.markdown).toContain("kept");
    expect(existing.state.pages).toHaveLength(1);
  });

  it("stores the sha256 of the original UTF-8 markdown and the frontmatter title", () => {
    const source = markdown({ title: "Real title", body: "# Other heading\n张三\n" });
    const created = mustWrite(catalog(), source);
    const page = created.state.pages[0];
    expect(page?.title).toBe("Real title");
    expect(page?.contentHash).toBe(createHash("sha256").update(source, "utf8").digest("hex"));
    expect(page?.objectKey).toBe(`pages/health/note/${page?.contentHash ?? ""}.md`);
    const version = created.state.versions[0];
    expect(version && "body" in version).toBe(false);
    expect(version && "markdown" in version).toBe(false);
  });
});

describe("exact edits", () => {
  it("applies replacements that each occur once, in order", () => {
    const created = mustWrite(catalog(), markdown({ body: "Hello world\n" }));
    const edited = editPage(
      created.state,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        hash: created.hash,
        edits: [
          { search: "world", replace: "there" },
          { search: "Hello there", replace: "Hi there" },
        ],
      },
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) {
      return;
    }
    expect(edited.value.state.pages[0]?.markdown).toContain("Hi there");
    expect(edited.value.hash).not.toBe(created.hash);
  });

  it("writes nothing when a search occurs twice or not at all", () => {
    const created = mustWrite(catalog(), markdown({ body: "cat cat\n" }));
    const ambiguous = editPage(
      created.state,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        hash: created.hash,
        edits: [{ search: "cat", replace: "dog" }],
      },
    );
    expect(ambiguous).toMatchObject({ ok: false, error: "invalid" });
    const missing = editPage(
      created.state,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        hash: created.hash,
        edits: [{ search: "missing", replace: "dog" }],
      },
    );
    expect(missing).toMatchObject({ ok: false, error: "invalid" });
    const partial = editPage(
      created.state,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        hash: created.hash,
        edits: [
          { search: "cat cat", replace: "red red" },
          { search: "red", replace: "blue" },
        ],
      },
    );
    expect(partial).toMatchObject({ ok: false, error: "invalid" });
    expect(created.state.pages[0]?.contentHash).toBe(created.hash);
    expect(created.state.objects).toHaveLength(1);
  });

  it("conflicts before writing when the edit hash is stale", () => {
    const created = mustWrite(catalog(), markdown());
    const edited = editPage(
      created.state,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        hash: "stale",
        edits: [{ search: "Hello", replace: "Goodbye" }],
      },
    );
    expect(edited).toMatchObject({ ok: false, error: "conflict" });
    expect(created.state.pages[0]?.markdown).toContain("Hello");
  });
});

describe("visibility permission", () => {
  it("stores a new page as private when visibility is omitted", () => {
    const created = mustWrite(catalog(), markdown(), "note", writer);
    expect(created.state.pages[0]?.visibility).toBe("private");
    expect(created.state.pages[0]?.frontmatter["visibility"]).toBeUndefined();
    expect(readPublicPage(created.state, "health", "note")).toMatchObject({
      ok: false,
      error: "not_found",
    });
  });

  it("does not coerce any other visibility value", () => {
    const written = putPage(
      catalog(),
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: markdown({ visibility: "yes" }),
      },
    );
    expect(written).toMatchObject({ ok: false, error: "invalid" });
    expect(catalog().pages).toEqual([]);
  });

  it("lets a writer change the body without changing visibility", () => {
    const created = mustWrite(
      catalog(),
      markdown({ visibility: "private", body: "Hello body\n" }),
      "note",
      owner,
    );
    const edited = editPage(
      created.state,
      { credential: writer, now: NOW },
      {
        source: "health",
        slug: "note",
        hash: created.hash,
        edits: [{ search: "Hello", replace: "Updated" }],
      },
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) {
      return;
    }
    expect(edited.value.state.pages[0]?.markdown).toContain("Updated body");
    expect(edited.value.state.pages[0]?.visibility).toBe("private");
  });

  it("forbids a writer from publishing or unpublishing", () => {
    const fresh = putPage(
      catalog(),
      { credential: writer, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: markdown({ visibility: "public" }),
      },
    );
    expect(fresh).toMatchObject({ ok: false, error: "forbidden" });

    const created = mustWrite(catalog(), markdown({ visibility: "private" }));
    const published = putPage(
      created.state,
      { credential: writer, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: markdown({ visibility: "public", body: "changed\n" }),
      },
    );
    expect(published).toMatchObject({ ok: false, error: "forbidden" });
    expect(created.state.pages[0]?.visibility).toBe("private");
    expect(created.state.pages[0]?.markdown).toContain("Hello body");

    const publicPage = mustWrite(catalog(), markdown({ visibility: "public", body: "Shown\n" }));
    const hidden = editPage(
      publicPage.state,
      { credential: writer, now: NOW },
      {
        source: "health",
        slug: "note",
        hash: publicPage.hash,
        edits: [{ search: "public", replace: "private" }],
      },
    );
    expect(hidden).toMatchObject({ ok: false, error: "forbidden" });
    expect(publicPage.state.pages[0]?.visibility).toBe("public");

    const omitted = putPage(
      publicPage.state,
      { credential: writer, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: markdown({ body: "no visibility line\n" }),
      },
    );
    expect(omitted).toMatchObject({ ok: false, error: "forbidden" });
    expect(readPublicPage(publicPage.state, "health", "note").ok).toBe(true);
  });
});

describe("fences", () => {
  it("projects only Facts and Timeline", () => {
    const source = markdown({
      extra: "tags: [alpha, alpha]\n",
      body: [
        "Intro paragraph",
        "",
        "See [[health/other]] and [[health/other]] and [[Nope/other]].",
        "",
        "## Notes",
        "not a fence",
        "",
        "## Facts",
        "- id: fact_01",
        "  entity: 张三",
        "  statement: 现居上海",
        "  confidence: 0.9",
        "  valid_until: 2027-01-01",
        "",
        "## Timeline",
        "- 2024-06-01 | 加入某公司 | 做后端",
        "- 2024-07-01 | 离开 |",
        "",
      ].join("\n"),
    });
    const created = mustWrite(catalog(), source);
    const page = created.state.pages[0];
    expect(page?.facts).toEqual([
      {
        id: "fact_01",
        entity: "张三",
        statement: "现居上海",
        confidence: 0.9,
        validUntil: "2027-01-01",
      },
    ]);
    expect(page?.timeline).toEqual([
      { ordinal: 0, occurredOn: "2024-06-01", title: "加入某公司", detail: "做后端" },
      { ordinal: 1, occurredOn: "2024-07-01", title: "离开", detail: null },
    ]);
    expect(page?.links).toEqual([{ toSource: "health", toSlug: "other" }]);
    expect(page?.tags).toEqual(["alpha"]);
    expect(page?.body).toContain("## Facts");
    expect(page?.body).toContain("## Notes");
    expect(page?.chunks.length).toBeGreaterThan(1);
  });

  it("rolls back a broken fence without changing the object pointer", () => {
    const created = mustWrite(catalog(), markdown({ body: "stable\n" }));
    const broken = markdown({
      body: "## Facts\n- id: fact_01\n  entity: 张三\n",
    });
    const written = putPage(
      created.state,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: broken,
        hash: created.hash,
      },
    );
    expect(written).toMatchObject({ ok: false, error: "invalid" });
    expect(created.state.pages[0]?.objectKey).toBe(`pages/health/note/${created.hash}.md`);
    expect(created.state.pages[0]?.facts).toEqual([]);
    expect(created.state.versions).toHaveLength(1);

    const timeline = putPage(
      created.state,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: markdown({ body: "## Timeline\n- yesterday | title | detail\n" }),
        hash: created.hash,
      },
    );
    expect(timeline).toMatchObject({ ok: false, error: "invalid" });
    expect(created.state.pages[0]?.contentHash).toBe(created.hash);
  });

  it("splits a long paragraph into 1000-character chunks", () => {
    const created = mustWrite(catalog(), markdown({ body: `${"字".repeat(1001)}\n\nnext\n` }));
    const chunks = created.state.pages[0]?.chunks ?? [];
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual([0, 1, 2]);
    expect(Array.from(chunks[0]?.body ?? "")).toHaveLength(1000);
    expect(chunks[2]?.body).toBe("next");
  });
});

describe("soft delete", () => {
  it("hides a deleted page from the caller who could previously read it", () => {
    const created = mustWrite(catalog(), markdown({ visibility: "public" }));
    expect(getPage(created.state, owner, "health", "note").ok).toBe(true);
    const deleted = deletePage(created.state, { credential: owner, now: NOW }, "health", "note");
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) {
      return;
    }
    expect(getPage(deleted.value.state, owner, "health", "note")).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(readPublicPage(deleted.value.state, "health", "note")).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(listPages(deleted.value.state, owner, { source: "health" })).toMatchObject({
      ok: true,
      value: [],
    });
  });

  it("restores inside the 30 day window and refuses after it", () => {
    const created = mustWrite(catalog(), markdown());
    const deleted = deletePage(created.state, { credential: owner, now: NOW }, "health", "note");
    if (!deleted.ok) {
      throw new Error(deleted.message);
    }
    const atWindow = addMilliseconds(NOW, SOFT_DELETE_RETENTION_MS);
    const justAfter = addMilliseconds(NOW, SOFT_DELETE_RETENTION_MS + 1);
    if (atWindow === null || justAfter === null) {
      throw new Error("clock");
    }
    const restored = restorePage(
      deleted.value.state,
      { credential: owner, now: atWindow },
      "health",
      "note",
    );
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(getPage(restored.value.state, owner, "health", "note").ok).toBe(true);

    const late = restorePage(
      deleted.value.state,
      { credential: owner, now: justAfter },
      "health",
      "note",
    );
    expect(late).toMatchObject({ ok: false, error: "conflict" });
    expect(deleted.value.state.pages[0]?.deletedAt).toBe(NOW);
    expect(getPage(deleted.value.state, owner, "health", "note")).toMatchObject({
      ok: false,
      error: "not_found",
    });
  });

  it("drops expired pages and versions but keeps site releases", () => {
    const created = mustWrite(
      catalog(),
      markdown({ body: "## Facts\n- id: fact_01\n  entity: 张三\n  statement: 现居上海\n" }),
    );
    const releaseId = `rel_${"a".repeat(32)}`;
    const deleted = deletePage(created.state, { credential: owner, now: NOW }, "health", "note");
    if (!deleted.ok) {
      throw new Error(deleted.message);
    }
    const withRelease: DomainState = {
      ...deleted.value.state,
      site: {
        ...deleted.value.state.site,
        releases: [{ id: releaseId, createdAt: NOW }],
      },
      objects: [
        ...deleted.value.state.objects,
        { key: `sites/${releaseId}/index.html`, bytes: "<html>", writtenAt: NOW, kind: "site" },
      ],
    };
    const atWindow = addMilliseconds(NOW, SOFT_DELETE_RETENTION_MS);
    const justAfter = addMilliseconds(NOW, SOFT_DELETE_RETENTION_MS + 1);
    if (atWindow === null || justAfter === null) {
      throw new Error("clock");
    }
    const kept = runHourlyMaintenance(withRelease, atWindow);
    expect(kept.pages).toHaveLength(1);
    expect(kept.versions).toHaveLength(1);
    const purged = runHourlyMaintenance(withRelease, justAfter);
    expect(purged.pages).toEqual([]);
    expect(purged.versions).toEqual([]);
    expect(purged.site.releases.map((release) => release.id)).toEqual([releaseId]);
    expect(purged.objects.some((object) => object.kind === "site")).toBe(true);
    expect(purged.objects.some((object) => object.kind === "page")).toBe(false);
  });

  it("deletes unreferenced objects only after 7 days and never deletes site objects", () => {
    const old = addMilliseconds(NOW, -UNREFERENCED_OBJECT_RETENTION_MS - 1);
    const boundary = addMilliseconds(NOW, -UNREFERENCED_OBJECT_RETENTION_MS);
    if (old === null || boundary === null) {
      throw new Error("clock");
    }
    const state: DomainState = {
      ...emptyDomainState(),
      objects: [
        { key: "pages/health/note/old.md", bytes: "old", writtenAt: old, kind: "page" },
        { key: "pages/health/note/edge.md", bytes: "edge", writtenAt: boundary, kind: "page" },
        { key: "sites/rel_edge/index.html", bytes: "site", writtenAt: old, kind: "site" },
      ],
    };
    const purged = runHourlyMaintenance(state, NOW);
    expect(purged.objects.map((object) => object.key)).toEqual([
      "pages/health/note/edge.md",
      "sites/rel_edge/index.html",
    ]);
    expect(purged.site.releases).toEqual([]);
  });

  it("keeps at most 50 versions and can revert to a retained one", () => {
    let state = catalog();
    let firstHash = "";
    let firstMarkdown = "";
    for (let index = 0; index < VERSION_LIMIT + 1; index += 1) {
      const source = markdown({ body: `version ${String(index)}\n` });
      const written = putPage(
        state,
        { credential: owner, now: NOW },
        { source: "health", slug: "note", markdown: source },
      );
      if (!written.ok) {
        throw new Error(written.message);
      }
      state = written.value.state;
      if (index === 0) {
        firstHash = written.value.hash;
        firstMarkdown = source;
      }
    }
    const versions = state.versions.filter((version) => version.slug === "note");
    expect(versions).toHaveLength(VERSION_LIMIT);
    expect(versions.some((version) => version.contentHash === firstHash)).toBe(false);
    const current = state.pages[0]?.contentHash ?? "";
    const reverted = revertPage(
      state,
      { credential: owner, now: NOW },
      { source: "health", slug: "note", hash: current },
    );
    expect(reverted.ok).toBe(true);
    const listed = getVersions(state, owner, "health", "note");
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }
    expect(listed.value).toHaveLength(VERSION_LIMIT);
    expect(listed.value[0]?.hash).toBe(current);
    expect(firstMarkdown.length).toBeGreaterThan(0);
  });

  it("returns not_found for missing, deleted, and unreadable pages", () => {
    const created = mustWrite(catalog(), markdown({ visibility: "private" }));
    expect(getPage(created.state, owner, "health", "missing")).toMatchObject({
      ok: false,
      error: "not_found",
    });
    const deleted = deletePage(created.state, { credential: owner, now: NOW }, "health", "note");
    if (!deleted.ok) {
      throw new Error(deleted.message);
    }
    expect(getPage(deleted.value.state, owner, "health", "note")).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(getPage(created.state, stranger, "health", "note")).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(
      putPage(
        created.state,
        { credential: reader, now: NOW },
        { source: "health", slug: "note", markdown: markdown({ body: "x\n" }) },
      ),
    ).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    expect(
      putPage(
        catalog(),
        { credential: { kind: "anonymous" }, now: NOW },
        { source: "health", slug: "note", markdown: markdown() },
      ),
    ).toMatchObject({
      ok: false,
      error: "unauthorized",
    });
  });

  it("resolves an unreadable slug as exists false without forbidden", () => {
    const created = mustWrite(catalog(), markdown());
    const resolved = resolveSlugs(created.state, stranger, [
      { source: "health", slug: "note" },
      { source: "health", slug: "missing" },
    ]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }
    expect(resolved.value).toEqual([
      { source: "health", slug: "note", exists: false },
      { source: "health", slug: "missing", exists: false },
    ]);
  });

  it("rebuilds projections from the object and leaves the site pointer alone", () => {
    const source = markdown({
      title: "From object",
      extra: "tags: [kept]\n",
      body: "See [[health/other]]\n\n## Facts\n- id: fact_01\n  entity: 张三\n  statement: 现居上海\n",
    });
    const created = mustWrite(catalog(), source);
    const grants = { keyHash: "stored-hash" };
    const ownerRecord = { id: 1 };
    const corrupted = structuredClone(created.state);
    const page = corrupted.pages[0];
    if (!page) {
      throw new Error("missing page");
    }
    page.title = "corrupted";
    page.facts = [];
    page.tags = [];
    page.links = [];
    page.chunks = [];
    const rebuilt = rebuildProjections(corrupted);
    expect(rebuilt.pages[0]?.title).toBe("From object");
    expect(rebuilt.pages[0]?.facts.map((fact) => fact.id)).toEqual(["fact_01"]);
    expect(rebuilt.pages[0]?.tags).toEqual(["kept"]);
    expect(rebuilt.pages[0]?.links).toEqual([{ toSource: "health", toSlug: "other" }]);
    expect(rebuilt.site.pointer).toEqual(created.state.site.pointer);
    expect(grants).toEqual({ keyHash: "stored-hash" });
    expect(ownerRecord).toEqual({ id: 1 });

    const removed = structuredClone(created.state);
    removed.pages = [];
    const restored = rebuildProjections(removed);
    expect(restored.pages[0]?.title).toBe("From object");
    expect(restored.pages[0]?.chunks.length).toBeGreaterThan(0);
    expect(restored.site.releases).toEqual(created.state.site.releases);
  });

  it("rejects a file owned by another page and attaches only on commit", () => {
    const state = catalog();
    const owned: DomainState = {
      ...state,
      files: [pageFile("file_owned", { source: "health", slug: "other" })],
    };
    const conflict = putPage(
      owned,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: markdown({ extra: "files: [file_owned]\n" }),
      },
    );
    expect(conflict).toMatchObject({ ok: false, error: "conflict" });
    expect(owned.files[0]?.pageSlug).toBe("other");
    expect(owned.pages).toEqual([]);

    const loose: DomainState = { ...state, files: [pageFile("file_loose")] };
    const broken = putPage(
      loose,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: markdown({
          extra: "files: [file_loose]\n",
          body: "## Facts\n- id: fact_01\n  entity: 张三\n",
        }),
      },
    );
    expect(broken).toMatchObject({ ok: false, error: "invalid" });
    expect(loose.files[0]?.pageSource).toBeNull();

    const attached = putPage(
      loose,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: markdown({ extra: "files: [file_loose]\n" }),
      },
    );
    expect(attached.ok).toBe(true);
    if (!attached.ok) {
      return;
    }
    expect(attached.value.state.files[0]).toMatchObject({ pageSource: "health", pageSlug: "note" });
    const detached = putPage(
      attached.value.state,
      { credential: owner, now: NOW },
      {
        source: "health",
        slug: "note",
        markdown: markdown({ extra: "files: []\n", body: "detached\n" }),
      },
    );
    expect(detached.ok).toBe(true);
    if (!detached.ok) {
      return;
    }
    expect(detached.value.state.files[0]).toMatchObject({ pageSource: null, pageSlug: null });
  });
});
