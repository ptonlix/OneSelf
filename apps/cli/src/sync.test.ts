import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as prompts from "@clack/prompts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { maybeSyncBundle } from "./sync.ts";

let dir = "";
const warnings: string[] = [];
const saved = { ref: process.env.ONESELF_REF, bundled: process.env.ONESELF_BUNDLED_REF };

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "oneself-sync-"));
  warnings.length = 0;
  Reflect.deleteProperty(process.env, "ONESELF_REF");
  Reflect.deleteProperty(process.env, "ONESELF_BUNDLED_REF");
  vi.spyOn(prompts.log, "warn").mockImplementation((message) => {
    warnings.push(message);
  });
  vi.spyOn(prompts.log, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of [
    ["ONESELF_REF", saved.ref],
    ["ONESELF_BUNDLED_REF", saved.bundled],
  ] as const) {
    if (v === undefined) Reflect.deleteProperty(process.env, k);
    else process.env[k] = v;
  }
});

function installed(ref: string): void {
  writeFileSync(path.join(dir, ".oneself-release"), `ref=${ref}\n`);
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function httpError(status: number): Promise<Response> {
  return Promise.resolve(new Response("no", { status }));
}

function okJson(body: unknown): Promise<Response> {
  return Promise.resolve(Response.json(body));
}

async function withFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

it("old Release bootstrap (bundled only) does not downgrade", async () => {
  installed("v1.3.0");
  process.env.ONESELF_BUNDLED_REF = "v1.2.0";
  const plan = await maybeSyncBundle(dir, true);
  expect(plan.kind).toBe("keep-newer");
  expect(plan.checkedLatest).toBe(false);
  expect(warnings.join("\n")).toMatch(/这份安装器的 v1\.2\.0/);
});

it("newer bundled tag syncs (dry-run)", async () => {
  installed("v1.2.3-rc.1");
  process.env.ONESELF_BUNDLED_REF = "v1.2.3";
  await expect(maybeSyncBundle(dir, true)).resolves.toEqual({
    kind: "sync",
    target: "v1.2.3",
    forced: false,
    checkedLatest: false,
  });
});

it("explicit ONESELF_REF forces downgrade (dry-run)", async () => {
  installed("v1.3.0");
  process.env.ONESELF_REF = "v1.2.0";
  process.env.ONESELF_BUNDLED_REF = "v1.2.0";
  await expect(maybeSyncBundle(dir, true)).resolves.toEqual({
    kind: "sync",
    target: "v1.2.0",
    forced: true,
    checkedLatest: false,
  });
});

it("bin/oneself run directly (no refs) leaves files alone", async () => {
  installed("v1.3.0");
  const plan = await maybeSyncBundle(dir, true);
  expect(plan.kind).toBe("skip");
  expect(plan.checkedLatest).toBe(false);
});

it("invalid bundled ref is rejected", async () => {
  installed("v1.3.0");
  process.env.ONESELF_BUNDLED_REF = "main";
  await expect(maybeSyncBundle(dir, true)).rejects.toThrow(/ONESELF_BUNDLED_REF/);
});

it("followLatest keeps a newer bundled tag and skips the same tag", async () => {
  installed("v1.2.0");
  process.env.ONESELF_BUNDLED_REF = "v1.3.0";
  let fetches = 0;
  await withFetch(
    () => {
      fetches += 1;
      return httpError(500);
    },
    async () => {
      await expect(maybeSyncBundle(dir, true, true)).resolves.toEqual({
        kind: "sync",
        target: "v1.3.0",
        forced: false,
        checkedLatest: false,
      });
      installed("v1.3.0");
      const same = await maybeSyncBundle(dir, true, true);
      expect(same.kind).toBe("skip");
      expect(same.checkedLatest).toBe(false);
    },
  );
  expect(fetches).toBe(0);
});

it("followLatest lookup failure rejects before compose pull", async () => {
  installed("v1.2.0");
  const urls: string[] = [];
  await withFetch(
    (input) => {
      urls.push(requestUrl(input));
      return httpError(503);
    },
    async () => {
      await expect(maybeSyncBundle(dir, true, true)).rejects.toThrow(/无法读取 GitHub Release/);
    },
  );
  expect(urls).toHaveLength(1);
  expect(urls[0] ?? "").toMatch(/\/releases\/latest$/);
  expect(urls.some((url) => url.includes("/releases/download/"))).toBe(false);
});

it("resolved latest same or older does not downgrade", async () => {
  installed("v1.3.0");
  await withFetch(
    () => okJson({ tag_name: "v1.2.0" }),
    async () => {
      const older = await maybeSyncBundle(dir, true, true);
      expect(older.kind).toBe("keep-newer");
      expect(older.checkedLatest).toBe(true);
      if (older.kind === "keep-newer") expect(older.bundled).toBe("v1.2.0");
    },
  );
  const text = warnings.join("\n");
  expect(text).toMatch(/GitHub 最新正式版 v1\.2\.0/);
  expect(text).not.toMatch(/安装器/);

  await withFetch(
    () => okJson({ tag_name: "v1.3.0" }),
    async () => {
      const same = await maybeSyncBundle(dir, true, true);
      expect(same.kind).toBe("skip");
      expect(same.checkedLatest).toBe(true);
    },
  );
});

it("source checkout does not look up latest", async () => {
  writeFileSync(path.join(dir, "compose.dev.yaml"), "");
  mkdirSync(path.join(dir, "apps/server"), { recursive: true });
  installed("v0.1.0");
  let fetches = 0;
  await withFetch(
    () => {
      fetches += 1;
      return httpError(500);
    },
    async () => {
      const plan = await maybeSyncBundle(dir, true, true);
      expect(plan.kind).toBe("skip");
      expect(plan.checkedLatest).toBe(false);
    },
  );
  expect(fetches).toBe(0);
});
