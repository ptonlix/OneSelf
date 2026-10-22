import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("adapter entry", () => {
  it("does not export the in-memory object store from the production entry", async () => {
    const entry: object = await import("./index.ts");
    expect(Object.keys(entry).sort()).toEqual(["openPostgres", "openS3ObjectStore"]);
    expect(entry).not.toHaveProperty("memoryObjectStore");

    const testing: object = await import("./testing.ts");
    expect(Object.keys(testing)).toEqual(["memoryObjectStore"]);

    const indexSource = readFileSync(join(sourceDirectory, "index.ts"), "utf8");
    expect(indexSource).not.toContain("memory-object-store");
    expect(indexSource).not.toContain("memoryObjectStore");
  });

  it("does not import domain, Hono, or React", () => {
    const sources = readdirSync(sourceDirectory).filter((name) => name.endsWith(".ts"));
    const forbidden =
      /@oneself\/domain|packages\/domain|from ["']hono["']|from ["']react["']|from ["']react-dom["']/;
    for (const name of sources) {
      expect(readFileSync(join(sourceDirectory, name), "utf8")).not.toMatch(forbidden);
    }

    const manifest = JSON.parse(readFileSync(join(sourceDirectory, "../package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    });
    expect(dependencyNames).toContain("@aws-sdk/client-s3");
    expect(dependencyNames).toContain("drizzle-orm");
    expect(dependencyNames).toContain("postgres");
    expect(dependencyNames.filter((name) => name === "hono" || name.startsWith("react"))).toEqual(
      [],
    );
  });
});
