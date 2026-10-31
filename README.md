<div align="center">

<img src="docs/images/hero.png" alt="OneSelf: One self. One context. Every AI." width="100%" />

<h1>OneSelf</h1>

<p><strong>One self. One context. Every AI.</strong></p>

<p>开源个人上下文管理：建立一份关于你的上下文，让每个 AI 都了解你，在隐私与效率之间取得平衡。</p>

<p>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white" alt="Node.js 24" />
  <img src="https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white" alt="Hono 4" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 18" />
  <img src="https://img.shields.io/badge/MCP-Streamable_HTTP-6E56CF" alt="MCP Streamable HTTP" />
</p>

<p>
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-架构">架构</a> ·
  <a href="#-agent-入口">Agent 入口</a> ·
  <a href="#-文档">文档</a> ·
  <a href="README_EN.md">English</a>
</p>

</div>

---

## 💡 这是什么

每接入一个 AI，就要把自己的背景重新讲一遍；讲得越多，越分不清哪些可以公开、哪些只该给某一个 AI。

OneSelf 是开源、自托管的**个人上下文管理**系统。简历、经历、笔记、照片和证件扫描件汇成一份关于你的上下文：文字整理成页面，图片和 PDF 作为原件挂在页面上。任何 AI Agent 都通过同一套 PCP 操作（HTTP 与 MCP）读取、写回和维护它；哪个 Agent 能看哪些目录、能不能修改、能不能公开，都由你批准，也能随时收回。公开主页只展示你标为公开的内容。

- **效率**：一份上下文，所有 AI 共用；Agent 读发现文档和 Skill 即可自助接入。
- **隐私**：默认私有，按目录授权，整套服务跑在你自己的机器上。

> One self. One context. Every AI. 你决定哪些上下文、给哪个 AI、给多少、何时收回。

## ✨ 特性

**Agent-first：Agent 负责读取、整理和维护；你划定边界——给谁、给多少、何时收回。**

**🗂️ 管理**

- **一份上下文，汇集所有资料**：经历、笔记、证件摘要写成页面，照片和 PDF 作为原件上传并挂到页面上；事实、时间线、标签和页面链接可检索。
- **改动可追溯、可回退**：增量编辑带版本校验；每页保留最近 50 个版本，删除后 30 天内可恢复。

**🔐 隐私**

- **默认私有，公开由你决定**：按目录分读、写、改可见性；没有权限时，私有页和不存在的页看起来一样。公开主页改版需你批准才上线。
- **每次授权你批准，随时可收回**：API Key 或 OAuth 设备码都要在批准页确认；密钥与授权可单独作废。Agent 不能给自己发密钥，也不能替你批准。
- **数据留在你的机器上**：Node.js + PostgreSQL + RustFS，Docker Compose 部署；Agent 只走接口。

**⚡ 效率**

- **自助接入**：读 `/.well-known/pcp` 和 Skill `oneself` 即可；HTTP（OpenAPI）与 MCP 同一张操作表。
- **AI 帮你维护**：Agent 可整理原件成页面、记住或忘掉事实、补时间线与标签；下次任何 AI 读到的都是最新的你。

## 🚀 快速开始

### 🐳 方式一：Docker Compose

需要 Docker 与 Docker Compose v2。

```bash
curl -fsSL https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.sh | sh
```

按提示选对外源和入口，启动后打开打印的 `PUBLIC_ORIGIN`，到 `/admin` 改密，把 `PUBLIC_ORIGIN/.well-known/pcp` 交给 Agent。

Windows 用 PowerShell：

```powershell
powershell -c "irm https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.ps1 | iex"
```

默认装到用户数据目录（不进源码树）。换目录、入口（Cloudflare / Caddy / Tailscale）、更新与排查见 [部署](#-部署)；变量说明见 [配置](#-配置)。仓库内脚本：[deploy/oneself.sh](deploy/oneself.sh)、[deploy/oneself.ps1](deploy/oneself.ps1)。

### 💻 方式二：本地开发

需要 Node.js `>=24`、pnpm 12.9.1（Corepack）、Docker。

```bash
corepack enable
corepack prepare pnpm@12.9.1 --activate
pnpm install --frozen-lockfile
docker compose -f compose.dev.yaml up -d
```

在仓库根新建 `.env`（这些口令只给本机；本地不要设 `PUBLIC_ORIGIN`，应用用 `http://127.0.0.1:3000`）：

```bash
DATABASE_URL=postgres://oneself:oneself@127.0.0.1:5432/oneself
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_BUCKET=oneself
OBJECT_STORAGE_ACCESS_KEY=oneself
OBJECT_STORAGE_SECRET_KEY=oneselfsecret
OWNER_LOGIN=owner
OWNER_PASSWORD=<自己设一个初始口令>
```

```bash
pnpm dev
```

打开 <http://127.0.0.1:3000> 与 <http://127.0.0.1:3000/admin>。`compose.dev.yaml` 只起 PostgreSQL 和 RustFS（绑定 `127.0.0.1`）。更多命令见 [开发](#-开发)。

## 🔧 配置

完整变量和注释见 [`.env.example`](.env.example)。`.env` 已被 Git 忽略，不要提交真实口令。

| 变量                                                              | 说明                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `PUBLIC_ORIGIN`                                                   | 唯一对外源。发现文档、OAuth issuer、批准地址和媒体地址只用它；为 HTTPS 时 Cookie 加 `Secure`       |
| `OWNER_LOGIN` / `OWNER_PASSWORD`                                  | 第一次启动且还没有所属人时创建唯一的所属人账号，只存 Argon2id 哈希，并强制下次登录改密             |
| `OWNER_RESET_PASSWORD`                                            | 忘记密码时临时设置，重启后替换哈希并再次强制改密，用完删掉。没有邮箱找回                           |
| `DATABASE_URL`                                                    | PostgreSQL 连接串。Compose 中由 `POSTGRES_PASSWORD` 拼出                                           |
| `OBJECT_STORAGE_*`                                                | S3 兼容对象存储的端点、区域、桶和密钥。Compose 中由 `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` 提供 |
| `COMPOSE_PROFILES`                                                | 公网入口：`cloudflared`（默认）、`caddy` 或 `tailscale`，同一时间只启用一个                        |
| `TUNNEL_TOKEN` / `APP_DOMAIN`、`ACME_EMAIL` / `TAILSCALE_AUTHKEY` | 分别给 cloudflared、Caddy、Tailscale 使用                                                          |
| `ONESELF_IMAGE`                                                   | 应用镜像。安装用 `docker.io/ptonlix/oneself:latest`。自己从源码构建时改成 `oneself:local`          |
| `HOST` / `PORT`                                                   | 监听地址和端口，默认 `127.0.0.1:3000`；容器内设为 `0.0.0.0`                                        |

## 🧱 架构

<p align="center">
  <img src="docs/images/architecture.png" alt="OneSelf 架构：所属人在管理端批准授权、随时收回，并整理个人上下文；任意 AI Agent / 脚本用所属人批准的 API Key 或 OAuth 设备码接入 PCP（HTTP 与 MCP 同一套操作）；访客打开公开主页，只读取公开内容；个人上下文由页面和原件组成，按目录授权、默认私有、版本可回退，存放在自托管的 RustFS 与 PostgreSQL" width="100%" />
</p>

- **一个进程**：PCP、MCP、OAuth、管理端和已发布站点都由同一个 Hono 应用提供。
- **规则不在路由里**：HTTP / MCP 只做认证与返回；用例在 `apps/server/src/app`，业务规则在 `packages/domain`。
- **原文与投影分离**：页面原文与原件以对象存储为准；PostgreSQL 中的正文、标签、链接、事实和时间线是投影。

| 角色     | 能做什么                                                                                              | 不能做什么                             |
| -------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 所属人   | 登录管理端，批准 API Key 和设备码授权，作废密钥和授权，同意主页上线，删除或恢复目录                   | 没有邮箱找回密码                       |
| AI Agent | 用批准过的 API Key 或设备码令牌，在授权的目录和权限内调用同一组操作；有 `site:write` 时可申请主页上线 | 不能创建或管理密钥，不能批准授权或上线 |
| 访客     | 打开当前上线的公开站点，读取公开内容和公开原件                                                        | 读不到任何 `private` 页                |

Mermaid 版系统总览、代码边界、数据表和关键流程见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#系统总览图)。

## 🤖 Agent 入口

| 路径                                   | 谁用           | 用途                                                                                   |
| -------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `/.well-known/pcp`                     | Agent          | 发现文档：协议版本、操作清单、认证头、公开接口、上传限制、OpenAPI、MCP、OAuth 和 Skill |
| `/.well-known/agent-skills/index.json` | 安装器         | 产品 Skill `oneself` 的 archive 索引                                                   |
| `/skills/oneself/SKILL.md`             | Agent          | 唯一产品 Skill。写页前读 context reference，改公开页前读 public-page reference         |
| `/openapi.json`                        | Agent、脚本    | 由操作注册表和 MCP 同一份输入 schema 生成的 OpenAPI                                    |
| `POST /mcp`                            | MCP 客户端     | Streamable HTTP，认证头与 PCP 相同                                                     |
| `/pcp/v1/*`                            | 已认证的调用方 | 页、原件、检索、结构、目录、身份和站点操作                                             |
| `/pcp/v1/public/*`                     | 任何人         | 只返回 `visibility: public` 且未删除的页                                               |
| `/media/{id}`                          | 视所属页而定   | 原件字节。所属页公开时匿名可读                                                         |
| `/oauth/device/auth`、`/oauth/token`   | Agent          | 申请设备码、换取和刷新访问令牌                                                         |
| `/admin`                               | 所属人         | 登录、改密、批准设备码、API Key 和站点上线                                             |
| `/_preview/{releaseId}/`               | 任何人         | 未上线 release 的预览                                                                  |

接入二选一：API Key（`Authorization: ApiKey <key>` 或 `X-Api-Key`），或 OAuth 2.1 设备码访问令牌（`Authorization: Bearer <token>`）。都要所属人批准。路径以 [`packages/operations/src/registry.ts`](packages/operations/src/registry.ts) 为准。

<details>
<summary><strong>PCP 操作清单</strong></summary>

| 分组       | 操作                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面       | `put_page`、`edit_page`、`put_pages`、`get_page`、`list_pages`、`delete_page`、`restore_page`、`get_versions`、`revert_version`、`resolve_slugs`         |
| 原件       | `file_upload`、`file_list`、`file_url`                                                                                                                   |
| 检索       | `search`、`query`、`recall`                                                                                                                              |
| 结构回写   | `add_tag`、`remove_tag`、`get_tags`、`add_link`、`remove_link`、`get_links`、`get_backlinks`、`add_timeline_entry`、`get_timeline`、`remember`、`forget` |
| 目录与身份 | `sources_list`、`sources_add`、`sources_delete`、`sources_restore`、`sources_status`、`whoami`、`list_skills`、`get_skill`                               |
| 站点       | `list_sites`、`get_site`、`put_site`、`preview_site`、`activate_site`                                                                                    |
| 仅 HTTP    | `create_api_key`、`list_api_keys`、`revoke_api_key`                                                                                                      |

</details>

## 🧩 上下文怎么组织

一份上下文由**页面**和**原件**组成，按目录（source）分组，例如 `profile`、`career`、`health`：

- **页面**：由 `(source, slug)` 标识；`type`、`title`、`visibility` 等写在 frontmatter 里。需要有效期或置信度的陈述放进 `## Facts`，经历放进 `## Timeline`。
- **原件**：JPEG、PNG、WebP、GIF、PDF（单个最大 20 MiB）用 `file_upload` 上传，在页面的 `files` 里引用；挂接页公开时原件才可匿名访问。

```markdown
---
type: profile
title: 工程师
name: 张三
visibility: public
tags: [public-profile]
files: []
---

# 张三

做个人工具和开发者产品。

## Facts

- id: fact_01
  entity: 张三
  statement: 现居上海
  confidence: 0.9
  valid_until: 2027-01-01

## Timeline

- 2024-06-01 | 加入某公司 | 做后端
```

完整规则见 [skills/oneself/references/context.md](skills/oneself/references/context.md)。

## 📁 项目结构

```text
OneSelf/
├── apps/
│   ├── server/            # 唯一的 Node 进程：pcp/、mcp/、oauth/、owner/、site-files/
│   └── admin/             # 管理端（Vite + React）
├── packages/
│   ├── domain/            # 纯业务规则
│   ├── operations/        # 操作注册表
│   ├── ports/ / adapters/ # 对象存储、时钟、解析的接口与实现
│   ├── db/                # Drizzle 与 SQL 迁移
│   ├── public-client/     # 匿名公开 PCP 客户端
│   └── public-page/       # 内置公开页源码
├── skills/oneself/        # 产品 Skill
├── tests/                 # 冒烟与 Skill 验收
├── deploy/                # 安装脚本与 Caddyfile
├── docs/                  # PRD 与架构
├── compose.yaml           # 生产：应用 + PostgreSQL + RustFS + 入口
├── compose.dev.yaml       # 本地依赖：PostgreSQL + RustFS
└── Dockerfile
```

## 🧪 开发

```bash
pnpm check            # Prettier、ESLint、tsc、Vitest、dependency-cruiser、Knip
pnpm test             # 单元与进程内接口测试（不需要 Compose）
pnpm test:smoke       # 闭环冒烟：复用已启动的 compose.dev.yaml
pnpm boundaries       # 包依赖方向
pnpm db:migrate       # 只迁移，不启动应用
pnpm data:export -- --out oneself-export --stopped
pnpm data:import -- --from oneself-export.tar.gz --stopped
pnpm dev              # 构建管理端和内置公开页，再启动应用
```

导出/导入与冒烟的细节（`--via compose`、独立 smoke 库与桶等）见脚本帮助或 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。`pnpm check` 是合并前门禁。行为以 [docs/PRD.md](docs/PRD.md) 为准。

## 🚢 部署

<details>
<summary><strong>Docker Compose 部署与公网入口</strong></summary>

安装脚本默认目录：`$HOME/.local/share/oneself`（或 `$XDG_DATA_HOME/oneself`）；Windows 为 `%LOCALAPPDATA%\oneself`。可用 `ONESELF_DIR` 或 `sh -s -- --dir` 换目录；非交互加 `ONESELF_YES=1`。`--dir` 不改变 Compose 项目名 `oneself`。

从 Release 取到的脚本会把镜像固定到该版本；在安装目录执行 `./oneself.sh update` 或再跑一次安装命令可更新，已有口令不会被覆盖。`doctor` 只检查。也可手动：`cp .env.example .env`，填好变量后 `docker compose pull && docker compose up -d`。

`compose.yaml` 含应用、PostgreSQL 18 和 RustFS；应用与数据都不映射宿主机端口。镜像：`docker.io/ptonlix/oneself`。公网入口由 `.env` 的 `COMPOSE_PROFILES` 选择：

| profile               | 谁能访问                  | 需要                                               |
| --------------------- | ------------------------- | -------------------------------------------------- |
| `cloudflared`（默认） | 公网，主机名在 Cloudflare | `TUNNEL_TOKEN`。不开放路由器端口                   |
| `caddy`               | 公网，自己的域名          | `APP_DOMAIN`、`ACME_EMAIL`，80/443 可达            |
| `tailscale`           | 同一 tailnet              | `TAILSCALE_AUTHKEY`。只做 Serve，不开 Funnel       |

`PUBLIC_ORIGIN` 须与所选入口一致。Cloudflare 不要缓存 `/pcp`、`/oauth`、`/.well-known`、`/admin`、`/skills`、`/media`、`/_preview`。Agent 接入：`npx skills add https://站点 -a <agent> -s oneself`。

</details>

## 📚 文档

- [产品需求（PRD）](docs/PRD.md)
- [技术架构](docs/ARCHITECTURE.md)
- [Skill：oneself](skills/oneself/SKILL.md)
- 运行中的实例：`/.well-known/pcp`、`/openapi.json`、`/skills/oneself/SKILL.md`
- 安装 Skill：`npx skills add https://站点`

## 🤝 贡献

欢迎 Issue 和 Pull Request。

1. 从当前 `main` 拉分支。
2. 改动与 [docs/PRD.md](docs/PRD.md) 范围一致；操作名、权限或错误码有变时，先改文档和 [`packages/operations`](packages/operations/src/registry.ts)。
3. 提交前运行 `pnpm check`。
4. 发起 PR，说明行为变化和验证方式。
