import { readFileSync } from "node:fs";
import path from "node:path";

// Where the closed-loop smoke test keeps its data. It reuses the dev services from
// compose.dev.yaml but has its own database and bucket. Only SMOKE_* variables are read, never
// DATABASE_URL or OBJECT_STORAGE_*, so a .env pointing at dev data cannot leak in.

export type SmokeEnvironment = {
  readonly adminUrl: string;
  readonly databaseUrl: string;
  readonly database: string;
  readonly objectStorage: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
  };
};

const DEFAULT_ADMIN_URL = "postgres://oneself:oneself@127.0.0.1:5432/postgres";

function value(env: Readonly<Record<string, string | undefined>>, name: string, fallback: string) {
  const raw = env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

/** Reads SMOKE_* overrides and refuses any name that could be the dev database or bucket. */
export function smokeEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SmokeEnvironment {
  const adminUrl = value(env, "SMOKE_POSTGRES_ADMIN_URL", DEFAULT_ADMIN_URL);
  const database = value(env, "SMOKE_DATABASE", "oneself_smoke");
  const bucket = value(env, "SMOKE_OBJECT_STORAGE_BUCKET", "oneself-smoke");
  if (database === "oneself" || !database.includes("smoke")) {
    throw new Error(
      `SMOKE_DATABASE="${database}" is refused: it must contain "smoke" and must not be the dev database "oneself".`,
    );
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(database)) {
    throw new Error(`SMOKE_DATABASE="${database}" must be a plain lower-case identifier.`);
  }
  if (bucket === "oneself" || !bucket.includes("smoke")) {
    throw new Error(
      `SMOKE_OBJECT_STORAGE_BUCKET="${bucket}" is refused: it must contain "smoke" and must not be the dev bucket "oneself".`,
    );
  }
  const url = new URL(adminUrl);
  if (url.pathname.replace(/^\//, "") === database) {
    throw new Error("SMOKE_POSTGRES_ADMIN_URL must point at another database, such as postgres.");
  }
  url.pathname = `/${database}`;
  return {
    adminUrl,
    databaseUrl: url.toString(),
    database,
    objectStorage: {
      endpoint: value(env, "SMOKE_OBJECT_STORAGE_ENDPOINT", "http://127.0.0.1:9000"),
      region: value(env, "SMOKE_OBJECT_STORAGE_REGION", "us-east-1"),
      bucket,
      accessKeyId: value(env, "SMOKE_OBJECT_STORAGE_ACCESS_KEY_ID", "oneself"),
      secretAccessKey: value(env, "SMOKE_OBJECT_STORAGE_SECRET_ACCESS_KEY", "oneselfsecret"),
    },
  };
}

/** Every migration statement in journal order, split on drizzle's statement breakpoints. */
export function migrationStatements(directory: string): string[] {
  const journal = JSON.parse(readFileSync(path.join(directory, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  return [...journal.entries]
    .sort((left, right) => left.idx - right.idx)
    .flatMap((entry) =>
      readFileSync(path.join(directory, `${entry.tag}.sql`), "utf8").split(
        "--> statement-breakpoint",
      ),
    )
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
