import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      found.push(...sourceFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".ts") || fullPath.endsWith(".css") || fullPath.endsWith(".html")) {
      found.push(fullPath);
    }
  }
  return found;
}

describe("admin boundaries", () => {
  it("does not import the domain or database packages", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(sourceRoot)) {
      const text = readFileSync(file, "utf8");
      if (
        /(?:from|import)\s*(?:\(\s*)?["'][^"']*(?:@oneself\/(?:domain|db)|packages\/(?:domain|db))/.test(
          text,
        )
      ) {
        offenders.push(path.relative(sourceRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
