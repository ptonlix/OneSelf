import { access, constants as fsConstants, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";

import { showBanner } from "./banner.ts";
import { composeCmd, runningServices } from "./compose.ts";
import { readEnvFile } from "./env-file.ts";
import { resolveInstallRoot } from "./resolve-root.ts";
import { originOk, profileOk, secretOk } from "./validate.ts";

export type DoctorOptions = {
  readonly dir: string | undefined;
};

async function exists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function dockerComposeOk(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["compose", "version"], { stdio: "ignore" });
    child.on("error", () => {
      resolve(false);
    });
    child.on("close", (code) => {
      resolve(code === 0);
    });
  });
}

function originHost(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}

async function fetchText(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return undefined;
    return await res.text();
  } catch {
    return undefined;
  }
}

export async function runDoctor(options: DoctorOptions): Promise<number> {
  await showBanner(false);
  p.intro(pc.bold("OneSelf doctor"));

  const root = await resolveInstallRoot(options.dir);
  let fails = 0;
  let warns = 0;
  const fail = (msg: string) => {
    fails += 1;
    p.log.error(msg);
  };
  const warn = (msg: string) => {
    warns += 1;
    p.log.warn(msg);
  };
  const ok = (msg: string) => {
    p.log.success(msg);
  };

  p.log.step(`${pc.bold("安装路径")}  ${pc.cyan(root)}`);

  if (await dockerComposeOk()) ok("Docker Compose v2");
  else fail("没有 Docker Compose v2");

  if (
    !(await exists(path.join(root, "compose.yaml"))) ||
    !(await exists(path.join(root, "deploy/Caddyfile")))
  ) {
    fail("找不到 compose.yaml 或 deploy/Caddyfile。doctor 不会下载，也不会创建目录。");
  }

  let profile = "cloudflared";
  let origin = "";

  if (!(await exists(path.join(root, ".env")))) {
    fail("没有 .env");
  } else {
    if (process.platform !== "win32") {
      try {
        const mode = (await stat(path.join(root, ".env"))).mode & 0o777;
        if (mode !== 0o600) {
          warn(".env 不是仅当前用户可读（600）。检查不会改它。");
        }
      } catch {
        /* ignore */
      }
    }

    const env = await readEnvFile(path.join(root, ".env"));
    profile = env.get("COMPOSE_PROFILES") ?? "";
    if (profileOk(profile)) ok(`入口只有 ${profile}`);
    else {
      fail(`COMPOSE_PROFILES=${profile}，必须恰好是 cloudflared、caddy 或 tailscale`);
      profile = "cloudflared";
    }

    origin = env.get("PUBLIC_ORIGIN") ?? "";
    if (originOk(origin, process.env.ONESELF_ALLOW_HTTP === "1")) {
      ok(`站点地址 ${origin}`);
    } else {
      fail("站点地址不合法或仍是占位。不会从请求 Host 推断。");
      origin = "";
    }

    for (const key of [
      "OWNER_PASSWORD",
      "POSTGRES_PASSWORD",
      "RUSTFS_ACCESS_KEY",
      "RUSTFS_SECRET_KEY",
    ] as const) {
      const value = env.get(key) ?? "";
      if (secretOk(value)) ok(`${key} 已设置`);
      else fail(`${key} 仍是占位、为空，或含 $`);
    }

    if (profile === "cloudflared") {
      if (!(env.get("TUNNEL_TOKEN") ?? "")) {
        warn("TUNNEL_TOKEN 为空。入口可以失败，应用和数据库仍应留下。");
      }
    } else if (profile === "caddy") {
      const domain = env.get("APP_DOMAIN") ?? "";
      if (!domain) warn("APP_DOMAIN 为空");
      if (!(env.get("ACME_EMAIL") ?? "")) warn("ACME_EMAIL 为空");
      if (origin && domain && domain !== originHost(origin)) {
        warn("APP_DOMAIN 和 PUBLIC_ORIGIN 的主机名不一致。发现地址以 PUBLIC_ORIGIN 为准。");
      }
    } else if (profile === "tailscale") {
      if (!(env.get("TAILSCALE_AUTHKEY") ?? "")) {
        warn("TAILSCALE_AUTHKEY 为空。不要为此把数据库端口映射出去。");
      }
    }
  }

  if ((await exists(path.join(root, "compose.yaml"))) && (await dockerComposeOk())) {
    const services = await runningServices(root, profile);
    const ingresses = ["cloudflared", "caddy", "tailscale"].filter((n) => services.includes(n));
    if (ingresses.length > 1) fail(`有 ${ingresses.length} 个入口容器在跑`);
    else if (ingresses.length === 1) ok("正在跑的入口不超过一个");
    else warn("入口容器没在跑。没有令牌时这是允许的。");

    if (services.includes("postgres")) {
      const published = await composeCmd(root, profile, ["port", "postgres", "5432"]);
      const portLine = published.stdout.trim();
      if (portLine) fail(`PostgreSQL 映射到了宿主机：${portLine}`);
      else ok("PostgreSQL 没有宿主机端口");
    }
    if (services.includes("app")) ok("应用容器在跑");
    else warn("应用容器没在跑");
  }

  if (origin) {
    const pcp = await fetchText(`${origin}/.well-known/pcp`);
    if (pcp) {
      const compact = pcp.replace(/[ \n]/g, "");
      if (compact.includes('"protocol":"pcp"')) ok("发现文档可达");
      else fail("站点有响应，但不是 PCP 发现文档");
    } else {
      warn(`现在访问不到 ${origin}/.well-known/pcp`);
    }
    const skills = await fetchText(`${origin}/.well-known/agent-skills/index.json`);
    if (skills) {
      const compact = skills.replace(/[ \n]/g, "");
      if (compact.includes('"name":"oneself"') && compact.includes('"type":"archive"')) {
        ok("Skill 安装索引只有 oneself 的 archive");
      } else {
        fail("Skill 安装索引不是预期的 oneself archive");
      }
    }
  }

  if (fails > 0) {
    p.outro(`${pc.red(`${fails} 项失败`)}，${pc.yellow(`${warns} 项提醒`)}`);
    return 1;
  }
  p.outro(`${pc.green("通过")}，${pc.yellow(`${warns} 项提醒`)}`);
  return 0;
}
