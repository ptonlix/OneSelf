import { access, copyFile, mkdir, constants as fsConstants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import pc from "picocolors";

import { showBanner } from "./banner.ts";
import { startStack, stopOtherIngress } from "./compose.ts";
import { readEnvFile, writeEnvValue } from "./env-file.ts";
import { bundledRef, fetchComposeBundle, writeReleasePin } from "./fetch-bundle.ts";
import { installLaunchers } from "./launchers.ts";
import { defaultInstallDir } from "./platform.ts";
import { isSourceCheckout, maybeSyncBundle, readInstalledRef } from "./sync.ts";
import { formatBinaryNextSteps, persistCliBinary } from "./self-bin.ts";
import { originOk, profileOk, secretOk } from "./validate.ts";

export type InstallOptions = {
  readonly dir: string;
  readonly dryRun: boolean;
  readonly yes: boolean;
};

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function sourceRepoRoot(): string | undefined {
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  } catch {
    return undefined;
  }
}

function requireTtyOrYes(yes: boolean): void {
  if (yes) return;
  if (process.stdin.isTTY && process.stdout.isTTY) return;
  const entry =
    process.platform === "win32"
      ? "在交互式 PowerShell 窗口里运行 Release 的 oneself.ps1（irm | iex）"
      : "用 Release 的 oneself.sh（curl|sh 会从 /dev/tty 提问）";
  throw new Error(`非交互终端：请${entry}，或设置 ONESELF_YES=1 / --yes 并预先写好环境变量。`);
}

async function ensureLayout(root: string, dryRun: boolean): Promise<void> {
  const compose = path.join(root, "compose.yaml");
  const example = path.join(root, ".env.example");
  const caddy = path.join(root, "deploy/Caddyfile");
  if ((await pathExists(compose)) && (await pathExists(example)) && (await pathExists(caddy))) {
    await maybeSyncBundle(root, dryRun);
    return;
  }
  if (dryRun) {
    p.log.info("dry-run：会准备 compose.yaml、.env.example 与 deploy/Caddyfile");
    return;
  }
  await mkdir(path.join(root, "deploy"), { recursive: true });
  const repo = sourceRepoRoot();
  if (
    repo &&
    (await pathExists(path.join(repo, "compose.yaml"))) &&
    (await pathExists(path.join(repo, ".env.example")))
  ) {
    await copyFile(path.join(repo, "compose.yaml"), compose);
    await copyFile(path.join(repo, ".env.example"), example);
    await copyFile(path.join(repo, "deploy/Caddyfile"), caddy);
    p.log.success("已从本仓库复制 Compose 安装文件");
    return;
  }
  const tag = await fetchComposeBundle(root);
  p.log.success(`已下载 Release ${tag} 安装包（已校验 SHA256）`);
}

async function ensureEnvFile(root: string, dryRun: boolean): Promise<string> {
  const envPath = path.join(root, ".env");
  const example = path.join(root, ".env.example");
  if (await pathExists(envPath)) return envPath;
  if (dryRun) {
    p.log.info("dry-run：会从 .env.example 创建 .env");
    return envPath;
  }
  if (!(await pathExists(example))) throw new Error(`缺少 ${example}`);
  await copyFile(example, envPath);
  const { chmod } = await import("node:fs/promises");
  await chmod(envPath, 0o600);
  return envPath;
}

export async function askText(
  opts: Parameters<typeof p.text>[0],
  yes: boolean,
  fallback?: string,
): Promise<string> {
  if (yes) {
    const value = fallback?.trim() ?? "";
    if (value === "") {
      throw new Error(`非交互缺少必填项：${opts.message}`);
    }
    // --yes must not bypass the same validation the prompt would run.
    const problem = opts.validate?.(value);
    if (problem) {
      const why = problem instanceof Error ? problem.message : problem;
      throw new Error(`非交互参数无效（${opts.message}）：${why}`);
    }
    return value;
  }
  const answer = await p.text(opts);
  if (p.isCancel(answer)) {
    p.cancel("已取消");
    process.exit(1);
  }
  return answer;
}

async function askPassword(
  opts: Parameters<typeof p.password>[0],
  yes: boolean,
  envName?: string,
): Promise<string> {
  if (yes) {
    const fromEnv = envName ? process.env[envName] : undefined;
    if (fromEnv && secretOk(fromEnv)) return fromEnv;
    throw new Error(`非交互缺少口令：${opts.message}`);
  }
  const answer = await p.password(opts);
  if (p.isCancel(answer)) {
    p.cancel("已取消");
    process.exit(1);
  }
  return answer;
}

function originHostOf(origin: string): string {
  const rest = origin.replace(/^https?:\/\//, "");
  const colon = rest.indexOf(":");
  return colon === -1 ? rest : rest.slice(0, colon);
}

/** Platform-correct update command lines for the completion summary. */
export function updateHints(root: string, platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "win32") {
    const ps1 = path.win32.join(root, "oneself.ps1");
    return [
      `更新        powershell -ExecutionPolicy Bypass -File "${ps1}" update`,
      "升级正式版  在 PowerShell 里再执行一次新 Release 的 irm … | iex；已有口令不会被覆盖",
    ];
  }
  return [
    `更新        ${path.posix.join(root, "oneself.sh")} update`,
    "升级正式版  再执行一次新 Release 的 curl … | sh；已有口令不会被覆盖",
  ];
}

export async function runInstall(options: InstallOptions): Promise<void> {
  requireTtyOrYes(options.yes);
  await showBanner(true);
  process.stdout.write("\n");
  p.intro(pc.bold("OneSelf 安装"));

  const root = path.resolve(options.dir || defaultInstallDir());
  p.log.step(`${pc.bold("安装路径")}  ${pc.cyan(root)}`);
  p.log.message(pc.dim("如需指定路径，请使用 --dir 或 ONESELF_DIR"));

  if (await isSourceCheckout(root)) {
    p.log.warn("这是源码目录。此 CLI 启动的是生产 Compose，不是 pnpm dev。");
    if (process.env.ONESELF_IN_REPO !== "1") {
      throw new Error("源码目录里继续，请显式设置 ONESELF_IN_REPO=1");
    }
    if (!options.yes) {
      const ok = await p.confirm({
        message: "仍然在这个目录安装生产栈？",
        initialValue: false,
      });
      if (p.isCancel(ok) || !ok) {
        p.cancel("已取消");
        process.exit(1);
      }
    }
  }

  await ensureLayout(root, options.dryRun);
  const envPath = await ensureEnvFile(root, options.dryRun);
  const existing = options.dryRun ? new Map<string, string>() : await readEnvFile(envPath);

  // Pin image from release file or ONESELF_REF when managed.
  if (!options.dryRun) {
    let tag = await readInstalledRef(root);
    if (!tag) {
      const ref = bundledRef();
      if (ref !== "latest") tag = ref;
    }
    if (tag) await writeReleasePin(root, tag);
  }

  let origin = existing.get("PUBLIC_ORIGIN") ?? "";
  if (!originOk(origin, process.env.ONESELF_ALLOW_HTTP === "1")) {
    p.log.step(pc.bold("公开站点地址"));
    p.log.message(pc.dim("对外可访问的 HTTPS 根地址，例如 https://oneself.example.com"));
    p.log.message(pc.dim("用于 Agent 接入、批准页与媒体链接；不要带路径，不要用 localhost"));
    origin = (
      await askText(
        {
          message: "地址",
          placeholder: "https://你的域名",
          validate(value) {
            if (!originOk(value, process.env.ONESELF_ALLOW_HTTP === "1")) {
              return "请输入 https://主机 或 https://主机:端口，不要带路径，不要用 localhost";
            }
            return undefined;
          },
        },
        options.yes,
        process.env.PUBLIC_ORIGIN,
      )
    )
      .trim()
      .replace(/\/$/, "");
    if (!options.dryRun) await writeEnvValue(envPath, "PUBLIC_ORIGIN", origin);
  }

  let login = existing.get("OWNER_LOGIN") ?? "";
  if (!login) {
    login =
      (
        await askText(
          {
            message: "管理员登录名",
            placeholder: "owner",
            defaultValue: "owner",
          },
          options.yes,
          process.env.OWNER_LOGIN ?? "owner",
        )
      ).trim() || "owner";
    if (!options.dryRun) await writeEnvValue(envPath, "OWNER_LOGIN", login);
  }

  let owner = existing.get("OWNER_PASSWORD") ?? "";
  if (!secretOk(owner)) {
    owner = await askPassword(
      {
        message: "管理员初始密码",
        validate(value) {
          if (!secretOk(value)) {
            return "不能为空、不能是 change-me，也不能含 $ 或反引号";
          }
          return undefined;
        },
      },
      options.yes,
      "OWNER_PASSWORD",
    );
    if (!options.yes) {
      await askPassword(
        {
          message: "再输入一次密码",
          validate(value) {
            if (value !== owner) return "两次不一致";
            return undefined;
          },
        },
        false,
      );
    }
    if (!options.dryRun) await writeEnvValue(envPath, "OWNER_PASSWORD", owner);
  }

  let profile = existing.get("COMPOSE_PROFILES") ?? "";
  if (!profileOk(profile)) {
    if (options.yes) {
      profile = process.env.COMPOSE_PROFILES ?? "cloudflared";
      if (!profileOk(profile)) {
        throw new Error("非交互需要合法的 COMPOSE_PROFILES");
      }
    } else {
      const answer = await p.select({
        message: "公网入口",
        options: [
          {
            value: "cloudflared",
            label: "Cloudflare Tunnel",
            hint: "推荐 · 无需开放路由器端口",
          },
          {
            value: "caddy",
            label: "Caddy",
            hint: "自有域名，公网需放行 80/443",
          },
          {
            value: "tailscale",
            label: "Tailscale",
            hint: "仅同尾网设备（Serve，不开 Funnel）",
          },
        ],
        initialValue: "cloudflared",
      });
      if (p.isCancel(answer)) {
        p.cancel("已取消");
        process.exit(1);
      }
      profile = answer;
    }
    if (!options.dryRun) {
      await writeEnvValue(envPath, "COMPOSE_PROFILES", profile);
    }
  }

  if (profile === "cloudflared") {
    const token = existing.get("TUNNEL_TOKEN") ?? "";
    if (!token && !options.yes) {
      const answer = await askPassword(
        { message: "Cloudflare Tunnel 令牌（可留空，稍后补）" },
        false,
      );
      if (answer && !options.dryRun) {
        await writeEnvValue(envPath, "TUNNEL_TOKEN", answer);
      }
    } else if (!token && process.env.TUNNEL_TOKEN && !options.dryRun) {
      await writeEnvValue(envPath, "TUNNEL_TOKEN", process.env.TUNNEL_TOKEN);
    }
  } else if (profile === "caddy") {
    if (!(existing.get("APP_DOMAIN") ?? "")) {
      const originHost = originHostOf(origin);
      const domain = await askText(
        {
          message: "域名 APP_DOMAIN（须与站点地址主机名一致）",
          placeholder: originHost,
          validate(value) {
            const v = value.trim();
            if (v && originHost && v !== originHost) {
              return `须与 PUBLIC_ORIGIN 的主机名 ${originHost} 一致`;
            }
            return undefined;
          },
        },
        options.yes,
        process.env.APP_DOMAIN,
      );
      if (domain.trim() && !options.dryRun) {
        await writeEnvValue(envPath, "APP_DOMAIN", domain.trim());
      }
    }
    if (!(existing.get("ACME_EMAIL") ?? "")) {
      const email = await askText({ message: "ACME 邮箱" }, options.yes, process.env.ACME_EMAIL);
      if (email.trim() && !options.dryRun) {
        await writeEnvValue(envPath, "ACME_EMAIL", email.trim());
      }
    }
  } else if (profile === "tailscale") {
    const key = existing.get("TAILSCALE_AUTHKEY") ?? "";
    if (!key && !options.yes) {
      const answer = await askPassword({ message: "Tailscale auth key（可留空，稍后补）" }, false);
      if (answer && !options.dryRun) {
        await writeEnvValue(envPath, "TAILSCALE_AUTHKEY", answer);
      }
    } else if (!key && process.env.TAILSCALE_AUTHKEY && !options.dryRun) {
      await writeEnvValue(envPath, "TAILSCALE_AUTHKEY", process.env.TAILSCALE_AUTHKEY);
    }
  }

  if (options.dryRun) {
    p.outro(pc.dim("dry-run 结束：未写入 .env，也未启动容器"));
    return;
  }

  await stopOtherIngress(
    root,
    profile,
    false,
    (msg) => {
      p.log.warn(msg);
    },
    (msg) => {
      p.log.info(msg);
    },
  );

  p.log.step("正在拉取镜像并启动 Compose…");
  const envNow = await readEnvFile(envPath);
  const image = envNow.get("ONESELF_IMAGE") ?? "";
  if (image.endsWith(":local") || image === "oneself:local") {
    const { composeCmd } = await import("./compose.ts");
    const up = await composeCmd(root, profile, ["--env-file", ".env", "up", "-d", "--build"], true);
    if (up.code !== 0) throw new Error("docker compose up --build 失败");
  } else {
    await startStack(root, profile);
  }

  const binary = await persistCliBinary(root);
  const launchers = await installLaunchers(root);
  p.outro(
    [
      pc.bold("下一步"),
      `管理端      ${origin}/admin`,
      `Agent 发现  ${origin}/.well-known/pcp`,
      `接入 Agent  npx skills add ${origin} -a <agent> -s oneself -y`,
      `安装路径    ${root}`,
      ...(launchers ? updateHints(root) : []),
      ...formatBinaryNextSteps(binary),
    ].join("\n"),
  );
}
