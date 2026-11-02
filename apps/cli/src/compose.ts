import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";

import { readEnvFile, writeEnvValue } from "./env-file.ts";
import { INGRESS_PROFILES, secretOk } from "./validate.ts";

const IMAGE_REPO = process.env.ONESELF_IMAGE_REPO ?? "docker.io/ptonlix/oneself";

export function imageForRef(ref: string): string {
  if (ref === "latest") return `${IMAGE_REPO}:latest`;
  const version = ref.startsWith("v") ? ref.slice(1) : ref;
  return `${IMAGE_REPO}:${version}`;
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}

export async function runInherit(
  command: string,
  args: readonly string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: env ?? process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

export async function composeCmd(
  root: string,
  profile: string,
  args: readonly string[],
  inherit = false,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const env = { ...process.env, COMPOSE_PROFILES: profile };
  const full = ["compose", "-f", "compose.yaml", "--project-directory", root, ...args];
  if (inherit) {
    const code = await runInherit("docker", full, root, env);
    return { code, stdout: "", stderr: "" };
  }
  return run("docker", full, root, env);
}

async function ensureGeneratedSecrets(envPath: string): Promise<void> {
  const env = await readEnvFile(envPath);
  for (const key of ["POSTGRES_PASSWORD", "RUSTFS_ACCESS_KEY", "RUSTFS_SECRET_KEY"] as const) {
    const current = env.get(key) ?? "";
    if (secretOk(current)) continue;
    await writeEnvValue(envPath, key, randomBytes(24).toString("hex"));
  }
}

export async function startStack(root: string, profile: string): Promise<void> {
  const envPath = path.join(root, ".env");
  await ensureGeneratedSecrets(envPath);
  const ver = await run("docker", ["compose", "version"], root);
  if (ver.code !== 0) throw new Error("需要 Docker Compose v2");
  const pull = await composeCmd(root, profile, ["--env-file", ".env", "pull"], true);
  if (pull.code !== 0) throw new Error("docker compose pull 失败");
  const up = await composeCmd(root, profile, ["--env-file", ".env", "up", "-d"], true);
  if (up.code !== 0) throw new Error("docker compose up 失败");
}

export async function stopOtherIngress(
  root: string,
  selected: string,
  dryRun: boolean,
  onWarn: (msg: string) => void,
  onInfo: (msg: string) => void,
): Promise<void> {
  for (const name of INGRESS_PROFILES) {
    if (name === selected) continue;
    if (dryRun) {
      onInfo(`会停止另一个入口 ${name}`);
      continue;
    }
    const result = await composeCmd(root, name, ["stop", name]);
    if (result.code !== 0) {
      onWarn(`没能停止 ${name}。如果它仍在跑，doctor 会标出来。`);
    }
  }
}

export async function pinImageFromRelease(
  root: string,
  dryRun: boolean,
  onInfo: (msg: string) => void,
): Promise<void> {
  const envPath = path.join(root, ".env");
  const releasePath = path.join(root, ".oneself-release");
  const { access, readFile } = await import("node:fs/promises");
  try {
    await access(envPath);
    await access(releasePath);
  } catch {
    return;
  }
  const release = await readFile(releasePath, "utf8");
  const tag = release
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("ref="))
    ?.slice("ref=".length);
  if (!tag) return;
  const image = imageForRef(tag);
  const env = await readEnvFile(envPath);
  const current = env.get("ONESELF_IMAGE") ?? "";
  const managed =
    current === "" ||
    current.startsWith("docker.io/ptonlix/oneself:") ||
    current.startsWith(`${IMAGE_REPO}:`);
  if (!managed) return;
  if (current === image) return;
  if (dryRun) {
    onInfo(`会把 ONESELF_IMAGE 定为 ${image}`);
    return;
  }
  await writeEnvValue(envPath, "ONESELF_IMAGE", image);
  onInfo(`镜像标签定为 ${image}`);
}

export async function runningServices(root: string, profile: string): Promise<string[]> {
  const result = await composeCmd(root, profile, [
    "ps",
    "--status",
    "running",
    "--format",
    "{{.Service}}",
  ]);
  return result.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
