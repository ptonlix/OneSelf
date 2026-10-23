import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const html = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../index.html"),
  "utf8",
);

const GITHUB = "https://github.com/ptonlix/OneSelf";
const PLACEHOLDER = /^https:\/\/(<span class="ph">)?&lt;你的站点&gt;/;

describe("built-in home page", () => {
  it("explains OneSelf, public data, the skill and the site workflow", () => {
    for (const text of [
      "One self. One context. Every AI.",
      "visibility: public",
      "/.well-known/pcp",
      'href="/admin"',
      "Powered by OneSelf",
      `href="${GITHUB}"`,
      "预览",
      "批准",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).toMatch(/npx skills add https:\/\/(<span class="ph">)?&lt;你的站点&gt;/);
  });

  it("leaves interface details to the Skill and the discovery document", () => {
    for (const text of [
      "/.well-known/agent-skills/index.json",
      "oneself.tar.gz",
      "SKILL.md",
      "/openapi.json",
      "/mcp",
      "oauth-authorization-server",
      "/pcp/v1/",
      "/media/",
      "/admin/device",
      "/admin/api-keys/new",
      "get_site",
      "activate_site",
      "edit_page",
      "credentials: omit",
      "config.json",
      "site:write",
      "MiB",
      "PostgreSQL",
      "RustFS",
      "Node.js",
      "agent-skills",
    ]) {
      expect(html, text).not.toContain(text);
    }
  });

  it("does not render, list or hint at any profile data", () => {
    for (const text of [
      "<article",
      "data-type",
      "data-field",
      "私有页",
      "/resume",
      "experience",
      "education",
      "docker",
      "compose up",
      "git clone",
      "pnpm install",
    ]) {
      expect(html.toLowerCase(), text).not.toContain(text.toLowerCase());
    }
    expect(html).not.toMatch(/npx skills add (https:\/\/github\.com\/)?ptonlix\/OneSelf/);
  });

  it("links nowhere outside except GitHub and the placeholder install command", () => {
    const urls = [...html.matchAll(/https?:\/\//g)].map((match) =>
      html.slice(match.index, match.index + 80),
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      const allowed = url.startsWith(`${GITHUB}"`) || PLACEHOLDER.test(url);
      expect(allowed, url).toBe(true);
    }
    for (const match of html.matchAll(/<a [^>]*href="https:[^>]*>/g)) {
      expect(match[0]).toContain('rel="noopener"');
    }
  });

  it("has no call-to-action buttons under the hero", () => {
    const hero = html.slice(html.indexOf('class="hero-copy'), html.indexOf('class="hero-visual'));
    expect(hero).not.toContain("<a ");
    expect(hero).not.toContain("<button");
    expect(html).not.toContain("hero-cta");
    expect(html).not.toContain("生成我的展示页");
    expect(html).not.toMatch(/class="btn[^"]*"[^>]*>\s*安装 Skill/);
  });

  it("teaches the agent in one section: the Skill for workflows, discovery for the API", () => {
    expect(html).not.toContain('id="agents"');
    expect(html).not.toContain('href="#agents"');
    expect(html).not.toContain("Agent 接入");
    const start = html.indexOf('<section class="s s-tight" id="skill">');
    const section = html.slice(start, html.indexOf("</section>", start));
    expect(start).toBeGreaterThan(0);
    for (const text of [
      "npx skills add",
      "连接并由你批准",
      "上传和管理资料",
      "定制你的展示页",
      "发现文档",
      'data-origin="/.well-known/pcp"',
      'data-origin-copy="{origin}/.well-known/pcp"',
    ]) {
      expect(section, text).toContain(text);
    }
    expect(html.match(/<section /g)).toHaveLength(4);
  });

  it("marks the install command and the discovery address for the origin", () => {
    const marked = [...html.matchAll(/<(code|span) data-origin="([^"]*)"\s*>([\s\S]*?)<\/\1\s*>/g)];
    const paths = marked.map((match) => match[2]);
    expect(paths).toEqual(["", "/.well-known/pcp"]);
    expect(html.match(/data-origin=/g)).toHaveLength(2);
    for (const [, , markedPath, fallback] of marked) {
      if (markedPath === "") {
        expect(fallback).toMatch(PLACEHOLDER);
      } else {
        expect(fallback).toBe(markedPath);
      }
    }
    expect(html).toContain('data-copy="npx skills add https://&lt;你的站点&gt;"');
    expect(html).toContain('data-origin-copy="npx skills add {origin}"');
    expect(html).toContain('data-copy="/.well-known/pcp"');
    expect(html).toContain('data-origin-copy="{origin}/.well-known/pcp"');
    expect(html).toMatch(/data-origin-fallback>\s*<span class="ph">&lt;你的站点&gt;<\/span>/);
    expect(html).not.toMatch(/localhost|127\.0\.0\.1|location\.origin/);
  });

  it("does not load any script, style or image from another origin", () => {
    expect(html).not.toMatch(/<(script|link|img)[^>]+(src|href)="(https?:)?\/\//);
    expect(html).not.toContain("fonts.googleapis.com");
  });

  it("keeps the inline logo gradient and mask ids unique", () => {
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
