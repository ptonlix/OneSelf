import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertDirectStart, resolveListenHost } from "./index.js";

describe("listen host", () => {
  it("defaults to loopback and uses HOST when set", () => {
    expect(resolveListenHost(undefined)).toBe("127.0.0.1");
    expect(resolveListenHost("")).toBe("127.0.0.1");
    expect(resolveListenHost("0.0.0.0")).toBe("0.0.0.0");
  });

  it("refuses a direct start without storage configuration or built pages", () => {
    const root = mkdtempSync(path.join(tmpdir(), "oneself-start-"));
    const publicPageDist = path.join(root, "public-page");
    const adminDist = path.join(root, "admin");
    mkdirSync(publicPageDist);
    mkdirSync(adminDist);
    expect(() => {
      assertDirectStart({}, { publicPageDist, adminDist });
    }).toThrow(/DATABASE_URL/);
    expect(() => {
      assertDirectStart(
        {
          DATABASE_URL: "postgres://local",
          OBJECT_STORAGE_ENDPOINT: "http://rustfs:9000",
          OBJECT_STORAGE_ACCESS_KEY: "",
          OBJECT_STORAGE_SECRET_KEY: "secret",
        },
        { publicPageDist, adminDist },
      );
    }).toThrow(/OBJECT_STORAGE_ACCESS_KEY/);
    writeFileSync(path.join(publicPageDist, "index.html"), "dist");
    expect(() => {
      assertDirectStart(
        {
          DATABASE_URL: "postgres://local",
          OBJECT_STORAGE_ENDPOINT: "http://rustfs:9000",
          OBJECT_STORAGE_ACCESS_KEY: "key",
          OBJECT_STORAGE_SECRET_KEY: "secret",
        },
        { publicPageDist, adminDist },
      );
    }).toThrow(/admin dist/);
  });
});
