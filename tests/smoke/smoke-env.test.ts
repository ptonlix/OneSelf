import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { assertSmokeResourceName } from "../../packages/adapters/src/smoke-resources.js";
import { migrationStatements, smokeEnvironment } from "./smoke-env.js";

describe("smoke environment", () => {
  it("defaults to the dev services with a separate database and bucket", () => {
    const smoke = smokeEnvironment({
      DATABASE_URL: "postgres://oneself:oneself@127.0.0.1:5432/oneself",
      OBJECT_STORAGE_BUCKET: "oneself",
    });
    expect(smoke.adminUrl).toBe("postgres://oneself:oneself@127.0.0.1:5432/postgres");
    expect(smoke.database).toBe("oneself_smoke");
    expect(smoke.databaseUrl).toBe("postgres://oneself:oneself@127.0.0.1:5432/oneself_smoke");
    expect(smoke.objectStorage).toEqual({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      bucket: "oneself-smoke",
      accessKeyId: "oneself",
      secretAccessKey: "oneselfsecret",
    });
  });

  it("takes SMOKE_* overrides", () => {
    const smoke = smokeEnvironment({
      SMOKE_POSTGRES_ADMIN_URL: "postgres://a:b@db.local:6543/template1",
      SMOKE_DATABASE: "ci_smoke",
      SMOKE_OBJECT_STORAGE_ENDPOINT: "http://s3.local:9100",
      SMOKE_OBJECT_STORAGE_BUCKET: "ci-smoke",
    });
    expect(smoke.databaseUrl).toBe("postgres://a:b@db.local:6543/ci_smoke");
    expect(smoke.objectStorage.endpoint).toBe("http://s3.local:9100");
    expect(smoke.objectStorage.bucket).toBe("ci-smoke");
  });

  it("refuses the dev database and bucket and names without smoke", () => {
    expect(() => smokeEnvironment({ SMOKE_DATABASE: "oneself" })).toThrow(/refused/);
    expect(() => smokeEnvironment({ SMOKE_DATABASE: "scratch" })).toThrow(/smoke/);
    expect(() => smokeEnvironment({ SMOKE_DATABASE: "smoke;drop" })).toThrow(/identifier/);
    expect(() => smokeEnvironment({ SMOKE_OBJECT_STORAGE_BUCKET: "oneself" })).toThrow(/refused/);
    expect(() => smokeEnvironment({ SMOKE_OBJECT_STORAGE_BUCKET: "media" })).toThrow(/smoke/);
    expect(() =>
      smokeEnvironment({
        SMOKE_POSTGRES_ADMIN_URL: "postgres://oneself:oneself@127.0.0.1:5432/oneself_smoke",
      }),
    ).toThrow(/another database/);
    expect(() => {
      assertSmokeResourceName("database", "oneself");
    }).toThrow(/Refusing/);
    expect(() => {
      assertSmokeResourceName("bucket", "oneself");
    }).toThrow(/Refusing/);
    expect(() => {
      assertSmokeResourceName("bucket", "oneself-smoke");
    }).not.toThrow();
  });

  it("reads every migration in journal order", () => {
    const statements = migrationStatements("packages/db/migrations");
    const files = readdirSync("packages/db/migrations").filter((name) => name.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(1);
    expect(statements.length).toBeGreaterThan(files.length);
    expect(statements.some((statement) => statement.includes("--> statement-breakpoint"))).toBe(
      false,
    );
    expect(statements[0]).toMatch(/^CREATE /i);
  });
});
