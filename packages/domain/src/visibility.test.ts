import { describe, expect, it } from "vitest";

import { projectMarkdown } from "./markdown.ts";
import { setPageVisibility } from "./visibility.ts";

const body = "正文里有 visibility: public，不能被改掉。\n";

function page(frontmatter: string, text = body, newline = "\n"): string {
  return `---${newline}${frontmatter}${newline}---${newline}${text}`;
}

describe("setPageVisibility", () => {
  it("writes an explicit public line when visibility is omitted", () => {
    const source = page("type: note\ntitle: 上海");
    const next = setPageVisibility(source, "public");
    expect(next.ok).toBe(true);
    if (!next.ok || next.value === null) {
      throw new Error("expected a rewrite");
    }
    expect(next.value).toContain("visibility: public");
    expect(next.value.endsWith(body)).toBe(true);
    expect(projectMarkdown(next.value).ok).toBe(true);
  });

  it("does not write when the page is already the requested visibility", () => {
    const omitted = page("type: note\ntitle: 上海");
    const explicit = page("type: note\ntitle: 上海\nvisibility: private");
    expect(setPageVisibility(omitted, "private")).toEqual({ ok: true, value: null });
    expect(setPageVisibility(explicit, "private")).toEqual({ ok: true, value: null });
    expect(
      setPageVisibility(page("type: note\ntitle: 上海\nvisibility: public"), "public"),
    ).toEqual({
      ok: true,
      value: null,
    });
  });

  it("keeps the body sentence, comments, other keys, and CRLF", () => {
    const source = page(
      "type: note\r\n# keep\r\ntitle: 上海\r\ntags: [home]\r\nvisibility: private",
      body,
      "\r\n",
    );
    const next = setPageVisibility(source, "public");
    expect(next.ok).toBe(true);
    if (!next.ok || next.value === null) {
      throw new Error("expected a rewrite");
    }
    expect(next.value).toContain("# keep\r\n");
    expect(next.value).toContain("tags: [home]\r\n");
    expect(next.value).toContain("visibility: public\r\n");
    expect(next.value.endsWith(body)).toBe(true);
    expect(next.value.slice(0, next.value.length - body.length)).toContain("\r\n");
  });
});
