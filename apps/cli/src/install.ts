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
import { type HostPortChoice, pickHostPort } from "./port.ts";
import { defaultInstallDir } from "./platform.ts";
import { isSourceCheckout, maybeSyncBundle, readInstalledRef } from "./sync.ts";
import { persistCliBinary } from "./self-bin.ts";
import { formatInstallSummary } from "./summary.ts";
import {
  DEFAULT_HOST_PORT,
  DEFAULT_PROFILE,
  INGRESS_PROFILES,
  type IngressProfile,
  localOrigin,
  localOriginOk,
  originOk,
  originOkFor,
  portOk,
  profileOk,
  secretOk,
} from "./validate.ts";

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
      : "用 Release 的 oneself.sh（curl|sh 会把终端接到 stdin 再提问）";
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
  // .env.example may still document a sample profile; force the interactive picker.
  await writeEnvValue(envPath, "COMPOSE_PROFILES", "");
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

const PROFILE_OPTIONS: { value: IngressProfile; label: string; hint: string }[] = [
  {
    value: "local",
    label: "本机/局域网",
    hint: "默认 · 用 http://本机IP:端口 访问，之后随时可换公网入口",
  },
  {
    value: "cloudflared",
    label: "Cloudflare Tunnel",
    hint: "公网 · 无需开放路由器端口",
  },
  {
    value: "caddy",
    label: "Caddy",
    hint: "公网 · 自有域名，需放行 80/443",
  },
  {
    value: "tailscale",
    label: "Tailscale",
    hint: "仅同一 tailnet 的设备可以访问",
  },
];

/** 非交互：沿用 .env 里的合法值，否则用 COMPOSE_PROFILES 环境变量，最后默认 local。 */
export function profileForYes(current: string, fromEnv: string | undefined): IngressProfile {
  if (profileOk(current)) return current;
  const value = fromEnv?.trim() ?? "";
  if (value === "") return DEFAULT_PROFILE;
  if (!profileOk(value)) {
    throw new Error(`非交互 COMPOSE_PROFILES=${value} 无效，只能是 ${INGRESS_PROFILES.join("、")}`);
  }
  return value;
}

async function chooseProfile(current: string, yes: boolean): Promise<IngressProfile> {
  if (yes) return profileForYes(current, process.env.COMPOSE_PROFILES);
  // 交互时总是给出四个入口（.env.example 的 COMPOSE_PROFILES 留空，不能跳过）。
  const answer = await p.select({
    message: "访问入口",
    options: PROFILE_OPTIONS,
    initialValue: profileOk(current) ? current : DEFAULT_PROFILE,
  });
  if (p.isCancel(answer)) {
    p.cancel("已取消");
    process.exit(1);
  }
  return answer;
}

async function askOrigin(
  profile: IngressProfile,
  hostPort: string,
  current: string,
  allowHttp: boolean,
  yes: boolean,
): Promise<string> {
  if (profile === "local") {
    const detected = localOrigin(hostPort);
    const fromEnv = process.env.PUBLIC_ORIGIN?.trim() ?? "";
    if (yes && fromEnv !== "" && !localOriginOk(fromEnv, hostPort)) {
      throw new Error(
        `非交互参数无效（PUBLIC_ORIGIN）：本机入口需要 http://主机:${hostPort}，收到 ${fromEnv}`,
      );
    }
    // 旧的 https 公网地址或端口对不上的地址不会沿用，改用探测到的地址重配。
    const fallback = localOriginOk(fromEnv, hostPort)
      ? fromEnv
      : localOriginOk(current, hostPort)
        ? current
        : detected;
    p.log.step(pc.bold("站点地址"));
    if (detected.startsWith("http://127.0.0.1:")) {
      p.log.warn(
        "没有在物理网卡上探测到局域网 IPv4（已跳过 docker、vEthernet/WSL、网桥、VPN 等虚拟网卡），默认地址只能在本机访问；请改成本机的局域网或公网 IP",
      );
    } else {
      p.log.message(pc.dim(`已探测到本机地址 ${detected}，回车直接使用`));
    }
    p.log.message(
      pc.dim("云主机请改成公网 IP（并在安全组放行该端口）；以后可再换 Cloudflare/Caddy/Tailscale"),
    );
    const answer = await askText(
      {
        message: "地址",
        placeholder: fallback,
        defaultValue: fallback,
        validate(value) {
          if (value.trim() === "" || localOriginOk(value, hostPort)) return undefined;
          return `请输入 http://IP:${hostPort} 或 http://主机:${hostPort}（本机入口只提供 HTTP，端口须与宿主机端口一致），不要带路径`;
        },
      },
      yes,
      fallback,
    );
    return answer.trim() || fallback;
  }
  p.log.step(pc.bold("公开站点地址"));
  p.log.message(pc.dim("对外可访问的 HTTPS 根地址，例如 https://oneself.example.com"));
  p.log.message(pc.dim("用于 Agent 接入、批准页与媒体链接；不要带路径，不要用 localhost"));
  return askText(
    {
      message: "地址",
      placeholder: "https://你的域名",
      ...(originOk(current, allowHttp) ? { initialValue: current } : {}),
      validate(value) {
        if (!originOk(value, allowHttp)) {
          return "请输入 https://主机 或 https://主机:端口，不要带路径，不要用 localhost";
        }
        return undefined;
      },
    },
    yes,
    process.env.PUBLIC_ORIGIN ?? (originOk(current, allowHttp) ? current : undefined),
  );
}

function warnMoved(choice: HostPortChoice): void {
  if (choice.movedFrom !== undefined) {
    p.log.warn(
      `端口 ${String(choice.movedFrom)} 已被占用，自动改用空闲端口 ${String(choice.port)}`,
    );
  }
}

/**
 * 本机入口的宿主机端口：默认 3000，被占用时自动往后找空闲端口并告知。
 * 只有 --yes 下用 HOST_PORT 环境变量明确指定、且该端口被占用时才报错。
 * 只在首次选本机入口（或旧值非法）时调用，此时 OneSelf 自己的 local 容器还没占着这个端口。
 */
async function chooseHostPort(current: string, yes: boolean): Promise<string> {
  const envPort = process.env.HOST_PORT?.trim() ?? "";
  if (envPort !== "" && !portOk(envPort)) {
    if (yes) throw new Error(`非交互参数无效（HOST_PORT）：${envPort}`);
    p.log.warn(`忽略不合法的 HOST_PORT=${envPort}`);
  }
  const explicit = portOk(envPort);
  const base = explicit ? envPort : portOk(current) ? current : DEFAULT_HOST_PORT;
  if (yes) {
    const choice = await pickHostPort(Number(base), explicit);
    warnMoved(choice);
    return String(choice.port);
  }
  // 交互：默认值先换成空闲端口，再让用户确认或改。
  const suggested = await pickHostPort(Number(base), false);
  warnMoved(suggested);
  const fallback = String(suggested.port);
  const answer =
    (
      await askText(
        {
          message: "宿主机端口",
          placeholder: fallback,
          defaultValue: fallback,
          validate(value) {
            // 空值表示接受默认端口。
            if (value.trim() === "" || portOk(value)) return undefined;
            return "请输入 1-65535 之间的端口";
          },
        },
        false,
      )
    ).trim() || fallback;
  if (answer === fallback) return answer;
  // 用户自己输入的端口也可能被占用：自动换成后面的空闲端口并告知。
  const choice = await pickHostPort(Number(answer), false);
  warnMoved(choice);
  return String(choice.port);
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

  const previousProfile = existing.get("COMPOSE_PROFILES") ?? "";
  const profile = await chooseProfile(previousProfile, options.yes);
  if (!options.dryRun) {
    await writeEnvValue(envPath, "COMPOSE_PROFILES", profile);
  }

  let hostPort = "";
  if (profile === "local") {
    hostPort = existing.get("HOST_PORT") ?? "";
    if (!portOk(hostPort) || previousProfile !== "local") {
      hostPort = await chooseHostPort(hostPort, options.yes);
    }
    if (!options.dryRun) await writeEnvValue(envPath, "HOST_PORT", hostPort);
  }

  // 站点地址：入口变了（例如 cloudflared → local）或现值不适合所选入口时重新问。
  let origin = existing.get("PUBLIC_ORIGIN") ?? "";
  const allowHttp = process.env.ONESELF_ALLOW_HTTP === "1";
  const switched = previousProfile !== "" && previousProfile !== profile;
  if (
    !originOkFor(profile, origin, allowHttp, profile === "local" ? hostPort : undefined) ||
    switched
  ) {
    origin = (await askOrigin(profile, hostPort, origin, allowHttp, options.yes))
      .trim()
      .replace(/\/$/, "");
    if (!options.dryRun) await writeEnvValue(envPath, "PUBLIC_ORIGIN", origin);
  }

  if (profile === "cloudflared") {
    const token = existing.get("TUNNEL_TOKEN") ?? "";
    if (!token && !options.yes) {
      const answer = await askPassword({ message: "Cloudflare Tunnel 令牌（可选）" }, false);
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
      const answer = await askPassword({ message: "Tailscale auth key（可选）" }, false);
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
    formatInstallSummary({
      origin,
      root,
      localOnly: profile === "local",
      launchers,
      binary,
    }),
  );
}
