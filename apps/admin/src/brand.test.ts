import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const admin = path.join(repo, "apps/admin");
const publicPage = path.join(repo, "packages/public-page");

function bytes(file: string): Buffer {
  return readFileSync(file);
}

describe("shared brand assets", () => {
  it("keeps the two brand.css copies byte-identical", () => {
    expect(
      bytes(path.join(admin, "src/brand.css")).equals(
        bytes(path.join(publicPage, "src/brand.css")),
      ),
    ).toBe(true);
  });

  it("keeps the two starfield copies byte-identical", () => {
    expect(
      bytes(path.join(admin, "src/stars.ts")).equals(bytes(path.join(publicPage, "src/stars.ts"))),
    ).toBe(true);
  });

  it("does not load any remote resource from brand.css", () => {
    const css = readFileSync(path.join(admin, "src/brand.css"), "utf8");
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).toContain("--fg-3: #7a7e9c");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("font-display: swap");
    expect(css).toContain('url("./fonts/Geist-Variable.woff2")');
    expect(css).toContain('url("./fonts/GeistMono-Variable.woff2")');
  });

  it("ships the same Geist fonts and OFL license in both packages", () => {
    for (const name of ["Geist-Variable.woff2", "GeistMono-Variable.woff2", "OFL.txt"]) {
      const left = bytes(path.join(admin, "src/fonts", name));
      const right = bytes(path.join(publicPage, "src/fonts", name));
      expect(left.length, name).toBeGreaterThan(0);
      expect(left.equals(right), name).toBe(true);
    }
    expect(readFileSync(path.join(admin, "src/fonts/OFL.txt"), "utf8")).toContain(
      "SIL Open Font License",
    );
  });

  it("uses the official Orbit O logo as both favicons", () => {
    const logo = bytes(path.join(repo, "docs/images/logo.svg"));
    expect(bytes(path.join(admin, "public/favicon.svg")).equals(logo)).toBe(true);
    expect(bytes(path.join(publicPage, "public/favicon.svg")).equals(logo)).toBe(true);
    for (const html of [path.join(admin, "index.html"), path.join(publicPage, "index.html")]) {
      expect(readFileSync(html, "utf8"), html).toMatch(
        /<link rel="icon" type="image\/svg\+xml" href="[^"]*favicon\.svg"/,
      );
    }
  });
});
