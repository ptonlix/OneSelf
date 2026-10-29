import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const BUNDLE_FORMAT = 1;

/** Object keys the application writes. Anything else is not part of a move. */
const OBJECT_PREFIXES = ["pages/", "files/", "sites/"] as const;

/**
 * Public tables that hold recoverable state.
 * `page_versions.id` is an identity column; the dump and a following setval keep it.
 */
export const DATA_TABLES = [
  "sources",
  "pages",
  "page_versions",
  "files",
  "chunks",
  "links",
  "tags",
  "facts",
  "timeline_entries",
  "site_releases",
  "site_files",
  "site_pointers",
  "site_activations",
  "owners",
  "api_keys",
  "api_key_requests",
  "oauth_grants",
] as const;

export type DataTable = (typeof DATA_TABLES)[number];

export type MigrationRecord = {
  readonly tag: string;
  readonly hash: string;
  readonly created_at: number;
};

export type ObjectRecord = {
  readonly key: string;
  readonly sha256: string;
  readonly bytes: number;
};

export type Reference = {
  readonly key: string;
  readonly sha256: string | null;
};

export type Manifest = {
  readonly format: number;
  readonly created_at: string;
  readonly migrations: readonly MigrationRecord[];
  readonly tables: Readonly<Record<DataTable, number>>;
  readonly objects: {
    readonly count: number;
    readonly bytes: number;
  };
};

export type JournalFile = {
  readonly entries: readonly {
    readonly tag: string;
    readonly when: number;
  }[];
};

export type RemoteIO = {
  query(sql: string): Promise<readonly Record<string, unknown>[]>;
  exec(sql: string): Promise<void>;
  dumpTo(file: string): Promise<void>;
  /**
   * Loads a custom-format dump from a seekable file in one transaction.
   * Truncate runs inside that transaction only when replacing, never before it.
   */
  restoreFrom(file: string, options: { readonly replace: boolean }): Promise<void>;
  list(): Promise<readonly { readonly key: string; readonly byteSize: number }[]>;
  get(key: string): Promise<Uint8Array | null>;
  /** Stores these exact bytes. Throws when the key exists with different bytes. */
  put(key: string, body: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  /** Finishes batched object writes. Host mode has nothing to flush. */
  flush(): Promise<void>;
};

export class TransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferError";
  }
}

export const MIGRATION_SQL =
  "select hash, created_at from drizzle.__drizzle_migrations order by created_at asc, id asc";

export const REFERENCE_SQL = `
select object_key, content_hash as sha256 from pages
union all
select object_key, content_hash from page_versions
union all
select object_key, sha256 from files
union all
select object_key, null::text from site_files
`.trim();

export const COUNT_SQL = `select ${DATA_TABLES.map(
  (table) => `(select count(*) from ${table}) as ${table}`,
).join(", ")}`;

export const TRUNCATE_SQL = `truncate table ${DATA_TABLES.join(", ")} restart identity cascade`;

/**
 * Identity dumps do not always advance the sequence the next insert expects.
 * `is_called` is false only when the table is empty, so the next id is 1.
 */
export const SETVAL_SQL = `
select setval(
  'page_versions_id_seq',
  (select coalesce(max(id), 1) from page_versions),
  (select exists(select 1 from page_versions))
)
`.trim();

/**
 * PostgreSQL 18 will not write SQL to stdout unless --file=- is set.
 * The archive must stay a seekable file argument, not stdin.
 */
export function pgRestoreSqlArgs(archive: string): readonly string[] {
  return [
    "--data-only",
    "--disable-triggers",
    "--no-owner",
    "--no-privileges",
    "--file=-",
    archive,
  ];
}

/**
 * Header and footer around pg_restore SQL.
 * One transaction so a failed load rolls the wipe back. Truncate only when replacing.
 */
export function restoreTransactionSql(replace: boolean): {
  readonly header: string;
  readonly footer: string;
} {
  return {
    header: replace ? `BEGIN;\n${TRUNCATE_SQL};\n` : "BEGIN;\n",
    footer: `\n${SETVAL_SQL};\nCOMMIT;\n`,
  };
}

const SHA256 = /^[0-9a-f]{64}$/;

export function sha256Bytes(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function migrationHash(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function migrationsFromJournal(
  journal: JournalFile,
  readSql: (tag: string) => string,
): MigrationRecord[] {
  return journal.entries.map((entry) => ({
    tag: entry.tag,
    hash: migrationHash(readSql(entry.tag)),
    created_at: entry.when,
  }));
}

export function isBundleObjectKey(key: string): boolean {
  if (key.includes("\\") || key.includes("\0") || key.startsWith("/") || key.includes("//")) {
    return false;
  }
  const segments = key.split("/");
  if (segments.includes("..") || segments.includes(".")) {
    return false;
  }
  return OBJECT_PREFIXES.some((prefix) => key.startsWith(prefix) && key.length > prefix.length);
}

export function bundleObjectPath(objectsDir: string, key: string): string {
  if (!isBundleObjectKey(key)) {
    throw new TransferError(`refusing object key ${key}`);
  }
  const root = path.resolve(objectsDir);
  const target = path.resolve(root, ...key.split("/"));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new TransferError(`refusing object key ${key}`);
  }
  return target;
}

export function sameMigrations(
  left: readonly MigrationRecord[],
  right: readonly MigrationRecord[],
): string | null {
  if (left.length !== right.length) {
    return `migration count ${left.length} does not match ${right.length}`;
  }
  for (let index = 0; index < left.length; index += 1) {
    const actual = left[index];
    const expected = right[index];
    if (actual === undefined || expected === undefined) {
      return "migration list is missing an entry";
    }
    if (
      actual.tag !== expected.tag ||
      actual.hash !== expected.hash ||
      actual.created_at !== expected.created_at
    ) {
      return `migration ${expected.tag} does not match the target`;
    }
  }
  return null;
}

export function reconcile(
  references: readonly Reference[],
  objects: readonly ObjectRecord[],
): string[] {
  const problems: string[] = [];
  const byKey = new Map<string, ObjectRecord>();
  for (const object of objects) {
    if (!isBundleObjectKey(object.key)) {
      problems.push(`object key ${object.key} is outside pages/, files/, and sites/`);
      continue;
    }
    if (!SHA256.test(object.sha256)) {
      problems.push(`object ${object.key} has no sha256`);
      continue;
    }
    if (byKey.has(object.key)) {
      problems.push(`object ${object.key} is listed twice`);
      continue;
    }
    byKey.set(object.key, object);
  }
  const expectedHash = new Map<string, string>();
  for (const reference of references) {
    if (!isBundleObjectKey(reference.key)) {
      problems.push(`reference ${reference.key} is outside pages/, files/, and sites/`);
      continue;
    }
    const object = byKey.get(reference.key);
    if (object === undefined) {
      problems.push(`missing object ${reference.key}`);
      continue;
    }
    if (reference.sha256 !== null && !SHA256.test(reference.sha256)) {
      problems.push(`reference ${reference.key} has a bad hash`);
      continue;
    }
    if (reference.sha256 !== null && reference.sha256 !== object.sha256) {
      problems.push(`hash mismatch for ${reference.key}`);
    }
    const previous = expectedHash.get(reference.key);
    if (reference.sha256 !== null && previous !== undefined && previous !== reference.sha256) {
      problems.push(`conflicting hashes for ${reference.key}`);
    }
    if (reference.sha256 !== null) {
      expectedHash.set(reference.key, reference.sha256);
    }
  }
  return problems;
}

export function parseDatabaseUrl(value: string): {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
} {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TransferError("DATABASE_URL is not a postgres URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new TransferError("DATABASE_URL is not a postgres URL");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (url.hostname.length === 0 || url.username.length === 0 || database.length === 0) {
    throw new TransferError("DATABASE_URL is missing a host, user, or database");
  }
  if (url.password.length === 0) {
    throw new TransferError("DATABASE_URL is missing a password");
  }
  return {
    host: url.hostname,
    port: url.port.length === 0 ? "5432" : url.port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let redacted = text;
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

type ParsedArgs = {
  readonly command: "export" | "import";
  readonly directory: string;
  readonly stopped: boolean;
  readonly replace: boolean;
  readonly via: "host" | "compose";
  readonly composeFile: string;
};

export function parseTransferArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (command !== "export" && command !== "import") {
    throw new TransferError(
      "usage: data:export -- --out <file> --stopped [--via host|compose] [--compose <file>]\n" +
        "       data:import -- --from <file.tar.gz> --stopped [--replace] [--via host|compose] [--compose <file>]",
    );
  }
  let directory: string | undefined;
  let stopped = false;
  let replace = false;
  let via: "host" | "compose" = "host";
  let composeFile = "compose.yaml";
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === "--") {
      continue;
    }
    if (flag === "--stopped") {
      stopped = true;
      continue;
    }
    if (flag === "--replace") {
      replace = true;
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new TransferError(`missing value for ${flag ?? "argument"}`);
    }
    if (flag === "--out" || flag === "--from") {
      directory = value;
      index += 1;
      continue;
    }
    if (flag === "--via") {
      if (value !== "host" && value !== "compose") {
        throw new TransferError("--via must be host or compose");
      }
      via = value;
      index += 1;
      continue;
    }
    if (flag === "--compose") {
      composeFile = value;
      index += 1;
      continue;
    }
    throw new TransferError(`unknown argument ${flag ?? ""}`);
  }
  if (directory === undefined) {
    throw new TransferError(command === "export" ? "--out is required" : "--from is required");
  }
  if (command === "export" && replace) {
    throw new TransferError("--replace is only valid for import");
  }
  return { command, directory, stopped, replace, via, composeFile };
}

const ARCHIVE_FILES = ["manifest.json", "postgres/oneself.dump", "objects/index.json"] as const;

export function isBundleArchive(file: string): boolean {
  return file.endsWith(".tar.gz") || file.endsWith(".tgz");
}

/** `--out oneself-export` becomes `oneself-export.tar.gz`. An explicit archive name is kept. */
export function bundleArchivePath(out: string): string {
  return isBundleArchive(out) ? out : `${out}.tar.gz`;
}

export function archiveEntryProblem(raw: string): string | null {
  if (raw.startsWith("/") || raw.includes("\\") || raw.includes("\0")) {
    return `refusing archive entry ${raw}`;
  }
  const name = raw.replace(/^\.\//, "");
  const normalized = name.replace(/\/+$/, "");
  if (normalized.length === 0) {
    return null;
  }
  const segments = normalized.split("/");
  if (segments.includes("..") || segments.includes(".")) {
    return `refusing archive entry ${raw}`;
  }
  if (
    normalized === "manifest.json" ||
    normalized === "postgres/oneself.dump" ||
    normalized === "objects/index.json"
  ) {
    return name.endsWith("/") ? `refusing archive entry ${raw}` : null;
  }
  if (
    normalized === "postgres" ||
    normalized === "objects" ||
    normalized === "objects/pages" ||
    normalized === "objects/files" ||
    normalized === "objects/sites"
  ) {
    return null;
  }
  if (
    normalized.startsWith("objects/pages/") ||
    normalized.startsWith("objects/files/") ||
    normalized.startsWith("objects/sites/")
  ) {
    if (name.endsWith("/")) {
      return null;
    }
    return isBundleObjectKey(normalized.slice("objects/".length))
      ? null
      : `refusing archive entry ${raw}`;
  }
  return `refusing archive entry ${raw}`;
}

export function archiveProblems(names: readonly string[]): string | null {
  const files = new Set<string>();
  for (const name of names) {
    const problem = archiveEntryProblem(name);
    if (problem !== null) {
      return problem;
    }
    const normalized = name.replace(/^\.\//, "").replace(/\/+$/, "");
    if (normalized.length > 0 && !name.endsWith("/")) {
      files.add(normalized);
    }
  }
  for (const required of ARCHIVE_FILES) {
    if (!files.has(required)) {
      return `archive is missing ${required}`;
    }
  }
  return null;
}

const GNU_LISTING_DATE = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?(?: [+-]\d{4})?/;
const BSD_LISTING_DATE = /[A-Z][a-z]{2}\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})/;

function listingDate(header: string): RegExpExecArray | null {
  const gnu = GNU_LISTING_DATE.exec(header);
  const bsd = BSD_LISTING_DATE.exec(header);
  if (gnu !== null && (bsd === null || gnu.index <= bsd.index)) {
    return gnu;
  }
  return bsd;
}

function parseArchiveListing(
  line: string,
): { readonly type: string; readonly name: string } | null {
  if (line.length < 11) {
    return null;
  }
  const type = line[0];
  if (type === undefined) {
    return null;
  }
  const header = line.slice(10);
  const match = listingDate(header);
  if (match === null) {
    return null;
  }
  const stamp = match[0];
  let name = header.slice(match.index + stamp.length).trimStart();
  if (type === "l" || type === "h") {
    const arrow = name.indexOf(" -> ");
    if (arrow >= 0) {
      name = name.slice(0, arrow);
    }
  }
  if (name.length === 0) {
    return null;
  }
  return { type, name };
}

/** Refuses symlink and other non-regular members. The link target is not part of the message. */
export function archiveListingProblem(line: string): string | null {
  const trimmed = line.replace(/\r$/, "");
  if (trimmed.trim().length === 0) {
    return null;
  }
  const type = trimmed[0];
  const parsed = parseArchiveListing(trimmed);
  if (type !== "-" && type !== "d") {
    const name = parsed?.name;
    if (name === undefined || name.length === 0) {
      return "refusing non-regular archive entry";
    }
    return `refusing archive entry ${name}`;
  }
  if (parsed === null) {
    return "refusing archive entry";
  }
  const name = parsed.type === "d" && !parsed.name.endsWith("/") ? `${parsed.name}/` : parsed.name;
  return archiveEntryProblem(name);
}

function archiveListingProblems(lines: readonly string[]): string | null {
  const names: string[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const problem = archiveListingProblem(line);
    if (problem !== null) {
      return problem;
    }
    const parsed = parseArchiveListing(line.replace(/\r$/, ""));
    if (parsed === null || parsed.type !== "-") {
      continue;
    }
    names.push(parsed.name);
  }
  return archiveProblems(names);
}

function runTar(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, {
      env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      reject(new TransferError(error.message));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const message = Buffer.concat(stderr).toString("utf8").trim();
        reject(new TransferError(message.slice(0, 4000) || `tar exited ${code ?? "unknown"}`));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

async function listBundleArchive(archivePath: string): Promise<string[]> {
  const output = await runTar(["-tvzf", path.resolve(archivePath)]);
  return output.split("\n");
}

export async function packBundle(directory: string, archivePath: string): Promise<void> {
  const resolved = path.resolve(archivePath);
  await mkdir(path.dirname(resolved), { recursive: true, mode: 0o700 });
  try {
    await writeFile(resolved, new Uint8Array(), { flag: "wx", mode: 0o600 });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "EEXIST") {
      throw new TransferError(`refusing to overwrite ${resolved}`);
    }
    throw error;
  }
  try {
    await runTar(["-czf", resolved, "-C", directory, "manifest.json", "postgres", "objects"]);
    await chmod(resolved, 0o600);
    const problem = archiveListingProblems(await listBundleArchive(resolved));
    if (problem !== null) {
      throw new TransferError(problem);
    }
  } catch (error) {
    await rm(resolved, { force: true });
    throw error;
  }
}

export async function unpackBundle(archivePath: string, directory: string): Promise<void> {
  const problem = archiveListingProblems(await listBundleArchive(archivePath));
  if (problem !== null) {
    throw new TransferError(problem);
  }
  await ensureEmptyDir(directory);
  await runTar(["-xzf", path.resolve(archivePath), "-C", directory]);
  await chmod(directory, 0o700);
}

/** Creates the directory, or reuses it only when it is already empty. */
async function ensureEmptyDir(directory: string): Promise<void> {
  const resolved = path.resolve(directory);
  await mkdir(path.dirname(resolved), { recursive: true, mode: 0o700 });
  try {
    await mkdir(resolved, { recursive: false, mode: 0o700 });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "EEXIST") {
      throw error;
    }
    const entries = await readdir(resolved);
    if (entries.length > 0) {
      throw new TransferError(`refusing to overwrite ${resolved}`);
    }
  }
  await chmod(resolved, 0o700);
}

type TransferOptions = {
  readonly stopped: boolean;
  readonly journal: readonly MigrationRecord[];
  readonly now: string;
  readonly log?: (message: string) => void;
};

function log(options: TransferOptions, message: string): void {
  options.log?.(message);
}

function assertStopped(stopped: boolean): void {
  if (!stopped) {
    throw new TransferError("stop the app, then pass --stopped");
  }
}

function asInteger(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  throw new TransferError(`${label} is not an integer`);
}

function asText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TransferError(`${label} is missing`);
  }
  return value;
}

async function readMigrations(io: RemoteIO): Promise<MigrationRecord[]> {
  let rows: readonly Record<string, unknown>[];
  try {
    rows = await io.query(MIGRATION_SQL);
  } catch (error) {
    const message = error instanceof Error ? error.message : "migration query failed";
    throw new TransferError(
      `could not read applied migrations (${message}). Run pnpm db:migrate on this database first.`,
    );
  }
  return rows.map((row, index) => ({
    tag: "",
    hash: asText(row.hash, `migration ${index} hash`),
    created_at: asInteger(row.created_at, `migration ${index} created_at`),
  }));
}

function withTags(
  applied: readonly MigrationRecord[],
  expected: readonly MigrationRecord[],
): MigrationRecord[] {
  const mismatch = sameMigrations(
    applied.map((row, index) => ({
      tag: expected[index]?.tag ?? "",
      hash: row.hash,
      created_at: row.created_at,
    })),
    expected,
  );
  if (mismatch !== null) {
    throw new TransferError(`${mismatch}. Run pnpm db:migrate to the same checkout, then retry.`);
  }
  return expected.map((entry) => ({ ...entry }));
}

async function readCounts(io: RemoteIO): Promise<Record<DataTable, number>> {
  const rows = await io.query(COUNT_SQL);
  const row = rows[0];
  if (row === undefined) {
    throw new TransferError("table count query returned no row");
  }
  const counts = {} as Record<DataTable, number>;
  for (const table of DATA_TABLES) {
    counts[table] = asInteger(row[table], table);
  }
  return counts;
}

async function readReferences(io: RemoteIO): Promise<Reference[]> {
  const rows = await io.query(REFERENCE_SQL);
  return rows.map((row, index) => ({
    key: asText(row.object_key, `reference ${index}`),
    sha256: row.sha256 === null ? null : asText(row.sha256, `reference ${index} hash`),
  }));
}

function sameCounts(
  left: Readonly<Record<DataTable, number>>,
  right: Readonly<Record<DataTable, number>>,
): boolean {
  return DATA_TABLES.every((table) => left[table] === right[table]);
}

function sameReferences(left: readonly Reference[], right: readonly Reference[]): boolean {
  const encode = (reference: Reference) => `${reference.key}\0${reference.sha256 ?? ""}`;
  const a = left.map(encode).sort();
  const b = right.map(encode).sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function requireReconcile(
  references: readonly Reference[],
  objects: readonly ObjectRecord[],
): void {
  const problems = reconcile(references, objects);
  if (problems.length > 0) {
    throw new TransferError(problems.slice(0, 8).join("\n"));
  }
}

async function writePrivate(file: string, body: Uint8Array | string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, body, { mode: 0o600 });
  await chmod(file, 0o600);
}

export async function exportBundle(
  io: RemoteIO,
  outDir: string,
  options: TransferOptions,
): Promise<Manifest> {
  assertStopped(options.stopped);
  if (options.journal.length === 0) {
    throw new TransferError("journal has no migrations");
  }
  const resolved = path.resolve(outDir);
  await ensureEmptyDir(resolved);
  try {
    const applied = await readMigrations(io);
    const migrations = withTags(applied, options.journal);
    const countsBefore = await readCounts(io);
    const referencesBefore = await readReferences(io);
    const dumpPath = path.join(resolved, "postgres", "oneself.dump");
    await mkdir(path.dirname(dumpPath), { recursive: true, mode: 0o700 });
    await io.dumpTo(dumpPath);
    await chmod(dumpPath, 0o600);

    const listed = await io.list();
    const foreign = listed.filter((item) => !isBundleObjectKey(item.key));
    if (foreign.length > 0) {
      const sample = foreign[0]?.key ?? "unknown";
      throw new TransferError(
        `refusing to skip ${foreign.length} objects outside pages/, files/, and sites/ (${sample})`,
      );
    }
    const objects: ObjectRecord[] = [];
    for (const item of listed) {
      const body = await io.get(item.key);
      if (body === null) {
        throw new TransferError(`object ${item.key} disappeared during export`);
      }
      if (body.byteLength !== item.byteSize) {
        throw new TransferError(`object ${item.key} size changed during export`);
      }
      const record = {
        key: item.key,
        sha256: sha256Bytes(body),
        bytes: body.byteLength,
      };
      await writePrivate(bundleObjectPath(path.join(resolved, "objects"), item.key), body);
      objects.push(record);
    }
    objects.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));

    const countsAfter = await readCounts(io);
    const referencesAfter = await readReferences(io);
    if (
      !sameCounts(countsBefore, countsAfter) ||
      !sameReferences(referencesBefore, referencesAfter)
    ) {
      throw new TransferError("data changed during export; stop the app and retry");
    }
    requireReconcile(referencesAfter, objects);

    const manifest: Manifest = {
      format: BUNDLE_FORMAT,
      created_at: options.now,
      migrations,
      tables: countsAfter,
      objects: {
        count: objects.length,
        bytes: objects.reduce((sum, object) => sum + object.bytes, 0),
      },
    };
    await writePrivate(
      path.join(resolved, "objects", "index.json"),
      `${JSON.stringify(objects, null, 2)}\n`,
    );
    await writePrivate(
      path.join(resolved, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    log(
      options,
      `exported ${objects.length} objects and ${DATA_TABLES.length} tables to ${resolved}`,
    );
    return manifest;
  } catch (error) {
    await rm(resolved, { recursive: true, force: true });
    throw error;
  }
}

function readManifest(value: unknown): Manifest {
  if (typeof value !== "object" || value === null) {
    throw new TransferError("manifest is not an object");
  }
  const record = value as Record<string, unknown>;
  if (record.format !== BUNDLE_FORMAT) {
    throw new TransferError("manifest format is not supported");
  }
  if (!Array.isArray(record.migrations) || record.migrations.length === 0) {
    throw new TransferError("manifest has no migrations");
  }
  const migrations = record.migrations.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new TransferError(`manifest migration ${index} is not an object`);
    }
    const migration = entry as Record<string, unknown>;
    const hash = asText(migration.hash, `manifest migration ${index} hash`);
    if (!SHA256.test(hash)) {
      throw new TransferError(`manifest migration ${index} hash is not sha256`);
    }
    return {
      tag: asText(migration.tag, `manifest migration ${index} tag`),
      hash,
      created_at: asInteger(migration.created_at, `manifest migration ${index}`),
    };
  });
  if (typeof record.tables !== "object" || record.tables === null) {
    throw new TransferError("manifest tables are missing");
  }
  const tables = {} as Record<DataTable, number>;
  const tableRecord = record.tables as Record<string, unknown>;
  for (const table of DATA_TABLES) {
    tables[table] = asInteger(tableRecord[table], `manifest ${table}`);
  }
  return {
    format: BUNDLE_FORMAT,
    created_at: asText(record.created_at, "manifest created_at"),
    migrations,
    tables,
    objects: { count: 0, bytes: 0 },
  };
}

function readIndex(value: unknown): ObjectRecord[] {
  if (!Array.isArray(value)) {
    throw new TransferError("object index is not an array");
  }
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new TransferError(`object index ${index} is not an object`);
    }
    const object = entry as Record<string, unknown>;
    const key = asText(object.key, `object index ${index} key`);
    const sha256 = asText(object.sha256, `object index ${index} sha256`);
    if (!isBundleObjectKey(key) || !SHA256.test(sha256)) {
      throw new TransferError(`object index ${index} is not a bundle object`);
    }
    return { key, sha256, bytes: asInteger(object.bytes, `object index ${index} bytes`) };
  });
}

async function readRegularFile(file: string, failure: string): Promise<Buffer> {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new TransferError(failure);
    }
    return await readFile(file);
  } catch (error) {
    if (error instanceof TransferError) {
      throw error;
    }
    throw new TransferError(failure);
  }
}

async function readBundle(fromDir: string): Promise<{
  manifest: Manifest;
  objects: ObjectRecord[];
}> {
  const root = path.resolve(fromDir);
  const incomplete = `bundle ${root} is incomplete`;
  let manifestJson: unknown;
  let indexJson: unknown;
  try {
    const manifestBody = await readRegularFile(path.join(root, "manifest.json"), incomplete);
    const indexBody = await readRegularFile(path.join(root, "objects", "index.json"), incomplete);
    manifestJson = JSON.parse(manifestBody.toString("utf8")) as unknown;
    indexJson = JSON.parse(indexBody.toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof TransferError) {
      throw error;
    }
    throw new TransferError(incomplete);
  }
  const manifest = readManifest(manifestJson);
  const objects = readIndex(indexJson);
  const dumpPath = path.join(root, "postgres", "oneself.dump");
  const missingDump = `bundle ${root} is missing postgres/oneself.dump`;
  try {
    const info = await lstat(dumpPath);
    if (info.isSymbolicLink() || !info.isFile() || info.size === 0) {
      throw new TransferError(missingDump);
    }
  } catch (error) {
    if (error instanceof TransferError) {
      throw error;
    }
    throw new TransferError(missingDump);
  }
  for (const object of objects) {
    const failure = `bundle object ${object.key} does not match the index`;
    const body = await readRegularFile(
      bundleObjectPath(path.join(root, "objects"), object.key),
      failure,
    );
    if (body.byteLength !== object.bytes || sha256Bytes(body) !== object.sha256) {
      throw new TransferError(failure);
    }
  }
  return { manifest, objects };
}

const REFERENCE_TABLES = ["pages", "page_versions", "files", "site_files"] as const;

function databaseMatchesManifest(
  counts: Readonly<Record<DataTable, number>>,
  references: readonly Reference[],
  manifest: Manifest,
  objects: readonly ObjectRecord[],
): boolean {
  if (!sameCounts(counts, manifest.tables)) {
    return false;
  }
  const expectedReferences = REFERENCE_TABLES.reduce((sum, table) => sum + counts[table], 0);
  if (references.length !== expectedReferences) {
    return false;
  }
  return reconcile(references, objects).length === 0;
}

async function uploadObjects(
  io: RemoteIO,
  fromDir: string,
  objects: readonly ObjectRecord[],
): Promise<void> {
  for (const object of objects) {
    const body = new Uint8Array(
      await readRegularFile(
        bundleObjectPath(path.join(fromDir, "objects"), object.key),
        `bundle object ${object.key} does not match the index`,
      ),
    );
    await io.put(object.key, body);
  }
}

async function verifyRemote(
  io: RemoteIO,
  references: readonly Reference[],
  objects: readonly ObjectRecord[],
): Promise<void> {
  requireReconcile(references, objects);
  const needed = new Set(references.map((reference) => reference.key));
  for (const object of objects) {
    if (!needed.has(object.key)) {
      continue;
    }
    const body = await io.get(object.key);
    if (body === null || sha256Bytes(body) !== object.sha256) {
      throw new TransferError(`remote object ${object.key} does not match the bundle`);
    }
  }
}

export async function importBundle(
  io: RemoteIO,
  fromDir: string,
  options: TransferOptions & { readonly replace: boolean },
): Promise<Manifest> {
  assertStopped(options.stopped);
  const { manifest, objects } = await readBundle(fromDir);
  const journalMismatch = sameMigrations(manifest.migrations, options.journal);
  if (journalMismatch !== null) {
    throw new TransferError(
      `${journalMismatch}. Check out the export revision, or migrate that revision before importing.`,
    );
  }
  const applied = await readMigrations(io);
  withTags(applied, manifest.migrations);

  const listed = await io.list();
  const foreign = listed.filter((item) => !isBundleObjectKey(item.key));
  if (foreign.length > 0) {
    throw new TransferError(
      `target bucket has ${foreign.length} objects outside pages/, files/, and sites/`,
    );
  }
  const counts = await readCounts(io);
  const references = await readReferences(io);
  const fromRoot = path.resolve(fromDir);
  // A matching database is a retry after a committed restore. Fill the bucket only.
  if (databaseMatchesManifest(counts, references, manifest, objects)) {
    await uploadObjects(io, fromRoot, objects);
    await io.flush();
  } else {
    const empty = DATA_TABLES.every((table) => counts[table] === 0);
    if (!empty && !options.replace) {
      throw new TransferError("target database is not empty; pass --replace to overwrite it");
    }
    if (listed.length > 0 && !options.replace) {
      throw new TransferError("target bucket is not empty; pass --replace to overwrite it");
    }
    await io.restoreFrom(path.join(fromRoot, "postgres", "oneself.dump"), {
      replace: options.replace,
    });
    if (options.replace) {
      for (const item of listed) {
        await io.delete(item.key);
      }
    }
    await uploadObjects(io, fromRoot, objects);
    await io.flush();
  }
  const countsAfter = await readCounts(io);
  const referencesAfter = await readReferences(io);
  if (!sameCounts(countsAfter, manifest.tables)) {
    throw new TransferError("restored table counts do not match the manifest");
  }
  await verifyRemote(io, referencesAfter, objects);
  log(options, `imported ${objects.length} objects into the target database and bucket`);
  return manifest;
}
