import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresStore, type PostgresStore } from "./postgres-store.js";

const HASH = "ab".repeat(32);
const OTHER_HASH = "cd".repeat(32);
const RELEASE = `rel_${"ef".repeat(16)}`;

describe("postgres store", () => {
  let client: PGlite;
  let store: PostgresStore;

  beforeAll(async () => {
    client = new PGlite();
    const migration = readFileSync(
      new URL("../../db/migrations/0000_initial.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      const sqlText = statement.trim();
      if (sqlText !== "") {
        await client.exec(sqlText);
      }
    }
    store = createPostgresStore(drizzle(client));
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it("writes and reads table rows without applying page rules", async () => {
    const writtenAt = new Date("2026-10-20T00:00:00.000Z");
    await store.insertSource({ id: "life", deleted_at: null });
    await store.upsertPage(pageRow("life", "note", HASH, writtenAt, "private"));
    await store.replaceChunks("life", "note", [
      { source: "life", slug: "note", ordinal: 0, body: "只在块里" },
    ]);
    await store.replaceLinks("life", "note", [
      { from_source: "life", from_slug: "note", to_source: "life", to_slug: "other" },
    ]);
    await store.replaceTags("life", "note", [{ source: "life", slug: "note", tag: "daily" }]);
    await store.replaceFacts("life", "note", [
      {
        source: "life",
        slug: "note",
        id: "fact_01",
        entity: "张三",
        statement: "现居上海",
        confidence: "0.9",
        valid_until: "2027-01-01",
      },
    ]);
    await store.replaceTimeline("life", "note", [
      {
        source: "life",
        slug: "note",
        ordinal: 0,
        occurred_on: "2024-06-01",
        title: "加入某公司",
        detail: null,
      },
    ]);
    const version = await store.insertPageVersion({
      source: "life",
      slug: "note",
      content_hash: HASH,
      object_key: objectKey("life", "note", HASH),
      frontmatter: { title: "笔记" },
      written_at: writtenAt,
    });
    await store.insertFile({
      id: "file_01",
      object_key: "files/file_01",
      media_type: "image/png",
      byte_size: 4,
      sha256: HASH,
      page_source: "life",
      page_slug: "note",
      created_at: writtenAt,
    });

    const page = await store.findPage("life", "note");
    expect(page?.title).toBe("笔记");
    expect(page?.visibility).toBe("private");
    expect(page?.frontmatter).toEqual({ title: "笔记", city: "上海" });
    expect(await store.listChunks("life", "note")).toHaveLength(1);
    expect(await store.listTags("life", "note")).toEqual([
      { source: "life", slug: "note", tag: "daily" },
    ]);
    expect(Number((await store.listFacts({ source: "life", slug: "note" }))[0]?.confidence)).toBe(
      0.9,
    );
    expect((await store.listTimeline("life", "note"))[0]?.detail).toBeNull();
    expect(version.id).toBeGreaterThan(0);

    await store.upsertPage(pageRow("life", "note", OTHER_HASH, writtenAt, "public"));
    expect(await store.listChunks("life", "note")).toHaveLength(1);
    expect((await store.findPage("life", "note"))?.visibility).toBe("public");

    for (let index = 0; index < 51; index += 1) {
      await store.insertPageVersion({
        source: "life",
        slug: "note",
        content_hash: HASH,
        object_key: objectKey("life", "note", HASH),
        frontmatter: { title: "笔记", index },
        written_at: writtenAt,
      });
    }
    expect(await store.listPageVersions("life", "note")).toHaveLength(52);

    const found = await store.searchPages({ text: "上海", limit: 10 });
    expect(found.map((row) => row.slug)).toEqual(["note"]);
    expect(await store.searchPages({ text: "只在块里", limit: 10 })).toEqual([]);
    expect(await store.searchPages({ text: "", limit: 10, visibility: "private" })).toEqual([]);

    await store.insertSiteRelease({ id: RELEASE, created_at: writtenAt });
    await store.insertSiteFiles([
      { release_id: RELEASE, path: "index.html", object_key: `sites/${RELEASE}/index.html` },
    ]);
    await store.upsertSitePointer({ id: 1, release_id: "original" });
    await store.upsertSitePointer({ id: 1, release_id: RELEASE });
    expect(await store.findSitePointer()).toMatchObject({ id: 1, release_id: RELEASE });
    expect(await store.listLinks({ to_source: "life", to_slug: "other" })).toHaveLength(1);
    expect(await store.listPages({ slug_prefix: "no" })).toHaveLength(1);
    expect(await store.listReferencedObjectKeys()).not.toContain(`sites/${RELEASE}/index.html`);
    expect(await store.listReferencedObjectKeys()).toContain(objectKey("life", "note", OTHER_HASH));
    expect(await store.listReferencedObjectKeys()).toContain("files/file_01");

    await store.updateFilePage("file_01", { page_source: null, page_slug: null });
    expect((await store.findFile("file_01"))?.page_source).toBeNull();
  });

  it("deletes a page's rows without deleting the source", async () => {
    const writtenAt = new Date("2026-10-20T00:00:00.000Z");
    await store.insertSource({ id: "cook", deleted_at: null });
    await store.upsertPage(pageRow("cook", "soup", HASH, writtenAt, "private"));
    await store.replaceChunks("cook", "soup", [
      { source: "cook", slug: "soup", ordinal: 0, body: "one" },
      { source: "cook", slug: "soup", ordinal: 1, body: "two" },
    ]);
    await store.replaceChunks("cook", "soup", [
      { source: "cook", slug: "soup", ordinal: 0, body: "only" },
    ]);
    expect(await store.listChunks("cook", "soup")).toHaveLength(1);
    await store.deletePage("cook", "soup");
    expect(await store.findPage("cook", "soup")).toBeNull();
    expect(await store.listChunks("cook", "soup")).toEqual([]);
    expect(await store.findSource("cook")).toMatchObject({ id: "cook", deleted_at: null });
    await store.deleteSource("cook");
    expect(await store.findSource("cook")).toBeNull();
  });

  it("rolls back a transaction and keeps an empty version delete", async () => {
    await expect(
      store.transaction(async (tx) => {
        await tx.insertSource({ id: "work", deleted_at: null });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await store.findSource("work")).toBeNull();
    await store.deletePageVersions([]);
  });

  it("does not delete a source that still has a page", async () => {
    await expect(store.deleteSource("life")).rejects.toThrow();
  });

  it("round-trips owner, api key, and oauth rows", async () => {
    const createdAt = new Date("2026-10-20T00:00:00.000Z");
    await store.insertOwner({
      id: 1,
      login: "owner",
      password_hash: "hash",
      must_change_password: true,
    });
    await store.updateOwner({ must_change_password: false });
    expect(await store.findOwner()).toMatchObject({ login: "owner", must_change_password: false });

    await store.insertApiKey({
      id: "key_01",
      key_hash: HASH,
      label: "laptop",
      unrestricted_data: false,
      site_write: false,
      sources: [{ id: "life", read: true, write: false, visibility: false }],
      created_at: createdAt,
      last_used_at: null,
      revoked_at: null,
    });
    await store.updateApiKey("key_01", { last_used_at: createdAt });
    expect((await store.findApiKeyByHash(HASH))?.last_used_at).toEqual(createdAt);

    await store.insertApiKeyRequest({
      id: "req_01",
      label: "laptop",
      unrestricted_data: false,
      site_write: true,
      sources: [],
      status: "pending",
      expires_at: createdAt,
      created_at: createdAt,
      api_key_id: null,
    });
    await store.updateApiKeyRequest("req_01", { status: "confirmed", api_key_id: "key_01" });
    expect((await store.findApiKeyRequest("req_01"))?.status).toBe("confirmed");

    await store.insertOauthGrant({
      id: "grant_01",
      site_write: false,
      sources: [],
      refresh_token_hash: null,
      revoked_at: null,
      created_at: createdAt,
    });
    await store.updateOauthGrant("grant_01", { refresh_token_hash: OTHER_HASH });
    expect((await store.findOauthGrant("grant_01"))?.refresh_token_hash).toBe(OTHER_HASH);

    await store.insertSiteActivation({
      id: "act_01",
      release_id: RELEASE,
      status: "pending",
      expires_at: createdAt,
      created_at: createdAt,
      decided_at: null,
    });
    await store.updateSiteActivation("act_01", { status: "approved", decided_at: createdAt });
    expect((await store.findSiteActivation("act_01"))?.status).toBe("approved");
  });
});

function pageRow(source: string, slug: string, hash: string, updatedAt: Date, visibility: string) {
  return {
    source,
    slug,
    type: "note",
    title: "笔记",
    visibility,
    frontmatter: { title: "笔记", city: "上海" },
    body: "现居上海",
    content_hash: hash,
    object_key: objectKey(source, slug, hash),
    updated_at: updatedAt,
    deleted_at: null,
    hidden_by_source: false,
  };
}

function objectKey(source: string, slug: string, hash: string): string {
  return `pages/${source}/${slug}/${hash}.md`;
}
