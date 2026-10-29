import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { assertDirectStart, listenUrls, resolveListenHost } from "./index.ts";

describe("listen host", () => {
  it("keeps packaged migrations beside the server root", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    expect(existsSync(path.join(root, "packages/db/migrations/meta/_journal.json"))).toBe(true);
  });

  it("defaults to loopback and uses HOST when set", () => {
    expect(resolveListenHost(undefined)).toBe("127.0.0.1");
    expect(resolveListenHost("")).toBe("127.0.0.1");
    expect(resolveListenHost("0.0.0.0")).toBe("0.0.0.0");
    expect(listenUrls({ host: "127.0.0.1", port: 3000 })).toEqual({
      site: "http://127.0.0.1:3000",
      admin: "http://127.0.0.1:3000/admin",
    });
    expect(listenUrls({ host: "0.0.0.0", port: 3000 }).site).toBe("http://127.0.0.1:3000");
    expect(
      listenUrls({ host: "0.0.0.0", port: 3000, publicOrigin: "https://oneself.example/" }),
    ).toEqual({
      site: "https://oneself.example",
      admin: "https://oneself.example/admin",
    });
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
