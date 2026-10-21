import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("original page build", () => {
  it("does not fall back to the landing page for an unknown path", async () => {
    await build({
      root: packageRoot,
      configFile: path.join(packageRoot, "vite.config.js"),
      logLevel: "silent",
    });

    const htmlFiles = walk(path.join(packageRoot, "dist")).filter((file) => file.endsWith(".html"));
    expect(htmlFiles).toEqual(["index.html"]);

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
      expect(await landing.text()).toContain('id="app"');

      for (const route of ["/resume", "/missing", "/blog"]) {
        const response = await fetch(new URL(route, base), {
          headers: { accept: "text/html" },
        });
        expect(response.status, route).toBe(404);
        expect(await response.text()).not.toContain('id="app"');
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
