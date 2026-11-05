import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openS3ObjectStore } from "../packages/adapters/src/s3-object-store.ts";
import { openCompose, runCommand, writeHostRestoreScript } from "./compose-transfer.ts";
import {
  bundleArchivePath,
  exportBundle,
  importBundle,
  isBundleArchive,
  migrationsFromJournal,
  packBundle,
  parseDatabaseUrl,
  parseTransferArgs,
  pgRestoreSqlArgs,
  sha256Bytes,
  TransferError,
  unpackBundle,
  type JournalFile,
  type MigrationRecord,
  type RemoteIO,
} from "./data-transfer.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type SqlClient = {
  unsafe(query: string): Promise<readonly Record<string, unknown>[]>;
  end(): Promise<void>;
};

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new TransferError(`${name} is required`);
  }
  return value;
}

function loadJournal(): MigrationRecord[] {
  const directory = path.join(root, "packages/db/migrations");
  const journal = JSON.parse(
    readFileSync(path.join(directory, "meta/_journal.json"), "utf8"),
  ) as JournalFile;
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new TransferError("migration journal is empty");
  }
  return migrationsFromJournal(journal, (tag) =>
    readFileSync(path.join(directory, `${tag}.sql`), "utf8"),
  );
}

function openHostSql(databaseUrl: string): {
  query(sql: string): Promise<readonly Record<string, unknown>[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
} {
  const require = createRequire(path.join(root, "packages/adapters/package.json"));
  const postgres = require("postgres") as (url: string, options: { max: number }) => SqlClient;
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    query: (text) => sql.unsafe(text),
    exec: async (text) => {
      await sql.unsafe(text);
    },
    close: () => sql.end(),
  };
}

async function assertPgDump(secrets: readonly string[]): Promise<void> {
  let version = "";
  try {
    version = await runCommand("pg_dump", ["--version"], { secrets });
  } catch {
    throw new TransferError(
      "pg_dump 18 is not on PATH. Install the PostgreSQL 18 client, or rerun with --via compose --compose compose.dev.yaml",
    );
  }
  if (!/\b18\b/.test(version)) {
    throw new TransferError(`pg_dump must be PostgreSQL 18, found: ${version.trim()}`);
  }
}

async function restoreOnHost(
  file: string,
  replace: boolean,
  env: NodeJS.ProcessEnv,
  secrets: readonly string[],
): Promise<void> {
  const scratch = await mkdtemp(path.join(tmpdir(), "oneself-restore-"));
  try {
    const sqlPath = path.join(scratch, "restore.sql");
    const scriptPath = path.join(scratch, "script.sql");
    await runCommand("pg_restore", pgRestoreSqlArgs(file), {
      env,
      stdoutPath: sqlPath,
      secrets,
    });
    await writeHostRestoreScript(sqlPath, scriptPath, replace);
    await runCommand("psql", ["-v", "ON_ERROR_STOP=1", "--no-psqlrc", "-f", scriptPath], {
      env,
      secrets,
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function hostEnv(databaseUrl: string): { env: NodeJS.ProcessEnv; secrets: string[] } {
  const target = parseDatabaseUrl(databaseUrl);
  return {
    env: {
      ...process.env,
      PGHOST: target.host,
      PGPORT: target.port,
      PGUSER: target.user,
      PGPASSWORD: target.password,
      PGDATABASE: target.database,
    },
    secrets: [target.password, process.env.OBJECT_STORAGE_SECRET_KEY ?? ""].filter(
      (secret) => secret.length > 0,
    ),
  };
}

async function openHost(
  databaseUrl: string,
): Promise<{ io: RemoteIO; close: () => Promise<void> }> {
  const { env, secrets } = hostEnv(databaseUrl);
  await assertPgDump(secrets);
  const sql = openHostSql(databaseUrl);
  const store = openS3ObjectStore({
    endpoint: required("OBJECT_STORAGE_ENDPOINT"),
    region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
    bucket: process.env.OBJECT_STORAGE_BUCKET ?? "oneself",
    accessKeyId: required("OBJECT_STORAGE_ACCESS_KEY"),
    secretAccessKey: required("OBJECT_STORAGE_SECRET_KEY"),
  });
  const io: RemoteIO = {
    query: (text) => sql.query(text),
    exec: (text) => sql.exec(text),
    dumpTo: (file) =>
      runCommand(
        "pg_dump",
        [
          "--format=custom",
          "--data-only",
          "--no-owner",
          "--no-privileges",
          "--schema=public",
          "--file",
          file,
        ],
        { env, secrets },
      ).then(() => undefined),
    restoreFrom: (file, options) => restoreOnHost(file, options.replace, env, secrets),
    list: async () =>
      (await store.list("")).map((item) => ({ key: item.key, byteSize: item.byteSize })),
    get: async (key) => (await store.get(key))?.body ?? null,
    put: async (key, body) => {
      const existing = await store.get(key);
      if (existing !== null && sha256Bytes(existing.body) !== sha256Bytes(body)) {
        throw new TransferError(`object ${key} differs from the bundle`);
      }
      if (existing === null) {
        const created = await store.put(key, body);
        if (!created.created) {
          const again = await store.get(key);
          if (again === null || sha256Bytes(again.body) !== sha256Bytes(body)) {
            throw new TransferError(`object ${key} differs from the bundle`);
          }
        }
      }
    },
    delete: (key) => store.delete(key),
    flush: () => Promise.resolve(),
  };
  return { io, close: () => sql.close() };
}

async function main(): Promise<void> {
  const args = parseTransferArgs(process.argv.slice(2));
  const journal = loadJournal();
  const opened =
    args.via === "host"
      ? await openHost(required("DATABASE_URL"))
      : await openCompose(args.composeFile, { cwd: root });
  try {
    if (args.command === "export") {
      const archive = bundleArchivePath(args.directory);
      const staging = await mkdtemp(path.join(tmpdir(), "oneself-export-"));
      try {
        const manifest = await exportBundle(opened.io, staging, {
          stopped: args.stopped,
          journal,
          now: new Date().toISOString(),
        });
        await packBundle(staging, archive);
        console.error(
          `wrote ${path.resolve(archive)} (${manifest.objects.count} objects, ${manifest.objects.bytes} bytes)`,
        );
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
      console.error("The bundle contains password hashes and key hashes. Do not commit it.");
      console.error(
        "Sessions, device codes, PUBLIC_ORIGIN, and storage credentials were not exported.",
      );
      return;
    }
    const archive = isBundleArchive(args.directory) ? args.directory : null;
    let extracted: string | null = null;
    try {
      if (archive !== null) {
        extracted = await mkdtemp(path.join(tmpdir(), "oneself-import-"));
        await unpackBundle(archive, extracted);
      }
      await importBundle(opened.io, extracted ?? args.directory, {
        stopped: args.stopped,
        replace: args.replace,
        journal,
        now: new Date().toISOString(),
        log: (message) => {
          console.error(message);
        },
      });
    } finally {
      if (extracted !== null) {
        await rm(extracted, { recursive: true, force: true });
      }
    }
    console.error("Log in with the previous owner password. API keys you still hold keep working.");
    console.error(
      "Point agents at the new PUBLIC_ORIGIN. Sessions and device codes must be issued again.",
    );
  } finally {
    await opened.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof TransferError) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error("transfer failed");
  }
  process.exit(1);
});
