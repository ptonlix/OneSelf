import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import {
  BUNDLE_FORMAT,
  COUNT_SQL,
  DATA_TABLES,
  MIGRATION_SQL,
  REFERENCE_SQL,
  SETVAL_SQL,
  TRUNCATE_SQL,
  TransferError,
  archiveEntryProblem,
  archiveListingProblem,
  archiveProblems,
  bundleArchivePath,
  bundleObjectPath,
  exportBundle,
  importBundle,
  isBundleObjectKey,
  migrationHash,
  migrationsFromJournal,
  packBundle,
  parseDatabaseUrl,
  parseTransferArgs,
  reconcile,
  redactSecrets,
  pgRestoreSqlArgs,
  restoreTransactionSql,
  sameMigrations,
  sha256Bytes,
  unpackBundle,
  type DataTable,
  type MigrationRecord,
  type Reference,
  type RemoteIO,
} from "./data-transfer.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hash = "ab".repeat(32);
const journal: MigrationRecord[] = [{ tag: "0000_initial", hash: "11".repeat(32), created_at: 10 }];

function counts(partial: Partial<Record<DataTable, number>> = {}): Record<DataTable, number> {
  const row = {} as Record<DataTable, number>;
  for (const table of DATA_TABLES) {
    row[table] = partial[table] ?? 0;
  }
  return row;
}

class MemoryRemote implements RemoteIO {
  readonly calls: string[] = [];
  objects = new Map<string, Uint8Array>();
  references: Reference[] = [];
  tableCounts = counts();
  applied = journal;
  dumpBody = new Uint8Array([1, 2, 3]);
  failSecondRead = false;
  failRestore = false;
  restoreReplace: boolean | null = null;
  #reads = 0;
  restored: { counts: Record<DataTable, number>; references: Reference[] } | null = null;

  query(sql: string): Promise<readonly Record<string, unknown>[]> {
    if (sql === MIGRATION_SQL) {
      return Promise.resolve(
        this.applied.map((entry) => ({ hash: entry.hash, created_at: entry.created_at })),
      );
    }
    if (sql === COUNT_SQL) {
      return Promise.resolve([this.tableCounts]);
    }
    if (sql === REFERENCE_SQL) {
      this.#reads += 1;
      const references =
        this.failSecondRead && this.#reads > 1
          ? [...this.references, { key: `pages/notes/extra/${hash}.md`, sha256: hash }]
          : this.references;
      return Promise.resolve(
        references.map((reference) => ({
          object_key: reference.key,
          sha256: reference.sha256,
        })),
      );
    }
    if (sql === SETVAL_SQL) {
      this.calls.push("setval");
      return Promise.resolve([]);
    }
    return Promise.reject(new Error(`unexpected query: ${sql}`));
  }

  exec(sql: string): Promise<void> {
    if (sql !== TRUNCATE_SQL) {
      return Promise.reject(new Error(`unexpected exec: ${sql}`));
    }
    this.calls.push("truncate");
    this.tableCounts = counts();
    this.references = [];
    return Promise.resolve();
  }

  dumpTo(file: string): Promise<void> {
    this.calls.push("dump");
    return writePrivate(file, this.dumpBody);
  }

  async restoreFrom(file: string, options: { readonly replace: boolean }): Promise<void> {
    const body = await readFile(file);
    expect(Buffer.from(body).equals(Buffer.from(this.dumpBody))).toBe(true);
    this.calls.push("restore");
    this.restoreReplace = options.replace;
    if (this.failRestore) {
      throw new Error("restore failed");
    }
    if (this.restored === null) {
      throw new Error("restore snapshot was not set");
    }
    this.tableCounts = this.restored.counts;
    this.references = this.restored.references;
  }

  list(): Promise<readonly { key: string; byteSize: number }[]> {
    return Promise.resolve(
      [...this.objects].map(([key, body]) => ({ key, byteSize: body.byteLength })),
    );
  }

  get(key: string): Promise<Uint8Array | null> {
    const body = this.objects.get(key);
    return Promise.resolve(body === undefined ? null : body);
  }

  put(key: string, body: Uint8Array): Promise<void> {
    this.calls.push(`put:${key}`);
    const existing = this.objects.get(key);
    if (existing !== undefined && sha256Bytes(existing) !== sha256Bytes(body)) {
      return Promise.reject(new TransferError(`object ${key} differs from the bundle`));
    }
    this.objects.set(key, body);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.calls.push(`delete:${key}`);
    this.objects.delete(key);
    return Promise.resolve();
  }

  flush(): Promise<void> {
    this.calls.push("flush");
    return Promise.resolve();
  }
}

async function writePrivate(file: string, body: Uint8Array): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

it("keeps the export table list aligned with the schema", async () => {
  const schema = await readFile(path.join(root, "packages/db/src/schema.ts"), "utf8");
  const tables = [...schema.matchAll(/pgTable\(\s*"([^"]+)"/g)].map((match) => match[1]);
  expect(tables).toEqual([...DATA_TABLES]);
});

it("hashes journal sql the same way the migrator does", () => {
  const sql = "select 1;\n";
  expect(migrationHash(sql)).toBe(sha256Bytes(new TextEncoder().encode(sql)));
  expect(
    migrationsFromJournal({ entries: [{ tag: "0000_initial", when: 10 }] }, () => sql),
  ).toEqual([{ tag: "0000_initial", hash: migrationHash(sql), created_at: 10 }]);
});

it("rejects object keys that leave the bundle prefixes", () => {
  expect(isBundleObjectKey("pages/health/note/file.md")).toBe(true);
  expect(isBundleObjectKey("files/file_01")).toBe(true);
  expect(isBundleObjectKey("sites/rel_aa/index.html")).toBe(true);
  expect(isBundleObjectKey("pages/../../etc/passwd")).toBe(false);
  expect(isBundleObjectKey("other/file")).toBe(false);
  expect(() => bundleObjectPath("/tmp/objects", "pages/../../etc/passwd")).toThrow(TransferError);
});

it("reports missing and conflicting object bytes", () => {
  const key = `pages/health/note/${hash}.md`;
  expect(reconcile([{ key, sha256: hash }], [])).toEqual([`missing object ${key}`]);
  expect(reconcile([{ key, sha256: hash }], [{ key, sha256: "cd".repeat(32), bytes: 1 }])).toEqual([
    `hash mismatch for ${key}`,
  ]);
  expect(sameMigrations(journal, journal)).toBeNull();
  const first = journal[0];
  if (first === undefined) {
    throw new Error("fixture missing");
  }
  expect(sameMigrations(journal, [{ ...first, hash: "ee".repeat(32) }])).toMatch(/does not match/);
});

it("parses transfer arguments without echoing a database URL", () => {
  expect(parseTransferArgs(["export", "--out", "oneself-export", "--stopped"])).toMatchObject({
    command: "export",
    directory: "oneself-export",
    stopped: true,
    via: "host",
  });
  expect(parseTransferArgs(["export", "--", "--out", "oneself-export", "--stopped"])).toMatchObject(
    {
      directory: "oneself-export",
      stopped: true,
    },
  );
  expect(parseTransferArgs(["import", "--from", "bundle", "--stopped", "--replace"]).replace).toBe(
    true,
  );
  expect(() => parseTransferArgs(["export"])).toThrow("--out is required");
  expect(() => parseTransferArgs(["export", "--out", "bundle"])).not.toThrow(TransferError);
  const parsed = parseDatabaseUrl("postgres://oneself:secret%2Fword@127.0.0.1:5432/oneself");
  expect(parsed.password).toBe("secret/word");
  expect(() => parseDatabaseUrl("https://user:secret@example")).toThrow(
    "DATABASE_URL is not a postgres URL",
  );
  expect(redactSecrets("failed for secret/word", ["secret/word"])).toBe("failed for [redacted]");
});

it("exports a stopped database and objects, then imports them into an empty target", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "oneself-export-"));
  const out = path.join(directory, "bundle");
  const markdown = new TextEncoder().encode("# note\n");
  const key = `pages/health/note/${sha256Bytes(markdown)}.md`;
  const source = new MemoryRemote();
  source.tableCounts = counts({ sources: 1, pages: 1 });
  source.references = [{ key, sha256: sha256Bytes(markdown) }];
  source.objects.set(key, markdown);
  const exported = await exportBundle(source, out, {
    stopped: true,
    journal,
    now: "2026-04-08T00:00:00.000Z",
  });
  expect(exported.format).toBe(BUNDLE_FORMAT);
  expect(exported.tables.pages).toBe(1);
  expect(source.calls).toEqual(["dump"]);
  const stored = await readFile(path.join(out, "objects", key));
  expect(sha256Bytes(stored)).toBe(sha256Bytes(markdown));

  const target = new MemoryRemote();
  target.dumpBody = source.dumpBody;
  target.restored = { counts: source.tableCounts, references: source.references };
  await importBundle(target, out, {
    stopped: true,
    replace: false,
    journal,
    now: exported.created_at,
  });
  expect(target.calls).toEqual(["restore", `put:${key}`, "flush"]);
  expect(target.restoreReplace).toBe(false);
  expect(target.objects.get(key)).toEqual(markdown);
  await rm(directory, { recursive: true, force: true });
});

it("drops a torn export and refuses a non-empty target unless replacing", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "oneself-export-"));
  const out = path.join(directory, "bundle");
  const source = new MemoryRemote();
  source.failSecondRead = true;
  source.objects.set("pages/health/note/file.md", new Uint8Array([1]));
  await expect(
    exportBundle(source, out, { stopped: true, journal, now: "2026-04-08T00:00:00.000Z" }),
  ).rejects.toThrow("data changed during export");
  await expect(readFile(path.join(out, "manifest.json"))).rejects.toThrow();

  const target = new MemoryRemote();
  target.tableCounts = counts({ owners: 1 });
  const bundle = path.join(directory, "good");
  const good = new MemoryRemote();
  await exportBundle(good, bundle, { stopped: true, journal, now: "2026-04-08T00:00:00.000Z" });
  await expect(
    importBundle(target, bundle, {
      stopped: true,
      replace: false,
      journal,
      now: "2026-04-08T00:00:00.000Z",
    }),
  ).rejects.toThrow("target database is not empty");
  target.objects.set("files/stale", new Uint8Array([9]));
  target.restored = { counts: counts(), references: [] };
  target.dumpBody = good.dumpBody;
  await importBundle(target, bundle, {
    stopped: true,
    replace: true,
    journal,
    now: "2026-04-08T00:00:00.000Z",
  });
  expect(target.calls[0]).toBe("restore");
  expect(target.restoreReplace).toBe(true);
  expect(target.calls).not.toContain("truncate");
  expect(target.calls.indexOf("restore")).toBeLessThan(target.calls.indexOf("delete:files/stale"));
  expect(target.calls.at(-1)).toBe("flush");
  await rm(directory, { recursive: true, force: true });
});

it("packs a bundle as tar.gz and rejects entries outside the bundle", async () => {
  expect(bundleArchivePath("oneself-export")).toBe("oneself-export.tar.gz");
  expect(bundleArchivePath("move.tgz")).toBe("move.tgz");
  expect(archiveEntryProblem("../etc/passwd")).toMatch(/refusing archive entry/);
  expect(archiveEntryProblem("objects/pages/health/note/file.md")).toBeNull();
  expect(archiveProblems(["manifest.json"])).toMatch(/missing postgres\/oneself.dump/);

  const directory = await mkdtemp(path.join(tmpdir(), "oneself-export-"));
  const bundle = await mkdtemp(path.join(directory, "staging-"));
  const archive = path.join(directory, "bundle.tar.gz");
  const source = new MemoryRemote();
  await exportBundle(source, bundle, { stopped: true, journal, now: "2026-04-08T00:00:00.000Z" });
  await packBundle(bundle, archive);
  const extracted = await mkdtemp(path.join(directory, "extracted-"));
  await unpackBundle(archive, extracted);
  const manifest = await readFile(path.join(extracted, "manifest.json"), "utf8");
  expect(manifest).toContain('"format": 1');
  await expect(packBundle(bundle, archive)).rejects.toThrow("refusing to overwrite");
  await rm(directory, { recursive: true, force: true });
});

it("refuses to export while the app may still be running", async () => {
  await expect(
    exportBundle(new MemoryRemote(), "/tmp/oneself-not-created", {
      stopped: false,
      journal,
      now: "2026-04-08T00:00:00.000Z",
    }),
  ).rejects.toThrow("--stopped");
});

function tar(args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "tar",
      args,
      { cwd, encoding: "utf8", env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" } },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error(error.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

it("refuses a symlink listing line and does not echo bundle bytes", async () => {
  const secret = "secret-bundle-bytes";
  const bsd = `lrwxr-xr-x  0 cfd staff 0 Oct 29 15:12 manifest.json -> /tmp/${secret}`;
  const gnu = `lrwxrwxrwx oneself/oneself 0 2026-04-08 00:00 manifest.json -> /tmp/${secret}`;
  for (const line of [bsd, gnu]) {
    const problem = archiveListingProblem(line);
    expect(problem).toBe("refusing archive entry manifest.json");
    expect(problem).not.toContain(secret);
  }
  expect(archiveListingProblem("brw-r--r--  0 cfd staff 0 Oct 29 15:12 dev")).toMatch(/refusing/);

  const replacing = restoreTransactionSql(true);
  expect(replacing.header.startsWith("BEGIN;\n")).toBe(true);
  expect(replacing.header).toContain(TRUNCATE_SQL);
  expect(replacing.footer).toContain(SETVAL_SQL);
  expect(replacing.footer.endsWith("COMMIT;\n")).toBe(true);
  expect(restoreTransactionSql(false).header).toBe("BEGIN;\n");
  expect(pgRestoreSqlArgs("/tmp/oneself.dump")).toEqual([
    "--data-only",
    "--disable-triggers",
    "--no-owner",
    "--no-privileges",
    "--file=-",
    "/tmp/oneself.dump",
  ]);

  const directory = await mkdtemp(path.join(tmpdir(), "oneself-export-"));
  const root = path.join(directory, "members");
  await mkdir(path.join(root, "postgres"), { recursive: true });
  await mkdir(path.join(root, "objects"), { recursive: true });
  await writeFile(path.join(root, "manifest.json"), "{}");
  await writeFile(path.join(root, "postgres", "oneself.dump"), "dump");
  await writeFile(path.join(root, "objects", "index.json"), "[]");
  await symlink(`/tmp/${secret}`, path.join(root, "manifest-link.json"));
  const archive = path.join(directory, "linked.tar.gz");
  await tar([
    "-czf",
    archive,
    "-C",
    root,
    "manifest.json",
    "postgres",
    "objects",
    "manifest-link.json",
  ]);
  const listing = await tar(["-tvzf", archive]);
  const symlinkLine = listing.split("\n").find((line) => line.startsWith("l"));
  expect(symlinkLine).toBeDefined();
  const listed = archiveListingProblem(symlinkLine ?? "");
  expect(listed).toMatch(/refusing archive entry/);
  expect(listed).not.toContain(secret);
  const extracted = path.join(directory, "extracted");
  await expect(unpackBundle(archive, extracted)).rejects.toThrow(/refusing archive entry/);

  const bundle = path.join(directory, "bundle");
  await exportBundle(new MemoryRemote(), bundle, {
    stopped: true,
    journal,
    now: "2026-04-08T00:00:00.000Z",
  });
  await writeFile(path.join(bundle, "manifest.json"), secret);
  let incomplete: unknown;
  try {
    await importBundle(new MemoryRemote(), bundle, {
      stopped: true,
      replace: false,
      journal,
      now: "2026-04-08T00:00:00.000Z",
    });
  } catch (error) {
    incomplete = error;
  }
  expect(incomplete).toBeInstanceOf(TransferError);
  if (!(incomplete instanceof TransferError)) {
    throw new Error("expected incomplete bundle");
  }
  expect(incomplete.message).toMatch(/is incomplete$/);
  expect(incomplete.message).not.toContain(secret);

  const outside = path.join(directory, "outside.json");
  await writeFile(outside, `{"format":1,"leak":"${secret}"}`);
  await rm(path.join(bundle, "manifest.json"));
  await symlink(outside, path.join(bundle, "manifest.json"));
  let linked: unknown;
  try {
    await importBundle(new MemoryRemote(), bundle, {
      stopped: true,
      replace: false,
      journal,
      now: "2026-04-08T00:00:00.000Z",
    });
  } catch (error) {
    linked = error;
  }
  expect(linked).toBeInstanceOf(TransferError);
  if (!(linked instanceof TransferError)) {
    throw new Error("expected symlink refusal");
  }
  expect(linked.message).toMatch(/is incomplete$/);
  expect(linked.message).not.toContain(secret);
  expect(linked.message).not.toContain("outside.json");
  await rm(directory, { recursive: true, force: true });
});

it("uploads objects without restoring when the database already matches", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "oneself-export-"));
  const bundle = path.join(directory, "bundle");
  const markdown = new TextEncoder().encode("# note\n");
  const key = `pages/health/note/${sha256Bytes(markdown)}.md`;
  const source = new MemoryRemote();
  source.tableCounts = counts({ pages: 1 });
  source.references = [{ key, sha256: sha256Bytes(markdown) }];
  source.objects.set(key, markdown);
  await exportBundle(source, bundle, {
    stopped: true,
    journal,
    now: "2026-04-08T00:00:00.000Z",
  });

  const retry = new MemoryRemote();
  retry.tableCounts = counts({ pages: 1 });
  retry.references = [{ key, sha256: sha256Bytes(markdown) }];
  retry.dumpBody = source.dumpBody;
  await importBundle(retry, bundle, {
    stopped: true,
    replace: false,
    journal,
    now: "2026-04-08T00:00:00.000Z",
  });
  expect(retry.calls).toEqual([`put:${key}`, "flush"]);
  expect(retry.objects.get(key)).toEqual(markdown);

  const mismatched = new MemoryRemote();
  mismatched.tableCounts = counts({ pages: 1 });
  mismatched.references = [{ key, sha256: "cd".repeat(32) }];
  await expect(
    importBundle(mismatched, bundle, {
      stopped: true,
      replace: false,
      journal,
      now: "2026-04-08T00:00:00.000Z",
    }),
  ).rejects.toThrow("target database is not empty");
  expect(mismatched.calls).not.toContain("restore");

  const failed = new MemoryRemote();
  failed.tableCounts = counts({ owners: 1 });
  failed.objects.set("files/stale", new Uint8Array([9]));
  failed.dumpBody = source.dumpBody;
  failed.restored = { counts: source.tableCounts, references: source.references };
  failed.failRestore = true;
  await expect(
    importBundle(failed, bundle, {
      stopped: true,
      replace: true,
      journal,
      now: "2026-04-08T00:00:00.000Z",
    }),
  ).rejects.toThrow("restore failed");
  expect(failed.calls).toEqual(["restore"]);
  expect(failed.objects.has("files/stale")).toBe(true);
  await rm(directory, { recursive: true, force: true });
});
