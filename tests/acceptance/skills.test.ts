import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readSkill(name: string): string {
  return readFileSync(resolve(root, "skills", name), "utf8");
}

const requiredSentences = [
  "frontmatter",
  "两种 fence",
  "files",
  "[[source/slug]]",
  "原始页面能展示的公开字段",
  "真实路径",
  "保留路径",
  "credentials: omit",
  "不得写入密钥或私有页",
  "批准地址必须交给所属人",
  "同意前不得声称已更换",
  "下一轮必须从原始源码 zip 开始",
] as const;

describe("product skills", () => {
  const data = readSkill("data.md");
  const originalPage = readSkill("original-page.md");
  const combined = `${data}\n${originalPage}`;

  it("keeps data rules in data.md", () => {
    for (const sentence of [
      "frontmatter",
      "visibility",
      "两种 fence",
      "## Facts",
      "## Timeline",
      "files",
      "[[source/slug]]",
    ]) {
      expect(data, sentence).toContain(sentence);
    }
  });

  it("keeps site rules in original-page.md", () => {
    for (const sentence of [
      "原始页面能展示的公开字段",
      "name",
      "org",
      "start",
      "end",
      "真实路径",
      "blog/index.html",
      "保留路径",
      "pcp",
      "oauth",
      ".well-known",
      "admin",
      "skills",
      "media",
      "_preview",
      "credentials: omit",
      "不得写入密钥或私有页",
      "批准地址必须交给所属人",
      "同意前不得声称已更换",
      "下一轮必须从原始源码 zip 开始",
      "original-page-source.zip",
    ]) {
      expect(originalPage, sentence).toContain(sentence);
    }
  });

  it("contains every required sentence", () => {
    for (const sentence of requiredSentences) {
      expect(combined, sentence).toContain(sentence);
    }
  });

  it("does not name Hono, Express, or Next.js", () => {
    for (const name of ["Hono", "Express", "Next.js"]) {
      expect(combined, name).not.toContain(name);
    }
  });
});
