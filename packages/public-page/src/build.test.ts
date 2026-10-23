import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("built-in home page build", () => {
  it("does not fall back to the landing page for an unknown path", async () => {
    await build({
      root: packageRoot,
      configFile: path.join(packageRoot, "vite.config.js"),
      logLevel: "silent",
    });

    const dist = path.join(packageRoot, "dist");
    const files = walk(dist);
    const htmlFiles = files.filter((file) => file.endsWith(".html"));
    expect(htmlFiles).toEqual(["index.html"]);
    expect(files).toContain("favicon.svg");
    expect(
      files.filter((file) => /^assets\/Geist-Variable-[\w-]{6,}\.woff2$/.test(file)),
    ).toHaveLength(1);
    expect(
      files.filter((file) => /^assets\/GeistMono-Variable-[\w-]{6,}\.woff2$/.test(file)),
    ).toHaveLength(1);

    const html = readFileSync(path.join(dist, "index.html"), "utf8");
    const css = files
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(path.join(dist, file), "utf8"))
      .join("\n");
    for (const text of [html, css]) {
      expect(text).not.toContain("fonts.googleapis.com");
    }
    // Only <a href> may point at another origin (the GitHub link); no resource does.
    expect(html).not.toMatch(/<(script|link|img)[^>]+(src|href)="(https?:)?\/\//);
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//);
    // Relative base: every script, style and icon resolves under ./, so /_preview/{id}/ works.
    const resources = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );
    expect(resources.length).toBeGreaterThanOrEqual(3);
    for (const resource of resources) {
      expect(resource, resource).toMatch(/^\.\//);
    }
    expect(resources.some((resource) => /^\.\/assets\/.+\.js$/.test(resource))).toBe(true);
    expect(resources.some((resource) => /^\.\/assets\/.+\.css$/.test(resource))).toBe(true);
    expect(html).not.toMatch(/(src|href)="\/assets\//);
    const fontUrls = [...css.matchAll(/url\(\s*["']?([^"')]+\.woff2)/g)].map(
      (match) => match[1] ?? "",
    );
    expect(fontUrls.length).toBeGreaterThanOrEqual(2);
    for (const url of fontUrls) {
      expect(url, url).not.toMatch(/^(\/|https?:)/);
    }

    const server = await preview({
      root: packageRoot,
      configFile: path.join(packageRoot, "vite.config.js"),
      logLevel: "silent",
      preview: { port: 0, strictPort: false },
    });
    try {
      const urls = server.resolvedUrls;
      if (urls === null) {
        throw new Error("Vite preview did not report a local URL.");
      }
      const base = urls.local[0];
      if (base === undefined) {
        throw new Error("Vite preview did not report a local URL.");
      }
      const landing = await fetch(new URL("/", base));
      expect(landing.status).toBe(200);
      expect(await landing.text()).toContain("One self. One context. Every AI.");

      for (const route of ["/resume", "/missing", "/blog"]) {
        const response = await fetch(new URL(route, base), {
          headers: { accept: "text/html" },
        });
        expect(response.status, route).toBe(404);
        expect(await response.text()).not.toContain("One self. One context. Every AI.");
      }
    } finally {
      await server.close();
    }
  }, 30_000);
});

function walk(directory: string, prefix = ""): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...walk(path.join(directory, entry.name), relative));
    } else {
      files.push(relative);
    }
  }
  return files;
}
