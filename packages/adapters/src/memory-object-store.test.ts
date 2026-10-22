import type { Clock } from "@oneself/ports";
import { describe, expect, it } from "vitest";

import { memoryObjectStore } from "./memory-object-store.ts";
import { expectObjectStoreKeepsExistingKeys } from "./object-store-contract.ts";

describe("memoryObjectStore", () => {
  it("keeps an existing key, lists by prefix, and deletes idempotently", async () => {
    let now = new Date("2026-10-20T00:00:00.000Z");
    const clock: Clock = { now: () => now };
    const store = memoryObjectStore(clock);
    await expectObjectStoreKeepsExistingKeys(store);

    const clockStore = memoryObjectStore(clock);
    await clockStore.put("pages/life/clock.md", new Uint8Array([1]));
    now = new Date("2026-11-01T00:00:00.000Z");
    expect(await clockStore.put("pages/life/clock.md", new Uint8Array([2]))).toEqual({
      created: false,
    });
    expect(await clockStore.get("pages/life/clock.md")).toEqual({
      key: "pages/life/clock.md",
      byteSize: 1,
      writtenAt: new Date("2026-10-20T00:00:00.000Z"),
      body: new Uint8Array([1]),
    });
  });

  it("does not let the caller mutate stored bytes", async () => {
    const clock: Clock = { now: () => new Date("2026-10-20T00:00:00.000Z") };
    const store = memoryObjectStore(clock);
    const body = new Uint8Array([1, 2]);
    await store.put("files/file_01", body);
    body[0] = 9;
    const stored = await store.get("files/file_01");
    stored?.body.set([8]);
    expect(await store.get("files/file_01")).toEqual({
      key: "files/file_01",
      byteSize: 2,
      writtenAt: new Date("2026-10-20T00:00:00.000Z"),
      body: new Uint8Array([1, 2]),
    });
  });
});
