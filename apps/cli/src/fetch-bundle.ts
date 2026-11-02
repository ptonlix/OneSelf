import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { imageForRef } from "./compose.ts";
import { readEnvFile, writeEnvValue } from "./env-file.ts";
import { forcedRef, installerBundledRef, refOk } from "./ref.ts";

const execFileAsync = promisify(execFile);
const REPO = process.env.ONESELF_REPO ?? "ptonlix/OneSelf";

/**
 * Ref to download for a fresh layout: user-forced ONESELF_REF, else the tag the
 * launching installer was built for (ONESELF_BUNDLED_REF), else latest.
 */
export function bundledRef(): string {
  return forcedRef() ?? installerBundledRef() ?? "latest";
}

export async function resolveTag(ref: string): Promise<string> {
  if (!refOk(ref)) {
    throw new Error("ONESELF_REF 只能是 latest 或 v1.2.3 这种版本标签");
  }
  if (ref !== "latest") return ref;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`无法读取 GitHub Release（HTTP ${res.status}）`);
  }
  const body = (await res.json()) as { tag_name?: string };
  if (!body.tag_name) throw new Error("无法解析最新 Release 标签");
  if (body.tag_name === "latest" || !refOk(body.tag_name)) {
    throw new Error(`Release 标签 ${body.tag_name} 不是版本号`);
  }
  return body.tag_name;
}

async function sha256File(file: string): Promise<string> {
  const buf = await readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || res.body === null) {
    throw new Error(`下载失败（HTTP ${res.status}）: ${url}`);
  }
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(dest));
}

export async function writeReleasePin(root: string, tag: string): Promise<void> {
  const releasePath = path.join(root, ".oneself-release");
  await writeFile(releasePath, `ref=${tag}\n`, { mode: 0o644 });
  await chmod(releasePath, 0o644);
  const envPath = path.join(root, ".env");
  try {
    await readFile(envPath);
  } catch {
    return;
  }
  const env = await readEnvFile(envPath);
  const image = imageForRef(tag);
  const current = env.get("ONESELF_IMAGE") ?? "";
  const managed =
    current === "" ||
    current.startsWith("docker.io/ptonlix/oneself:") ||
    current.startsWith(`${process.env.ONESELF_IMAGE_REPO ?? "docker.io/ptonlix/oneself"}:`);
  if (managed && current !== image) {
    await writeEnvValue(envPath, "ONESELF_IMAGE", image);
  }
}

export async function fetchComposeBundle(
  root: string,
  ref: string = bundledRef(),
): Promise<string> {
  const tag = await resolveTag(ref);
  const base = `https://github.com/${REPO}/releases/download/${tag}`;
  const tmp = await mkdtemp(path.join(tmpdir(), "oneself-"));
  const tgz = path.join(tmp, "oneself-compose.tar.gz");
  const sums = path.join(tmp, "SHA256SUMS");
  try {
    await downloadTo(`${base}/oneself-compose.tar.gz`, tgz);
    await downloadTo(`${base}/SHA256SUMS`, sums);
    const expected = (await readFile(sums, "utf8"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.endsWith(" oneself-compose.tar.gz"))
      ?.split(/\s+/)[0];
    if (!expected) {
      throw new Error("SHA256SUMS 里没有 oneself-compose.tar.gz");
    }
    const got = await sha256File(tgz);
    if (got !== expected) {
      throw new Error(`安装包校验失败（got ${got}, want ${expected}）`);
    }
    await mkdir(root, { recursive: true });
    await execFileAsync("tar", ["-xzf", tgz, "-C", root]);
    await writeReleasePin(root, tag);
    return tag;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
