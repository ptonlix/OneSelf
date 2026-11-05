import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

import {
  appJournalArgs,
  composeArgs,
  journalFromImageOutput,
  postgresDumpArgs,
  refusesPublishedDatabasePorts,
} from "../../../scripts/compose-transfer.ts";
import {
  COUNT_SQL,
  DATA_TABLES,
  MIGRATION_SQL,
  REFERENCE_SQL,
  TRUNCATE_SQL,
  migrationHash,
  type DataTable,
  type MigrationRecord,
  type RemoteIO,
} from "../../../scripts/data-transfer.ts";
import {
  EXPORT_EXCLUSION_SUMMARY,
  installComposeFile,
  runInstalledTransfer,
  startAppArgs,
  stopAppArgs,
} from "./transfer.ts";

const execFileAsync = promisify(execFile);
const journal: MigrationRecord[] = [{ tag: "0000_initial", hash: "11".repeat(32), created_at: 10 }];

function counts(partial: Partial<Record<DataTable, number>> = {}): Record<DataTable, number> {
  const row = {} as Record<DataTable, number>;
  for (const table of DATA_TABLES) row[table] = partial[table] ?? 0;
  return row;
}

class FakeRemote implements RemoteIO {
  readonly calls: string[] = [];
  tableCounts = counts();
  restoreReplace: boolean | null = null;
  dumpBody = new Uint8Array([1, 2, 3]);

  query(sql: string): Promise<readonly Record<string, unknown>[]> {
    if (sql === MIGRATION_SQL) {
      return Promise.resolve(
        journal.map((entry) => ({ hash: entry.hash, created_at: entry.created_at })),
      );
    }
    if (sql === COUNT_SQL) return Promise.resolve([this.tableCounts]);
    if (sql === REFERENCE_SQL) return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected query: ${sql}`));
  }

  exec(sql: string): Promise<void> {
    if (sql === TRUNCATE_SQL) this.calls.push("truncate");
    return Promise.reject(new Error(`unexpected exec: ${sql}`));
  }

  dumpTo(file: string): Promise<void> {
    this.calls.push("dump");
    return writeFile(file, this.dumpBody);
  }

  restoreFrom(_file: string, options: { readonly replace: boolean }): Promise<void> {
    this.calls.push("restore");
    this.restoreReplace = options.replace;
    this.tableCounts = counts({ owners: 1 });
    return Promise.resolve();
  }

  list(): Promise<readonly { key: string; byteSize: number }[]> {
    return Promise.resolve([]);
  }

  get(): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }

  put(): Promise<void> {
    return Promise.resolve();
  }

  delete(): Promise<void> {
    return Promise.resolve();
  }

  flush(): Promise<void> {
    this.calls.push("flush");
    return Promise.resolve();
  }
}

async function installDir(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "oneself-install-"));
  await writeFile(path.join(root, "compose.yaml"), "name: oneself\nservices: {}\n");
  await writeFile(
    path.join(root, ".env"),
    "POSTGRES_PASSWORD=secret-db\nPUBLIC_ORIGIN=http://127.0.0.1:3000\n",
  );
  return root;
}

function runner(running: string, calls: string[][], failStart = false) {
  return (command: string, args: readonly string[]): Promise<string> => {
    calls.push([command, ...args]);
    if (args.includes("down") || args.includes("--service-ports") || args.includes("-p")) {
      return Promise.reject(new Error(`refusing ${args.join(" ")}`));
    }
    if (args.includes("ps")) return Promise.resolve(running);
    if (failStart && args.includes("start")) return Promise.reject(new Error("start failed"));
    return Promise.resolve("");
  };
}

it("backs up an install directory without a repo, transfer script, or ONESELF_REPO_ROOT", async () => {
  const previous = process.env.ONESELF_REPO_ROOT;
  delete process.env.ONESELF_REPO_ROOT;
  const root = await installDir();
  const composeFiles: string[] = [];
  const source = new FakeRemote();
  source.tableCounts = counts({ owners: 1 });
  try {
    const lines = await runInstalledTransfer(
      root,
      { dir: root, dryRun: false, kind: "backup", passthrough: ["--out", "bundle", "--stopped"] },
      {
        interactive: false,
        journal,
        now: () => "2026-10-20T00:00:00.000Z",
        run: () => Promise.resolve(""),
        openIo: (composeFile) => {
          composeFiles.push(composeFile);
          return Promise.resolve({ io: source, close: () => Promise.resolve() });
        },
      },
    );
    const text = lines.join("\n");
    expect(text).not.toMatch(/克隆仓库|ONESELF_REPO_ROOT|transfer-cli/);
    expect(text).toContain(EXPORT_EXCLUSION_SUMMARY);
    expect(text).toContain("PUBLIC_ORIGIN");
    expect(text).toContain("storage credentials");
    expect(composeFiles).toEqual([installComposeFile(root)]);
    const archive = path.join(root, "bundle.tar.gz");
    const info = await stat(archive);
    expect(info.mode & 0o777).toBe(0o600);
    const listing = await execFileAsync("tar", ["-tzf", archive]);
    expect(listing.stdout).toContain("manifest.json");
    expect(listing.stdout).not.toContain(".env");
    const extracted = path.join(root, "extracted");
    await execFileAsync("tar", ["-xzf", archive, "-C", root]);
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as {
      format: number;
      tables: { owners: number };
    };
    expect(manifest.format).toBe(1);
    expect(manifest.tables.owners).toBe(1);
    expect(extracted).toBe(path.join(root, "extracted"));

    const target = new FakeRemote();
    await runInstalledTransfer(
      root,
      {
        dir: root,
        dryRun: false,
        kind: "restore",
        passthrough: ["--from", archive, "--stopped"],
      },
      {
        interactive: false,
        journal,
        now: () => "2026-10-20T00:00:00.000Z",
        run: () => Promise.resolve(""),
        openIo: (composeFile) => {
          expect(composeFile).toBe(installComposeFile(root));
          return Promise.resolve({ io: target, close: () => Promise.resolve() });
        },
      },
    );
    expect(target.restoreReplace).toBe(false);
    expect(target.calls).not.toContain("truncate");
    expect(target.calls).toContain("restore");
  } finally {
    if (previous === undefined) delete process.env.ONESELF_REPO_ROOT;
    else process.env.ONESELF_REPO_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses a non-interactive backup while app is running and does not write an archive", async () => {
  const root = await installDir();
  const calls: string[][] = [];
  try {
    await expect(
      runInstalledTransfer(
        root,
        { dir: root, dryRun: false, kind: "backup", passthrough: ["--out", "bundle"] },
        { interactive: false, run: runner("app\n", calls), journal },
      ),
    ).rejects.toThrow(/--stopped/);
    expect(calls).toEqual([]);
    await expect(stat(path.join(root, "bundle.tar.gz"))).rejects.toThrow();
    expect(calls.join("\n")).not.toContain("down");
    expect(calls.flat()).not.toContain("stop");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("does not write an archive when --stopped is set but app is still running", async () => {
  const root = await installDir();
  const calls: string[][] = [];
  try {
    await expect(
      runInstalledTransfer(
        root,
        { dir: root, dryRun: false, kind: "backup", passthrough: ["--out", "bundle", "--stopped"] },
        { interactive: false, run: runner("app\n", calls), journal },
      ),
    ).rejects.toThrow(/app service is running/);
    expect(calls.flat()).not.toContain("stop");
    expect(calls.flat()).not.toContain("down");
    await expect(stat(path.join(root, "bundle.tar.gz"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("stops only app after confirmation and starts it again", async () => {
  const root = await installDir();
  const calls: string[][] = [];
  const composeFile = installComposeFile(root);
  try {
    await runInstalledTransfer(
      root,
      { dir: root, dryRun: false, kind: "backup", passthrough: ["--out", "bundle"] },
      {
        interactive: true,
        confirm: () => Promise.resolve(true),
        journal,
        now: () => "2026-10-20T00:00:00.000Z",
        run: runner("app\n", calls),
        openIo: () => Promise.resolve({ io: new FakeRemote(), close: () => Promise.resolve() }),
      },
    );
    const flat = calls.map((args) => args.join(" "));
    expect(
      flat.some((line) => line.includes(composeArgs(composeFile, [...stopAppArgs()]).join(" "))),
    ).toBe(true);
    expect(
      flat.some((line) => line.includes(composeArgs(composeFile, [...startAppArgs()]).join(" "))),
    ).toBe(true);
    expect(flat.join("\n")).not.toMatch(/stop postgres|compose down| --service-ports| -p /);
    expect(calls.every((args) => !refusesPublishedDatabasePorts(args))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("does not stop services when the interactive confirmation is declined", async () => {
  const root = await installDir();
  const calls: string[][] = [];
  try {
    await expect(
      runInstalledTransfer(
        root,
        { dir: root, dryRun: false, kind: "backup", passthrough: ["--out", "bundle"] },
        {
          interactive: true,
          confirm: () => Promise.resolve(false),
          journal,
          run: runner("app\n", calls),
        },
      ),
    ).rejects.toThrow(/已取消/);
    expect(calls.flat()).not.toContain("stop");
    expect(calls.flat()).not.toContain("down");
    await expect(stat(path.join(root, "bundle.tar.gz"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("starts app again when journal read throws after a confirmed stop", async () => {
  const root = await installDir();
  const calls: string[][] = [];
  const composeFile = installComposeFile(root);
  try {
    const error = await runInstalledTransfer(
      root,
      { dir: root, dryRun: false, kind: "backup", passthrough: ["--out", "bundle"] },
      {
        interactive: true,
        confirm: () => Promise.resolve(true),
        run: (command, args) => {
          calls.push([command, ...args]);
          if (args.includes("start")) return Promise.reject(new Error("start failed"));
          if (args.includes("run")) return Promise.reject(new Error("journal unreadable"));
          if (args.includes("ps")) return Promise.resolve("app\n");
          return Promise.resolve("");
        },
      },
    ).then(
      () => null,
      (caught: unknown) => caught,
    );
    if (!(error instanceof Error)) throw new Error("expected journal read to fail");
    expect(error.message).toMatch(/docker compose -f .+ start app/);
    expect(error.message).toContain("journal unreadable");
    expect(error.message).toContain("the archive was not written");
    const flat = calls.map((args) => args.join(" "));
    expect(
      flat.some((line) => line.includes(composeArgs(composeFile, [...startAppArgs()]).join(" "))),
    ).toBe(true);
    expect(calls.flat()).not.toContain("down");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("includes the transfer error and says the archive was not written when open and start both fail", async () => {
  const root = await installDir();
  const calls: string[][] = [];
  try {
    const error = await runInstalledTransfer(
      root,
      { dir: root, dryRun: false, kind: "backup", passthrough: ["--out", "bundle"] },
      {
        interactive: true,
        confirm: () => Promise.resolve(true),
        journal,
        run: runner("app\n", calls, true),
        openIo: () => Promise.reject(new Error("io open failed")),
      },
    ).then(
      () => null,
      (caught: unknown) => caught,
    );
    if (!(error instanceof Error)) throw new Error("expected IO open to fail");
    expect(error.message).toMatch(/docker compose -f .+ start app/);
    expect(error.message).toContain("io open failed");
    expect(error.message).toContain("the archive was not written");
    expect(calls.flat()).toContain("start");
    await expect(stat(path.join(root, "bundle.tar.gz"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("includes the transfer error and collected lines when the archive was written and start fails", async () => {
  const root = await installDir();
  const calls: string[][] = [];
  const source = new FakeRemote();
  source.tableCounts = counts({ owners: 1 });
  try {
    const error = await runInstalledTransfer(
      root,
      { dir: root, dryRun: false, kind: "backup", passthrough: ["--out", "bundle"] },
      {
        interactive: true,
        confirm: () => Promise.resolve(true),
        journal,
        now: () => "2026-10-20T00:00:00.000Z",
        run: runner("app\n", calls, true),
        openIo: () =>
          Promise.resolve({
            io: source,
            close: () => Promise.reject(new Error("close failed")),
          }),
      },
    ).then(
      () => null,
      (caught: unknown) => caught,
    );
    if (!(error instanceof Error)) throw new Error("expected close to fail");
    expect(error.message).toMatch(/docker compose -f .+ start app/);
    expect(error.message).toContain("close failed");
    expect(error.message).toContain("the archive was written");
    expect(error.message).toContain(EXPORT_EXCLUSION_SUMMARY);
    expect(calls.flat()).toContain("start");
    await expect(stat(path.join(root, "bundle.tar.gz"))).resolves.toBeTruthy();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("prints the start command when app cannot be started again", async () => {
  const root = await installDir();
  const calls: string[][] = [];
  try {
    await expect(
      runInstalledTransfer(
        root,
        { dir: root, dryRun: false, kind: "backup", passthrough: ["--out", "bundle"] },
        {
          interactive: true,
          confirm: () => Promise.resolve(true),
          journal,
          now: () => "2026-10-20T00:00:00.000Z",
          run: runner("app\n", calls, true),
          openIo: () => Promise.resolve({ io: new FakeRemote(), close: () => Promise.resolve() }),
        },
      ),
    ).rejects.toThrow(/docker compose -f .+ start app/);
    expect(calls.flat()).not.toContain("down");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("does not publish database ports when reading the journal from the app image", () => {
  expect(refusesPublishedDatabasePorts(appJournalArgs())).toBe(false);
  expect(appJournalArgs()).not.toContain("--service-ports");
  expect(postgresDumpArgs().join(" ")).not.toContain("exclude-table");
  expect(postgresDumpArgs()).toContain("--schema=public");
  const sql = "select 1;\n";
  expect(
    journalFromImageOutput(JSON.stringify({ entries: [{ tag: "0000_initial", when: 10, sql }] })),
  ).toEqual([{ tag: "0000_initial", hash: migrationHash(sql), created_at: 10 }]);
});
