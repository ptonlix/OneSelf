<div align="center">

<img src="docs/images/hero.png" alt="OneSelf: One self. One context. Every AI." width="100%" />

<h1>OneSelf</h1>

<p><strong>One self. One context. Every AI.</strong></p>

<p>开源个人上下文管理：建立一份关于你的上下文，让每个 AI 都了解你，在隐私与效率之间取得平衡。</p>

<p>
  <a href="https://github.com/ptonlix/OneSelf/stargazers"><img src="https://img.shields.io/github/stars/ptonlix/OneSelf" alt="GitHub stars" /></a>
  <a href="https://github.com/ptonlix/OneSelf/releases/latest"><img src="https://img.shields.io/github/v/release/ptonlix/OneSelf" alt="GitHub release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/ptonlix/OneSelf" alt="MIT license" /></a>
  <a href="https://hub.docker.com/r/ptonlix/oneself"><img src="https://img.shields.io/docker/pulls/ptonlix/oneself" alt="Docker pulls for ptonlix/oneself" /></a>
  <a href="https://github.com/ptonlix/OneSelf/actions/workflows/ci.yml"><img src="https://github.com/ptonlix/OneSelf/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

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

https://github.com/user-attachments/assets/98c48652-0ec5-476c-a6b6-bd5dde7151a5

---

## 💡 这是什么

不必每次都从自我介绍开始。

换了一个 AI，你还是你。你的经历、知识、作品和偏好，不应该跟着某个平台走。

OneSelf 把这些资料放回你自己手里。

开源、自托管，一份个人资料，多种 AI 共用。每一次读取、修改和公开，都由你授权。

**你的资料，你做主。AI 来了解你，而不是你反复适应 AI。**

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

### 🐳 方式一：CLI 安装

> 需要 Docker 与 Docker Compose v2。

**macOS / Linux**

```bash
curl -fsSL https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.sh | sh
```

**Windows**（PowerShell）

```powershell
powershell -c "irm https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.ps1 | iex"
```

<img src="docs/assets/cli-install.gif" alt="OneSelf CLI 安装演示：运行 curl … | sh，设置管理员、选择本机/局域网入口，结束时显示「✓ OneSelf 安装成功」以及首页、管理端地址" width="100%" />

安装器会按提示选对外源和入口，并拉起服务。装好后：

1. 打开打印的 `PUBLIC_ORIGIN`（首页）
2. 把这条命令交给正在对话的 Agent（`<agent>` 换成对应 Agent 名）：

```bash
npx skills add https://你的站点 -a <agent> -s oneself -y
```

3. Agent 没有凭据时会申请设备码。到 `/admin` 登录后，在 `/admin/device` 批准。
4. API Key 只给脚本或长期密钥，不是第一次对话的接入方式。

**安装选项**

- 目录：默认 `$HOME/.local/share/oneself`（Windows 为 `%LOCALAPPDATA%\oneself`），不进源码树
- 换目录：`ONESELF_DIR=/path` 或 `sh -s -- --dir /path`（Compose 项目名仍是 `oneself`，共用同一组卷）
- 非交互：`ONESELF_YES=1`
- 入口：默认本机/局域网，也可选 Cloudflare / Caddy / Tailscale，见 [部署](#-部署)
- 变量：见 [配置](#-配置)

**运维**

- 命令：`bin/oneself update | doctor | backup | restore`
- `backup` / `restore` 在安装目录用 `compose.yaml` 完成，不需要检出仓库或 `scripts/transfer-cli.ts`
- `update` 核对 GitHub 最新正式版；较新则升级并钉住该镜像，已是最新时只刷新已钉镜像。`doctor` 只检查
- `update` 可改 `.oneself-release` 和 `ONESELF_IMAGE`，但更换 CLI 二进制仍需重跑 Release 安装命令。
- 口令保留。旧 Release 的安装命令不会降级；确要换旧版设 `ONESELF_REF=v1.2.3`

**实现**

- 安装与运维只有一套实现：CLI 二进制 [apps/cli](apps/cli)
- `oneself.sh` / `oneself.ps1` 是薄启动脚本（[deploy/oneself-bootstrap.sh](deploy/oneself-bootstrap.sh)、[deploy/oneself-bootstrap.ps1](deploy/oneself-bootstrap.ps1)），只下载、校验本平台二进制后转交
- Alpine/musl 用 `oneself-linux-*-musl`

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

| 变量                                                              | 说明                                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_ORIGIN`                                                   | 唯一对外源。发现文档、OAuth issuer、批准地址和媒体地址只用它；为 HTTPS 时 Cookie 加 `Secure`                            |
| `OWNER_LOGIN` / `OWNER_PASSWORD`                                  | 第一次启动且还没有所属人时创建唯一的所属人账号，只存 Argon2id 哈希，并强制下次登录改密                                  |
| `OWNER_RESET_PASSWORD`                                            | 忘记密码时临时设置，重启后替换哈希并再次强制改密，用完删掉。没有邮箱找回                                                |
| `DATABASE_URL`                                                    | PostgreSQL 连接串。Compose 中由 `POSTGRES_PASSWORD` 拼出                                                                |
| `OBJECT_STORAGE_*`                                                | S3 兼容对象存储的端点、区域、桶和密钥。Compose 中由 `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` 提供                      |
| `COMPOSE_PROFILES`                                                | 访问入口：`local`（默认，本机/局域网 `http://IP:HOST_PORT`）、`cloudflared`、`caddy` 或 `tailscale`，同一时间只启用一个 |
| `TUNNEL_TOKEN` / `APP_DOMAIN`、`ACME_EMAIL` / `TAILSCALE_AUTHKEY` | 分别给 cloudflared、Caddy、Tailscale 使用                                                                               |
| `ONESELF_IMAGE`                                                   | 应用镜像。安装用 `docker.io/ptonlix/oneself:latest`。自己从源码构建时改成 `oneself:local`                               |
| `HOST` / `PORT`                                                   | 监听地址和端口，默认 `127.0.0.1:3000`；容器内设为 `0.0.0.0`                                                             |

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

`compose.yaml` 含应用、PostgreSQL 18 和 RustFS，三者都不直接映射宿主机端口。访问入口由 `.env` 的 `COMPOSE_PROFILES` 选择，四种互斥（安装时四选一），换入口不换应用镜像：

| profile         | 谁能访问                      | 需要                                         |
| --------------- | ----------------------------- | -------------------------------------------- |
| `local`（默认） | 本机/局域网，`http://IP:端口` | `HOST_PORT`（默认 3000）。只映射这一个端口   |
| `cloudflared`   | 公网，主机名在 Cloudflare     | `TUNNEL_TOKEN`。不开放路由器端口             |
| `caddy`         | 公网，自己的域名              | `APP_DOMAIN`、`ACME_EMAIL`，80/443 可达      |
| `tailscale`     | 同一 tailnet                  | `TAILSCALE_AUTHKEY`。只做 Serve，不开 Funnel |

- `PUBLIC_ORIGIN` 须与所选入口的对外地址一致。
- 走 Cloudflare 时不要缓存 `/pcp`、`/oauth`、`/.well-known`、`/admin`、`/skills`、`/media`、`/_preview`。
- 不用安装器：`cp .env.example .env` 填好变量后 `docker compose pull && docker compose up -d`。
- Agent 接入：`npx skills add https://站点 -a <agent> -s oneself -y`。

## 📚 文档

- [产品需求（PRD）](docs/PRD.md)
- [技术架构](docs/ARCHITECTURE.md)
- [Skill：oneself](skills/oneself/SKILL.md)
- 运行中的实例：`/.well-known/pcp`、`/openapi.json`、`/skills/oneself/SKILL.md`
- 安装 Skill：`npx skills add https://站点 -a <agent> -s oneself -y`

## 🤝 贡献

欢迎 Issue 和 Pull Request。请先读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题走 [SECURITY.md](SECURITY.md)，不要把密钥、口令或导出包贴进 Issue。一起协作的约定见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

1. 从当前 `main` 拉分支。
2. 改动与 [docs/PRD.md](docs/PRD.md) 范围一致；操作名、权限或错误码有变时，先改文档和 [`packages/operations`](packages/operations/src/registry.ts)。
3. 提交前运行 `pnpm check`。
4. 发起 PR，说明行为变化和验证方式。
