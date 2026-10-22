import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PublicClientFailure } from "@oneself/public-client";
import type { PublicClient } from "@oneself/public-client";
import { mountOriginalPage } from "./main.ts";

function fakeDocument(): {
  innerHTML: string;
  querySelector(selector: string): { innerHTML: string } | null;
} {
  const node = { innerHTML: "" };
  return {
    get innerHTML() {
      return node.innerHTML;
    },
    querySelector(selector: string) {
      return selector === "#app" ? node : null;
    },
  };
}

function failingClient(): PublicClient {
  return {
    listSources: () => Promise.resolve(null),
    listPages: () => Promise.reject(new PublicClientFailure("invalid", "down", 500)),
    getPage: () => Promise.reject(new PublicClientFailure("invalid", "down", 500)),
    search: () => Promise.reject(new PublicClientFailure("invalid", "down", 500)),
    getMedia: () => Promise.reject(new PublicClientFailure("invalid", "down", 500)),
  };
}

describe("mountOriginalPage", () => {
  it("shows an error state instead of the empty state when the public read fails", async () => {
    const document = fakeDocument();
    await mountOriginalPage(document, failingClient(), () => "blob:unused");
    expect(document.innerHTML).toContain('data-state="error"');
    expect(document.innerHTML).not.toContain("没有公开页");
    expect(document.innerHTML).not.toContain("down");
  });

  it("does not reference domain, db, or a resume route", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const files = walk(root).filter((file) => !file.endsWith(".test.ts"));
    const forbidden =
      /@oneself\/(domain|db|adapters)|packages\/(domain|db|adapters)|\/resume|history\.pushState|appType:\s*"spa"/;
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(forbidden);
    }
    const config = readFileSync(path.join(root, "vite.config.js"), "utf8");
    expect(config).toContain('appType: "mpa"');
  });
});

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|js|html|css|json)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}
