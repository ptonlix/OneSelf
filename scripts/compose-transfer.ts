import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
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
import { tmpdir } from "node:os";
import path from "node:path";
import { finished, pipeline } from "node:stream/promises";

import {
  migrationsFromJournal,
  pgRestoreSqlArgs,
  redactSecrets,
  restoreTransactionSql,
  sha256Bytes,
  TransferError,
  type JournalFile,
  type MigrationRecord,
  type RemoteIO,
} from "./data-transfer.ts";

export type CommandRunOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly stdoutPath?: string;
  readonly stdinPath?: string;
  readonly secrets: readonly string[];
  readonly cwd?: string;
};

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: CommandRunOptions,
) => Promise<string>;

/** Compose invocation. Never publishes ports and never includes `down`. */
export function composeArgs(composeFile: string, args: readonly string[]): string[] {
  return ["compose", "-f", composeFile, ...args];
}

export function refusesPublishedDatabasePorts(args: readonly string[]): boolean {
  return (
    args.includes("down") ||
    args.includes("--service-ports") ||
    args.includes("--publish") ||
    args.includes("-p") ||
    args.some((arg) => arg.startsWith("--publish="))
  );
}

/** pg_dump inside the postgres container. The public schema includes the owner table. */
export function postgresDumpArgs(): readonly string[] {
  return [
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
  ];
}

const APP_JOURNAL_SCRIPT = `
import { readFileSync } from "node:fs";
import path from "node:path";
const directory = "/app/packages/db/migrations";
const journal = JSON.parse(readFileSync(path.join(directory, "meta/_journal.json"), "utf8"));
if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
  throw new Error("migration journal is empty");
}
const entries = journal.entries.map((entry) => ({
  tag: entry.tag,
  when: entry.when,
  sql: readFileSync(path.join(directory, String(entry.tag) + ".sql"), "utf8"),
}));
process.stdout.write(JSON.stringify({ entries }));
`.trim();

/** One-off app container. `--no-deps` keeps postgres down; no `--service-ports`. */
export function appJournalArgs(): readonly string[] {
  return [
    "run",
    "--rm",
    "--no-deps",
    "--entrypoint",
    "node",
    "app",
    "--input-type=module",
    "-e",
    APP_JOURNAL_SCRIPT,
  ];
}

export function journalFromImageOutput(output: string): MigrationRecord[] {
  const parsed = JSON.parse(output) as unknown;
  if (typeof parsed !== "object" || parsed === null || !("entries" in parsed)) {
    throw new TransferError("app image did not return a migration journal");
  }
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TransferError("app image journal is empty");
  }
  const sql = new Map<string, string>();
  const journal: JournalFile = {
    entries: entries.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new TransferError(`app image journal entry ${index} is not an object`);
      }
      const record = entry as { tag?: unknown; when?: unknown; sql?: unknown };
      if (typeof record.tag !== "string" || record.tag.length === 0) {
        throw new TransferError(`app image journal entry ${index} has no tag`);
      }
      if (typeof record.when !== "number" || !Number.isSafeInteger(record.when)) {
        throw new TransferError(`app image journal entry ${index} has no timestamp`);
      }
      if (typeof record.sql !== "string") {
        throw new TransferError(`app image journal entry ${index} has no sql`);
      }
      sql.set(record.tag, record.sql);
      return { tag: record.tag, when: record.when };
    }),
  };
  return migrationsFromJournal(journal, (tag) => {
    const body = sql.get(tag);
    if (body === undefined) {
      throw new TransferError(`app image journal is missing ${tag}`);
    }
    return body;
  });
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: CommandRunOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
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
      const finish = (): void => {
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

export function composeSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    env.POSTGRES_PASSWORD ?? "",
    env.RUSTFS_SECRET_KEY ?? "",
    env.OBJECT_STORAGE_SECRET_KEY ?? "",
  ].filter((secret) => secret.length > 0);
}

export async function listRunningServices(
  composeFile: string,
  runner: CommandRunner,
  secrets: readonly string[],
  cwd?: string,
): Promise<string[]> {
  const services = await runner(
    "docker",
    composeArgs(composeFile, ["ps", "--status", "running", "--services"]),
    { secrets, ...(cwd === undefined ? {} : { cwd }) },
  );
  return services
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function readJournalFromAppImage(
  composeFile: string,
  runner: CommandRunner,
  secrets: readonly string[],
  cwd?: string,
): Promise<MigrationRecord[]> {
  const output = await runner("docker", composeArgs(composeFile, appJournalArgs()), {
    secrets,
    ...(cwd === undefined ? {} : { cwd }),
  });
  return journalFromImageOutput(output);
}

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

async function restoreInCompose(
  composeFile: string,
  file: string,
  replace: boolean,
  secrets: readonly string[],
  runner: CommandRunner,
  cwd?: string,
): Promise<void> {
  const remote = `/tmp/oneself-restore-${process.pid.toString(10)}-${randomBytes(4).toString("hex")}.dump`;
  const run = (args: readonly string[], extra: Partial<CommandRunOptions> = {}): Promise<string> =>
    runner("docker", composeArgs(composeFile, args), {
      secrets,
      ...(cwd === undefined ? {} : { cwd }),
      ...extra,
    });
  await run(["cp", file, `postgres:${remote}`]);
  let restoreError: unknown;
  try {
    const scratch = await mkdtemp(path.join(tmpdir(), "oneself-restore-"));
    try {
      const sqlPath = path.join(scratch, "restore.sql");
      const scriptPath = path.join(scratch, "script.sql");
      await run(
        ["exec", "-T", "-u", "root", "postgres", "pg_restore", ...pgRestoreSqlArgs(remote)],
        { stdoutPath: sqlPath },
      );
      await writeRestoreScript(sqlPath, scriptPath, replace);
      await run(
        [
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
        { stdinPath: scriptPath },
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  } catch (error) {
    restoreError = error;
  } finally {
    try {
      await run(["exec", "-T", "-u", "root", "postgres", "rm", "-f", remote]);
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

async function composeSql(
  composeFile: string,
  sql: string,
  secrets: readonly string[],
  wrap: boolean,
  runner: CommandRunner,
  cwd?: string,
): Promise<string> {
  const statement = wrap
    ? `select coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (${sql}) t`
    : sql;
  return runner(
    "docker",
    composeArgs(composeFile, [
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
    ]),
    { secrets, ...(cwd === undefined ? {} : { cwd }) },
  );
}

class ComposeObjects {
  readonly #composeFile: string;
  readonly #secrets: readonly string[];
  readonly #runner: CommandRunner;
  readonly #cwd: string | undefined;
  readonly #objectsDir: string;
  readonly #controlDir: string;
  readonly #puts = new Map<string, Uint8Array>();
  readonly #deletes = new Set<string>();
  #downloaded = false;

  constructor(
    composeFile: string,
    secrets: readonly string[],
    cache: string,
    runner: CommandRunner,
    cwd?: string,
  ) {
    this.#composeFile = composeFile;
    this.#secrets = secrets;
    this.#runner = runner;
    this.#cwd = cwd;
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
      return await readFile(path.join(this.#objectsDir, ...key.split("/")));
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
    return this.#runner(
      "docker",
      composeArgs(this.#composeFile, [
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
      ]),
      {
        secrets: this.#secrets,
        ...(this.#cwd === undefined ? {} : { cwd: this.#cwd }),
      },
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

export type ComposeIoOptions = {
  readonly runner?: CommandRunner;
  readonly secrets?: readonly string[];
  readonly cwd?: string;
};

export async function openCompose(
  composeFile: string,
  options: ComposeIoOptions = {},
): Promise<{ io: RemoteIO; close: () => Promise<void> }> {
  const runner = options.runner ?? runCommand;
  const secrets = options.secrets ?? composeSecrets();
  const cwd = options.cwd;
  const running = await listRunningServices(composeFile, runner, secrets, cwd);
  if (running.includes("app")) {
    throw new TransferError("the app service is running; stop it before export or import");
  }
  const cache = path.join(tmpdir(), `oneself-transfer-${process.pid.toString(10)}`);
  const objects = new ComposeObjects(composeFile, secrets, cache, runner, cwd);
  const io: RemoteIO = {
    query: async (sql) => {
      const output = await composeSql(composeFile, sql, secrets, true, runner, cwd);
      const parsed = JSON.parse(output.trim()) as unknown;
      if (!Array.isArray(parsed)) {
        throw new TransferError("psql did not return a JSON array");
      }
      return parsed as Record<string, unknown>[];
    },
    exec: async (sql) => {
      await composeSql(composeFile, sql, secrets, false, runner, cwd);
    },
    dumpTo: (file) =>
      runner("docker", composeArgs(composeFile, postgresDumpArgs()), {
        stdoutPath: file,
        secrets,
        ...(cwd === undefined ? {} : { cwd }),
      }).then(() => undefined),
    restoreFrom: (file, restore) =>
      restoreInCompose(composeFile, file, restore.replace, secrets, runner, cwd),
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

export async function writeHostRestoreScript(
  restoreSqlPath: string,
  scriptPath: string,
  replace: boolean,
): Promise<void> {
  await writeRestoreScript(restoreSqlPath, scriptPath, replace);
}
