import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { Clock } from "./clock";
import type {
  Frontmatter,
  MarkdownParseResult,
  MarkdownParser,
  ParsedFact,
  ParsedMarkdown,
  ParsedTimelineEntry,
} from "./markdown-parser";
import type { ObjectHead, ObjectStore, PutObjectResult, StoredObject } from "./object-store";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("port modules", () => {
  it("exports no runtime value", async () => {
    const ports: object = await import("./index");
    expect(Object.keys(ports)).toEqual([]);
  });

  it("imports nothing outside this package", () => {
    const sources = readdirSync(sourceDirectory).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
    );
    const bareSpecifier = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

    for (const name of sources) {
      const source = readFileSync(join(sourceDirectory, name), "utf8");
      const specifiers = [...source.matchAll(bareSpecifier)].map((match) => match[1]);
      expect(specifiers.filter((specifier) => specifier?.startsWith(".") !== true)).toEqual([]);
    }
  });
});

describe("Clock", () => {
  it("exposes the current instant and nothing else", () => {
    expectTypeOf<keyof Clock>().toEqualTypeOf<"now">();
    expectTypeOf<Clock["now"]>().returns.toEqualTypeOf<Date>();

    const clock = {
      now: () => new Date("2026-10-20T00:00:00.000Z"),
    } satisfies Clock;
    expect(clock.now().toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
});

describe("ObjectStore", () => {
  it("keeps an existing key, lists by prefix, and deletes idempotently", async () => {
    expectTypeOf<keyof ObjectStore>().toEqualTypeOf<"put" | "get" | "delete" | "list">();
    expectTypeOf<keyof ObjectHead>().toEqualTypeOf<"key" | "byteSize" | "writtenAt">();
    expectTypeOf<keyof StoredObject>().toEqualTypeOf<"key" | "byteSize" | "writtenAt" | "body">();
    expectTypeOf<keyof PutObjectResult>().toEqualTypeOf<"created">();

    const writtenAt = new Date("2026-10-20T00:00:00.000Z");
    const clock = { now: () => writtenAt } satisfies Clock;
    const store = memoryObjectStore(clock);
    const first = new Uint8Array([1, 2, 3]);
    const replacement = new Uint8Array([9]);

    expect(await store.put("pages/life/note/abc.md", first)).toEqual({ created: true });
    expect(await store.put("pages/life/note/abc.md", replacement)).toEqual({ created: false });
    expect(await store.put("files/file_01", new Uint8Array([4]))).toEqual({ created: true });

    const stored = await store.get("pages/life/note/abc.md");
    expect(stored).toEqual({
      key: "pages/life/note/abc.md",
      byteSize: 3,
      writtenAt,
      body: first,
    });
    expect(await store.get("sites/rel_missing/index.html")).toBeNull();

    const pageHeads = await store.list("pages/");
    expect(pageHeads.map((head) => head.key)).toEqual(["pages/life/note/abc.md"]);
    expect((await store.list("")).map((head) => head.key).sort()).toEqual([
      "files/file_01",
      "pages/life/note/abc.md",
    ]);

    await store.delete("files/file_01");
    await store.delete("files/file_01");
    expect(await store.get("files/file_01")).toBeNull();
  });
});

describe("MarkdownParser", () => {
  it("returns frontmatter, verbatim body, and the two fences", () => {
    expectTypeOf<keyof MarkdownParser>().toEqualTypeOf<"parse">();
    expectTypeOf<MarkdownParser["parse"]>().returns.toEqualTypeOf<MarkdownParseResult>();
    expectTypeOf<keyof ParsedMarkdown>().toEqualTypeOf<
      "frontmatter" | "body" | "facts" | "timeline"
    >();
    expectTypeOf<keyof ParsedFact>().toEqualTypeOf<
      "id" | "entity" | "statement" | "confidence" | "validUntil"
    >();
    expectTypeOf<keyof ParsedTimelineEntry>().toEqualTypeOf<"occurredOn" | "title" | "detail">();

    const document = {
      frontmatter: {
        type: "profile",
        name: "张三",
        title: "工程师",
        visibility: "public",
        tags: ["public-profile"],
        files: [],
      },
      body: "# 张三\n\n做个人工具和开发者产品。\n\n## Facts\n- id: fact_01\n  entity: 张三\n  statement: 现居上海\n  confidence: 0.9\n  valid_until: 2027-01-01\n\n## Timeline\n- 2024-06-01 | 加入某公司 | 做后端\n",
      facts: [
        {
          id: "fact_01",
          entity: "张三",
          statement: "现居上海",
          confidence: 0.9,
          validUntil: "2027-01-01",
        },
      ],
      timeline: [
        {
          occurredOn: "2024-06-01",
          title: "加入某公司",
          detail: "做后端",
        },
      ],
    } satisfies ParsedMarkdown;

    const parsed: MarkdownParseResult = { ok: true, document };
    expect(parsed).toEqual({ ok: true, document });
    expect(document.frontmatter["title"]).toBe("工程师");
    expect(document.body).toContain("## Facts");
    expect(document.body).toContain("## Timeline");
    expect(document.facts[0]?.statement).toBe("现居上海");
    expect(document.timeline[0]?.detail).toBe("做后端");

    const omitted = {
      id: "fact_02",
      entity: "张三",
      statement: "会写 TypeScript",
      confidence: null,
      validUntil: null,
    } satisfies ParsedFact;
    const undated = {
      occurredOn: "2024-06-01",
      title: "加入某公司",
      detail: null,
    } satisfies ParsedTimelineEntry;
    expect(omitted.confidence).toBeNull();
    expect(undated.detail).toBeNull();

    const failure: MarkdownParseResult = {
      ok: false,
      message: "Facts item missing statement",
    };
    expect(failure).toEqual({
      ok: false,
      message: "Facts item missing statement",
    });
  });

  it("accepts only JSON frontmatter values", () => {
    const frontmatter = {
      type: "note",
      title: "笔记",
      nested: { plain: true },
      count: 1,
    } satisfies Frontmatter;
    expect(frontmatter["nested"]).toEqual({ plain: true });
  });
});

function memoryObjectStore(clock: Clock): ObjectStore {
  const objects = new Map<string, StoredObject>();
  return {
    put(key, body) {
      const existing = objects.get(key);
      if (existing !== undefined) {
        return Promise.resolve({ created: false });
      }
      objects.set(key, {
        key,
        body,
        byteSize: body.byteLength,
        writtenAt: clock.now(),
      });
      return Promise.resolve({ created: true });
    },
    get(key) {
      return Promise.resolve(objects.get(key) ?? null);
    },
    delete(key) {
      objects.delete(key);
      return Promise.resolve();
    },
    list(prefix) {
      const heads: ObjectHead[] = [];
      for (const object of objects.values()) {
        if (object.key.startsWith(prefix)) {
          heads.push({
            key: object.key,
            byteSize: object.byteSize,
            writtenAt: object.writtenAt,
          });
        }
      }
      return Promise.resolve(heads);
    },
  };
}
