import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";

import {
  composeArgs,
  composeSecrets,
  listRunningServices,
  openCompose,
  readJournalFromAppImage,
  refusesPublishedDatabasePorts,
  runCommand,
  type CommandRunner,
} from "../../../scripts/compose-transfer.ts";
import {
  bundleArchivePath,
  exportBundle,
  importBundle,
  isBundleArchive,
  packBundle,
  parseTransferArgs,
  TransferError,
  unpackBundle,
  type Manifest,
  type MigrationRecord,
  type RemoteIO,
} from "../../../scripts/data-transfer.ts";
import { showBanner } from "./banner.ts";
import { readEnvFile } from "./env-file.ts";
import { requireInstalledLayout, resolveInstallRoot } from "./resolve-root.ts";

type TransferKind = "backup" | "restore";

export type TransferOptions = {
  readonly dir: string | undefined;
  readonly dryRun: boolean;
  readonly kind: TransferKind;
  readonly passthrough: readonly string[];
};

type ComposeIo = {
  readonly io: RemoteIO;
  close(): Promise<void>;
};

export type TransferDeps = {
  readonly interactive?: boolean;
  readonly confirm?: (message: string) => Promise<boolean>;
  readonly run?: CommandRunner;
  readonly journal?: readonly MigrationRecord[];
  readonly openIo?: (composeFile: string) => Promise<ComposeIo>;
  readonly now?: () => string;
  readonly log?: (line: string) => void;
};

/** Printed after a format-1 export. Names the items the archive must not contain. */
export const EXPORT_EXCLUSION_SUMMARY =
  "Sessions, device codes, PUBLIC_ORIGIN, and storage credentials were not exported.";

function exportSummary(archive: string, manifest: Manifest): readonly string[] {
  return [
    `wrote ${path.resolve(archive)} (${String(manifest.objects.count)} objects, ${String(manifest.objects.bytes)} bytes)`,
    "The bundle contains password hashes and key hashes. Do not commit it.",
    EXPORT_EXCLUSION_SUMMARY,
  ];
}

export function installComposeFile(root: string): string {
  return path.join(root, "compose.yaml");
}

export function stopAppArgs(): readonly string[] {
  return ["stop", "app"];
}

export function startAppArgs(): readonly string[] {
  return ["start", "app"];
}

function startAppCommand(composeFile: string): string {
  return `docker ${composeArgs(composeFile, [...startAppArgs()]).join(" ")}`;
}

function startFailureMessage(
  startError: unknown,
  transferError: unknown,
  composeFile: string,
  archiveWritten: boolean,
  lines: readonly string[],
): string {
  const reason = startError instanceof Error ? startError.message : "start failed";
  const restart = `app 未能重新启动。请执行：${startAppCommand(composeFile)}`;
  if (transferError === undefined) return `${reason}\n${restart}`;
  const transfer = transferError instanceof Error ? transferError.message : "transfer failed";
  const written = archiveWritten ? "the archive was written" : "the archive was not written";
  const collected = lines.length === 0 ? "" : `\n${lines.join("\n")}`;
  return `${reason}\n${restart}\n${transfer}\n${written}${collected}`;
}

function isInteractive(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY ? true : false;
}

async function askConfirm(message: string): Promise<boolean> {
  const answer = await p.confirm({ message });
  if (p.isCancel(answer)) return false;
  return answer;
}

async function secretsFromEnv(root: string): Promise<string[]> {
  const env = await readEnvFile(path.join(root, ".env"));
  return composeSecrets({
    POSTGRES_PASSWORD: env.get("POSTGRES_PASSWORD"),
    RUSTFS_SECRET_KEY: env.get("RUSTFS_SECRET_KEY"),
    OBJECT_STORAGE_SECRET_KEY: env.get("OBJECT_STORAGE_SECRET_KEY"),
  });
}

function assertSafeComposeArgs(args: readonly string[]): void {
  if (refusesPublishedDatabasePorts(args)) {
    throw new TransferError("refusing to publish database ports or compose down");
  }
}

async function compose(
  runner: CommandRunner,
  composeFile: string,
  args: readonly string[],
  secrets: readonly string[],
  cwd: string,
): Promise<string> {
  assertSafeComposeArgs(args);
  return runner("docker", composeArgs(composeFile, args), { secrets, cwd });
}

export async function runInstalledTransfer(
  root: string,
  options: TransferOptions,
  deps: TransferDeps = {},
): Promise<readonly string[]> {
  const composeFile = installComposeFile(root);
  const parsed = parseTransferArgs([
    options.kind === "backup" ? "export" : "import",
    ...options.passthrough,
  ]);
  const interactive = deps.interactive ?? isInteractive();
  if (!interactive && !parsed.stopped) {
    throw new TransferError("非交互运行必须传入 --stopped，且不会自动停止服务。");
  }
  if (options.dryRun) {
    return [`dry-run：会用 ${composeFile} 做 format 1 ${options.kind}`];
  }

  const runner = deps.run ?? runCommand;
  const secrets = await secretsFromEnv(root);
  const lines: string[] = [];
  const log = (line: string): void => {
    lines.push(line);
    deps.log?.(line);
  };
  const stoppedByUs = await ensureAppStopped({
    composeFile,
    root,
    interactive,
    runner,
    secrets,
    confirm: deps.confirm ?? askConfirm,
  });
  let transferError: unknown;
  let startError: unknown;
  let archiveWritten = false;
  try {
    const journal = await resolveJournal(composeFile, root, secrets, runner, deps);
    const opened = await openTransferIo(composeFile, root, secrets, deps.run, deps.openIo);
    try {
      if (options.kind === "backup") {
        await writeBackup(root, parsed.directory, opened.io, journal, deps.now, log);
        archiveWritten = true;
      } else {
        await readBackup(root, parsed.directory, opened.io, journal, parsed.replace, deps.now, log);
      }
    } finally {
      await opened.close();
    }
  } catch (error) {
    transferError = error;
  } finally {
    if (stoppedByUs) {
      try {
        await compose(runner, composeFile, [...startAppArgs()], secrets, root);
      } catch (error) {
        startError = error;
      }
    }
  }
  if (startError !== undefined) {
    throw new TransferError(
      startFailureMessage(startError, transferError, composeFile, archiveWritten, lines),
    );
  }
  if (transferError !== undefined) {
    if (transferError instanceof Error) throw transferError;
    throw new TransferError("transfer failed");
  }
  return lines;
}

async function writeBackup(
  root: string,
  out: string,
  io: RemoteIO,
  journal: readonly MigrationRecord[],
  now: (() => string) | undefined,
  log: (line: string) => void,
): Promise<void> {
  const archive = path.resolve(root, bundleArchivePath(out));
  const staging = await mkdtemp(path.join(tmpdir(), "oneself-export-"));
  try {
    const manifest = await exportBundle(io, staging, {
      stopped: true,
      journal,
      now: (now ?? (() => new Date().toISOString()))(),
    });
    await packBundle(staging, archive);
    if (process.platform !== "win32") {
      const info = await stat(archive);
      if ((info.mode & 0o777) !== 0o600) {
        throw new TransferError(`archive mode is not 0600: ${(info.mode & 0o777).toString(8)}`);
      }
    }
    for (const line of exportSummary(archive, manifest)) log(line);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function readBackup(
  root: string,
  from: string,
  io: RemoteIO,
  journal: readonly MigrationRecord[],
  replace: boolean,
  now: (() => string) | undefined,
  log: (line: string) => void,
): Promise<void> {
  const source = path.resolve(root, from);
  const archive = isBundleArchive(source) ? source : null;
  let extracted: string | null = null;
  try {
    if (archive !== null) {
      extracted = await mkdtemp(path.join(tmpdir(), "oneself-import-"));
      await unpackBundle(archive, extracted);
    }
    await importBundle(io, extracted ?? source, {
      stopped: true,
      replace,
      journal,
      now: (now ?? (() => new Date().toISOString()))(),
      log,
    });
  } finally {
    if (extracted !== null) {
      await rm(extracted, { recursive: true, force: true });
    }
  }
  log("Log in with the previous owner password. API keys you still hold keep working.");
  log("Point agents at the new PUBLIC_ORIGIN. Sessions and device codes must be issued again.");
}

async function resolveJournal(
  composeFile: string,
  root: string,
  secrets: readonly string[],
  runner: CommandRunner,
  deps: TransferDeps,
): Promise<MigrationRecord[]> {
  if (deps.journal !== undefined) return [...deps.journal];
  return readJournalFromAppImage(composeFile, runner, secrets, root);
}

async function openTransferIo(
  composeFile: string,
  root: string,
  secrets: readonly string[],
  runner: CommandRunner | undefined,
  openIo: TransferDeps["openIo"],
): Promise<ComposeIo> {
  if (openIo !== undefined) return openIo(composeFile);
  return openCompose(composeFile, {
    ...(runner === undefined ? {} : { runner }),
    secrets,
    cwd: root,
  });
}

async function ensureAppStopped(input: {
  readonly composeFile: string;
  readonly root: string;
  readonly interactive: boolean;
  readonly runner: CommandRunner;
  readonly secrets: readonly string[];
  readonly confirm: (message: string) => Promise<boolean>;
}): Promise<boolean> {
  const running = await listRunningServices(
    input.composeFile,
    input.runner,
    input.secrets,
    input.root,
  );
  if (!running.includes("app")) return false;
  if (!input.interactive) {
    throw new TransferError("the app service is running; stop it before export or import");
  }
  const confirmed = await input.confirm("备份或恢复前需要停止 app，完成后会重新启动。继续？");
  if (!confirmed) {
    throw new TransferError("已取消，未停止服务。");
  }
  await compose(input.runner, input.composeFile, [...stopAppArgs()], input.secrets, input.root);
  return true;
}

export async function runTransfer(options: TransferOptions): Promise<void> {
  await showBanner(false);
  process.stdout.write("\n");
  const title = options.kind === "backup" ? "备份（导出）" : "恢复（导入）";
  p.intro(pc.bold(`OneSelf ${title}`));

  const root = await resolveInstallRoot(options.dir);
  p.log.step(`${pc.bold("安装路径")}  ${pc.cyan(root)}`);
  await requireInstalledLayout(root);

  try {
    const lines = await runInstalledTransfer(root, options);
    for (const line of lines) p.log.info(line);
  } catch (error) {
    if (error instanceof TransferError) throw new Error(error.message);
    throw error;
  }
  p.outro("完成");
}
