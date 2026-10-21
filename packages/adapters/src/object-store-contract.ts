import type { ObjectStore } from "@oneself/ports";
import { expect } from "vitest";

export async function expectObjectStoreKeepsExistingKeys(store: ObjectStore): Promise<void> {
  const first = new Uint8Array([1, 2, 3]);
  const replacement = new Uint8Array([9]);
  const writtenAt = new Date("2026-10-20T00:00:00.000Z");

  expect(await store.put("pages/life/note/abc.md", first)).toEqual({ created: true });
  expect(await store.put("pages/life/note/abc.md", replacement)).toEqual({ created: false });
  expect(await store.put("files/file_01", new Uint8Array([4]))).toEqual({ created: true });

  expect(await store.get("pages/life/note/abc.md")).toEqual({
    key: "pages/life/note/abc.md",
    byteSize: 3,
    writtenAt,
    body: first,
  });
  expect(await store.get("sites/rel_missing/index.html")).toBeNull();

  const pageHeads = await store.list("pages/");
  expect(pageHeads.map((head) => head.key)).toEqual(["pages/life/note/abc.md"]);
  expect(pageHeads[0]).not.toHaveProperty("body");
  expect((await store.list("")).map((head) => head.key).sort()).toEqual([
    "files/file_01",
    "pages/life/note/abc.md",
  ]);

  await store.delete("files/file_01");
  await store.delete("files/file_01");
  expect(await store.get("files/file_01")).toBeNull();
}
