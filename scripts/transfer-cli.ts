import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { finished, pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { openS3ObjectStore } from "../packages/adapters/src/s3-object-store.ts";
import {
  bundleArchivePath,
  exportBundle,
  importBundle,
  isBundleArchive,
  migrationsFromJournal,
  packBundle,
  parseDatabaseUrl,
  parseTransferArgs,
  redactSecrets,
  restoreTransactionSql,
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

type RunOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly stdoutPath?: string;
  readonly stdinPath?: string;
  readonly secrets: readonly string[];
  readonly cwd?: string;
};

function runCommand(
  command: string,
  args: readonly string[],
  options: RunOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const writer =
      options.stdoutPath === undefined ? undefined : createWriteStream(options.stdoutPath);
    if (writer === undefined) {
      child.stdout.on("data", (chunk: Buffer) => {
        stdout.push(chunk);
      });
    } else {
      child.stdout.pipe(writer);
    }
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    if (options.stdinPath === undefined) {
      child.stdin.end();
    } else {
      createReadStream(options.stdinPath).pipe(child.stdin);
    }
    child.on("error", (error) => {
      reject(new TransferError(redactSecrets(error.message, options.secrets)));
    });
    child.on("close", (code) => {
      const message = redactSecrets(Buffer.concat(stderr).toString("utf8"), options.secrets).trim();
      const finish = () => {
        if (code !== 0) {
          reject(
            new TransferError(message.slice(0, 4000) || `${command} exited ${code ?? "unknown"}`),
          );
          return;
        }
        resolve(Buffer.concat(stdout).toString("utf8"));
      };
      if (writer === undefined) {
        finish();
        return;
      }
      finished(writer).then(finish, (error: unknown) => {
        const text = error instanceof Error ? error.message : "failed to write command output";
        reject(new TransferError(redactSecrets(text, options.secrets)));
      });
    });
  });
}

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

const PG_RESTORE_SQL_ARGS = [
  "--data-only",
  "--disable-triggers",
  "--no-owner",
  "--no-privileges",
] as const;

async function writeRestoreScript(
  restoreSqlPath: string,
  scriptPath: string,
  replace: boolean,
): Promise<void> {
  const parts = restoreTransactionSql(replace);
  await writeFile(scriptPath, parts.header, { mode: 0o600 });
  await pipeline(createReadStream(restoreSqlPath), createWriteStream(scriptPath, { flags: "a" }));
  await appendFile(scriptPath, parts.footer);
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
    await runCommand("pg_restore", [...PG_RESTORE_SQL_ARGS, "--file=-", file], {
      env,
      stdoutPath: sqlPath,
      secrets,
    });
    await writeRestoreScript(sqlPath, scriptPath, replace);
    await runCommand("psql", ["-v", "ON_ERROR_STOP=1", "--no-psqlrc", "-f", scriptPath], {
      env,
      secrets,
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function restoreInCompose(
  composeFile: string,
  file: string,
  replace: boolean,
  secrets: readonly string[],
): Promise<void> {
  // Custom format needs a seekable file. Copy it in; do not pipe the archive on stdin.
  const remote = `/tmp/oneself-restore-${process.pid.toString(10)}-${randomBytes(4).toString("hex")}.dump`;
  await runCommand("docker", ["compose", "-f", composeFile, "cp", file, `postgres:${remote}`], {
    secrets,
  });
  let restoreError: unknown;
  try {
    const scratch = await mkdtemp(path.join(tmpdir(), "oneself-restore-"));
    try {
      const sqlPath = path.join(scratch, "restore.sql");
      const scriptPath = path.join(scratch, "script.sql");
      await runCommand(
        "docker",
        [
          "compose",
          "-f",
          composeFile,
          "exec",
          "-T",
          "-u",
          "root",
          "postgres",
          "pg_restore",
          ...PG_RESTORE_SQL_ARGS,
          remote,
        ],
        { stdoutPath: sqlPath, secrets },
      );
      await writeRestoreScript(sqlPath, scriptPath, replace);
      await runCommand(
        "docker",
        [
          "compose",
          "-f",
          composeFile,
          "exec",
          "-T",
          "postgres",
          "psql",
          "-U",
          "oneself",
          "-d",
          "oneself",
          "-v",
          "ON_ERROR_STOP=1",
          "--no-psqlrc",
          "-f",
          "-",
        ],
        { stdinPath: scriptPath, secrets },
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  } catch (error) {
    restoreError = error;
  } finally {
    try {
      await runCommand(
        "docker",
        ["compose", "-f", composeFile, "exec", "-T", "-u", "root", "postgres", "rm", "-f", remote],
        { secrets },
      );
    } catch (error) {
      restoreError ??= error;
    }
  }
  if (restoreError instanceof Error) {
    throw restoreError;
  }
  if (restoreError !== undefined) {
    throw new TransferError("restore failed");
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

function composeSecrets(): string[] {
  return [
    process.env.POSTGRES_PASSWORD ?? "",
    process.env.RUSTFS_SECRET_KEY ?? "",
    process.env.OBJECT_STORAGE_SECRET_KEY ?? "",
  ].filter((secret) => secret.length > 0);
}

async function assertComposeAppStopped(
  composeFile: string,
  secrets: readonly string[],
): Promise<void> {
  const services = await runCommand(
    "docker",
    ["compose", "-f", composeFile, "ps", "--status", "running", "--services"],
    { secrets },
  );
  if (
    services
      .split("\n")
      .map((line) => line.trim())
      .includes("app")
  ) {
    throw new TransferError("the app service is running; stop it before export or import");
  }
}

async function composeSql(
  composeFile: string,
  sql: string,
  secrets: readonly string[],
  wrap: boolean,
): Promise<string> {
  const statement = wrap
    ? `select coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (${sql}) t`
    : sql;
  return runCommand(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "oneself",
      "-d",
      "oneself",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      statement,
    ],
    { secrets },
  );
}

class ComposeObjects {
  readonly #composeFile: string;
  readonly #secrets: readonly string[];
  readonly #objectsDir: string;
  readonly #controlDir: string;
  readonly #puts = new Map<string, Uint8Array>();
  readonly #deletes = new Set<string>();
  #downloaded = false;

  constructor(composeFile: string, secrets: readonly string[], cache: string) {
    this.#composeFile = composeFile;
    this.#secrets = secrets;
    this.#objectsDir = path.join(cache, "objects");
    this.#controlDir = path.join(cache, "control");
  }

  async list(): Promise<readonly { key: string; byteSize: number }[]> {
    await this.#syncDown();
    return walkFiles(this.#objectsDir);
  }

  async get(key: string): Promise<Uint8Array | null> {
    await this.#syncDown();
    try {
      return await readBytes(path.join(this.#objectsDir, ...key.split("/")));
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async put(key: string, body: Uint8Array): Promise<void> {
    if (!this.#deletes.has(key)) {
      const existing = await this.get(key);
      if (existing !== null && sha256Bytes(existing) !== sha256Bytes(body)) {
        throw new TransferError(`object ${key} differs from the bundle`);
      }
    }
    this.#puts.set(key, body);
  }

  delete(key: string): Promise<void> {
    this.#deletes.add(key);
    this.#puts.delete(key);
    return Promise.resolve();
  }

  async flush(): Promise<void> {
    if (this.#deletes.size === 0 && this.#puts.size === 0) {
      return;
    }
    const control = this.#controlDir;
    const staging = path.join(control, "puts");
    await rm(control, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    const deleteList = [...this.#deletes].join("\n");
    await writeFile(
      path.join(control, "deletes.txt"),
      deleteList.length === 0 ? "" : `${deleteList}\n`,
    );
    for (const [key, body] of this.#puts) {
      const target = path.join(staging, ...key.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    }
    const script = [
      "if [ -s /control/deletes.txt ]; then",
      "  while IFS= read -r key; do",
      '    aws s3api delete-object --bucket "$OBJECT_STORAGE_BUCKET" --key "$key" --endpoint-url http://rustfs:9000',
      "  done < /control/deletes.txt",
      "fi",
      'if [ -n "$(find /puts -type f -print -quit)" ]; then',
      '  aws s3 cp /puts "s3://$OBJECT_STORAGE_BUCKET" --recursive --endpoint-url http://rustfs:9000',
      "fi",
    ].join("\n");
    await this.#aws(script, [`${control}:/control:ro`, `${staging}:/puts:ro`]);
    this.#deletes.clear();
    this.#puts.clear();
    this.#downloaded = false;
  }

  async #syncDown(): Promise<void> {
    if (this.#downloaded) {
      return;
    }
    await rm(this.#objectsDir, { recursive: true, force: true });
    await mkdir(this.#objectsDir, { recursive: true });
    await this.#aws(
      'aws s3 sync "s3://$OBJECT_STORAGE_BUCKET" /cache --endpoint-url http://rustfs:9000 && { chmod -R a+rX /cache || true; }',
      [`${this.#objectsDir}:/cache`],
    );
    this.#downloaded = true;
  }

  #aws(script: string, mounts: readonly string[]): Promise<string> {
    return runCommand(
      "docker",
      [
        "compose",
        "-f",
        this.#composeFile,
        "run",
        "--rm",
        "-T",
        "--no-deps",
        "--entrypoint",
        "/bin/sh",
        ...mounts.flatMap((mount) => ["-v", mount]),
        "-e",
        "AWS_REQUEST_CHECKSUM_CALCULATION=when_required",
        "-e",
        "AWS_RESPONSE_CHECKSUM_VALIDATION=when_required",
        "rustfs-init",
        "-c",
        script,
      ],
      { secrets: this.#secrets },
    );
  }
}

async function walkFiles(directory: string): Promise<{ key: string; byteSize: number }[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true, recursive: true });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const found: { key: string; byteSize: number }[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const absolute = path.join(entry.parentPath, entry.name);
    const key = path.relative(directory, absolute).split(path.sep).join("/");
    const info = await stat(absolute);
    found.push({ key, byteSize: info.size });
  }
  return found;
}

function readBytes(file: string): Promise<Uint8Array> {
  return readFile(file);
}

async function openCompose(
  composeFile: string,
): Promise<{ io: RemoteIO; close: () => Promise<void> }> {
  const secrets = composeSecrets();
  await assertComposeAppStopped(composeFile, secrets);
  const cache = path.join(tmpdir(), `oneself-transfer-${process.pid}`);
  const objects = new ComposeObjects(composeFile, secrets, cache);
  const io: RemoteIO = {
    query: async (sql) => {
      const output = await composeSql(composeFile, sql, secrets, true);
      const parsed = JSON.parse(output.trim()) as unknown;
      if (!Array.isArray(parsed)) {
        throw new TransferError("psql did not return a JSON array");
      }
      return parsed as Record<string, unknown>[];
    },
    exec: async (sql) => {
      await composeSql(composeFile, sql, secrets, false);
    },
    dumpTo: (file) =>
      runCommand(
        "docker",
        [
          "compose",
          "-f",
          composeFile,
          "exec",
          "-T",
          "postgres",
          "pg_dump",
          "-U",
          "oneself",
          "-d",
          "oneself",
          "--format=custom",
          "--data-only",
          "--no-owner",
          "--no-privileges",
          "--schema=public",
        ],
        { stdoutPath: file, secrets },
      ).then(() => undefined),
    restoreFrom: (file, options) => restoreInCompose(composeFile, file, options.replace, secrets),
    list: () => objects.list(),
    get: (key) => objects.get(key),
    put: (key, body) => objects.put(key, body),
    delete: (key) => objects.delete(key),
    flush: () => objects.flush(),
  };
  return {
    io,
    close: () => rm(cache, { recursive: true, force: true }),
  };
}

async function main(): Promise<void> {
  const args = parseTransferArgs(process.argv.slice(2));
  const journal = loadJournal();
  const opened =
    args.via === "host"
      ? await openHost(required("DATABASE_URL"))
      : await openCompose(args.composeFile);
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
