<div align="center">

<img src="docs/images/hero.png" alt="OneSelf: One self. One context. Every AI." width="100%" />

<h1>OneSelf</h1>

<p><strong>One self. One context. Every AI.</strong></p>

<p>开源、自托管的个人上下文仓：资料以 Markdown 为原文，通过同一套 PCP 操作分发给你的脚本、别人的 Agent 和你的公开主页。</p>

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

个人资料散在简历、笔记、证件原件和各个 Agent 的对话里。每接一个 Agent 就要重新粘贴一遍背景，也分不清哪些能公开、哪些只能给这个 Agent。

OneSelf 是**一个人一份的自托管资料仓**，把三件事拆开：

- **资料怎么存**：每一页是一个 Markdown 文件，原文按内容哈希存在对象存储；PostgreSQL 只保存事先定义好的索引，不为任何一种资料单独建表。
- **Agent 怎么调用**：所有资料和站点操作都在 PCP（Personal Context Protocol）里，HTTP（OpenAPI）和 MCP 是同一张操作表。自己的 Agent 用 API Key，别人的 Agent 走 OAuth 2.1 设备码，权限按目录（source）分读、写、改可见性三档。
- **页面怎么发布**：公开站点是一份静态落地页，浏览器在运行时匿名读取公开 PCP。开箱即用的原始页面已经能展示公开资料；定制版由 Agent 上传，经你批准后才上线。

> 一句话：你的资料只存一份，谁能读、读到什么、主页何时换版，都由你批准。

## ✨ 特性

**OneSelf 为 Agent 而生：读写资料、整理原件、定制主页都由 Agent 通过 PCP 完成；人只负责批准：给哪个 Agent 什么权限，哪一版主页可以上线。**

- **Agent 自己就能接入**：Agent 读 `/.well-known/pcp` 就能拿到操作清单、OpenAPI、MCP、OAuth 端点和两份 Skill（[资料写法](skills/data.md)、[原始页面](skills/original-page.md)），不需要人把背景再粘贴一遍。
- **HTTP 与 MCP 共用一张操作表**：40 个资料和站点操作登记在 [`packages/operations`](packages/operations/src/registry.ts)，同时生成 `/pcp/v1` 路由、`/openapi.json` 和 `POST /mcp`（官方 MCP SDK，同进程 Streamable HTTP）。API Key 管理只走 HTTP，不暴露给 MCP。
- **授权由人批准，密钥不外泄**：别人的 Agent 走 OAuth 2.1 设备码（`oidc-provider`），你在 `/admin/device` 勾选目录和权限；访问令牌 15 分钟，刷新令牌一次性轮换并只存哈希。API Key 以 `osk_` 开头，只在批准页出现一次。Agent 自己不能创建密钥，也不能批准上线。
- **Markdown 是原文，新资料不改库**：简历、经历、笔记、证件摘要都是带 frontmatter 的页面，`type` 可以随便新增，不需要 migration。`## Facts`、`## Timeline`、标签和 `[[source/slug]]` 链接都会回写原文并抽成索引，支持 `search`、`query`、`recall`。
- **默认私有**：`visibility` 缺省为 `private`。读不到时，私有页、已删除页和不存在的页返回同一个 `not_found`，不泄露存在与否。把私有页改成公开需要单独的「改可见性」权限。
- **原件也归你管**：图片和 PDF（单个最大 20 MiB）存进对象存储，由页面 frontmatter 的 `files` 挂接；只有所属页公开时 `/media/{id}` 才匿名可读。
- **主页由 Agent 改版，由你上线**：Agent 下载原始页面源码 zip，改完上传为不可变 release，拿到 `/_preview/{id}/` 预览，再申请上线；指针只有在你打开批准地址并同意后才移动。回到旧版也走同一流程。
- **可追溯、可恢复**：每页保留最近 50 个版本，可回退；页和目录软删除后 30 天内可恢复。
- **单进程，自托管**：API、MCP、OAuth、管理端和公开站点都在一个 Node.js 进程里；Docker Compose 带上 PostgreSQL 18 和 RustFS，公网入口在 cloudflared、Caddy、Tailscale 三选一。

## 🚀 快速开始

### 🐳 方式一：Docker Compose 自托管

前提：机器已安装 Docker 与 Docker Compose v2。默认入口是 Cloudflare Tunnel，需要一个 Tunnel 令牌；也可以改用 Caddy（自有域名）或 Tailscale（只在 tailnet 内可访问），见 [部署](#-部署)。

```bash
cp .env.example .env
```

编辑 `.env`，至少填写：

- `PUBLIC_ORIGIN`：唯一对外地址，例如 `https://自己的域名`
- `OWNER_PASSWORD`：主人初始口令（首次登录后强制修改）
- `POSTGRES_PASSWORD`、`RUSTFS_ACCESS_KEY`、`RUSTFS_SECRET_KEY`
- 所选入口需要的变量（默认 `TUNNEL_TOKEN`）

在本机构建镜像并启动：

```bash
docker compose up -d --build
```

> [!IMPORTANT]
> 应用启动时**不会**自动执行数据库迁移。迁移文件在 [`packages/db/migrations`](packages/db/migrations)，仓库提供 `pnpm db:migrate`（drizzle-kit，读取 `.env` 里的 `DATABASE_URL`）。生产 Compose 的 PostgreSQL 不映射宿主机端口，首次启动前请自行安排一次迁移。

启动后打开 `PUBLIC_ORIGIN` 看公开主页，打开 `PUBLIC_ORIGIN/admin` 登录并改密，然后把 `PUBLIC_ORIGIN/.well-known/pcp` 交给你的 Agent。

### 💻 方式二：本地开发

环境要求：

- Node.js `>=24`
- pnpm 12.9.1（通过 Corepack 启用）
- Docker 与 Docker Compose v2

```bash
corepack enable
corepack prepare pnpm@12.9.1 --activate
pnpm install --frozen-lockfile
docker compose -f compose.dev.yaml up -d
```

`compose.dev.yaml` 只启动 PostgreSQL 和 RustFS，并且只绑定 `127.0.0.1`。在仓库根目录新建本地 `.env`（这些口令只给本机用，不要拿去当生产配置；本地不要设置 `PUBLIC_ORIGIN`，应用会使用 `http://127.0.0.1:3000`）：

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

执行迁移、构建两个前端包，再启动应用：

```bash
pnpm db:migrate
pnpm --filter @oneself/admin build
pnpm --filter @oneself/original-pages build
node --env-file=.env --experimental-strip-types apps/server/src/index.ts
```

打开 <http://127.0.0.1:3000> 看原始页面，打开 <http://127.0.0.1:3000/admin> 登录。

> [!TIP]
> 应用直接启动时会检查 `DATABASE_URL`、`OBJECT_STORAGE_*` 以及 `apps/admin/dist`、`packages/original-pages/dist` 是否存在，缺一项就拒绝启动。没有主人账号且没有 `OWNER_PASSWORD` 时也会拒绝启动。

## 🔧 配置

完整变量和注释见 [`.env.example`](.env.example)。`.env` 已被 Git 忽略，不要提交真实口令。

| 变量                                                              | 说明                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `PUBLIC_ORIGIN`                                                   | 唯一对外源。发现文档、OAuth issuer、批准地址和媒体地址只用它；为 HTTPS 时 Cookie 加 `Secure`       |
| `OWNER_LOGIN` / `OWNER_PASSWORD`                                  | 第一次启动且没有主人时创建唯一主人，只存 Argon2id 哈希，并强制下次登录改密                         |
| `OWNER_RESET_PASSWORD`                                            | 忘记密码时临时设置，重启后替换哈希并再次强制改密，用完删掉。没有邮箱找回                           |
| `DATABASE_URL`                                                    | PostgreSQL 连接串。Compose 中由 `POSTGRES_PASSWORD` 拼出                                           |
| `OBJECT_STORAGE_*`                                                | S3 兼容对象存储的端点、区域、桶和密钥。Compose 中由 `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` 提供 |
| `COMPOSE_PROFILES`                                                | 公网入口：`cloudflared`（默认）、`caddy` 或 `tailscale`，同一时间只启用一个                        |
| `TUNNEL_TOKEN` / `APP_DOMAIN`、`ACME_EMAIL` / `TAILSCALE_AUTHKEY` | 分别给 cloudflared、Caddy、Tailscale 使用                                                          |
| `ONESELF_IMAGE`                                                   | 应用镜像标签，默认 `oneself:local`                                                                 |
| `HOST` / `PORT`                                                   | 监听地址和端口，默认 `127.0.0.1:3000`；容器内设为 `0.0.0.0`                                        |

## 🧱 架构

<p align="center">
  <img src="docs/images/architecture.png" alt="OneSelf 系统架构：浏览器打开按指针提供的站点并匿名读取公开 PCP；自己的 Agent 用 API Key、别人的 Agent 用 OAuth 设备码换来的令牌调用同一份 PCP 操作表；单个 Node.js 进程使用 RustFS 保存原文、原件和站点包，使用 PostgreSQL 保存索引、授权和站点指针" width="100%" />
</p>

- **一个进程**：PCP、MCP、OAuth、管理端静态文件和已发布站点都由同一个 Hono 应用提供，不拆微服务，也没有 Redis 或队列。
- **规则不在路由里**：HTTP 和 MCP 只做认证、解析和返回，同一组用例在 `apps/server/src/app`，业务规则在纯 TypeScript 的 `packages/domain`；对象存储、时钟和 Markdown 解析经 `ports` / `adapters` 接入，依赖方向由 dependency-cruiser 检查。
- **原文与投影分离**：Markdown、原件和站点文件以对象存储为准；PostgreSQL 里的正文、标签、链接、事实和时间线都是投影。写一页时先写哈希对象，再在一个事务里更新投影并追加版本。
- **站点不查资料表**：提供站点文件的处理函数只看站点指针，不查询 `pages`；页面上的资料由浏览器另行请求公开 PCP。

| 角色                | 能做什么                                                                 | 不能做什么                       |
| ------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| 主人                | 登录管理端，批准设备码、生成和作废 API Key、同意站点上线、删除或恢复目录 | 没有邮箱找回密码                 |
| 自己的 Agent / 脚本 | 用批准过的 API Key 读写被允许的目录；有 `site:write` 时可申请站点上线    | 不能创建或管理密钥，不能同意上线 |
| 别人的 Agent        | 走设备码拿到短期令牌，按批准的目录和权限调用同一组操作                   | 不能管理密钥，不能同意上线       |
| 访客                | 打开当前上线的公开站点，读取公开资料和公开原件                           | 读不到任何 `private` 页          |

Mermaid 版系统总览图、代码边界、数据表和关键流程见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#系统总览图)。

## 🤖 Agent 入口

| 路径                                 | 谁用           | 用途                                                       |
| ------------------------------------ | -------------- | ---------------------------------------------------------- |
| `/.well-known/pcp`                   | Agent          | 发现文档：协议版本、操作清单、OpenAPI、MCP、OAuth 和 Skill |
| `/skills/data.md`                    | Agent          | 资料写法：frontmatter、可见性、两种 fence、原件和链接      |
| `/skills/original-page.md`           | 站点 Agent     | 原始页面能展示什么、如何定制、上传、预览和申请上线         |
| `/openapi.json`                      | Agent、脚本    | 由操作注册表生成的 OpenAPI                                 |
| `POST /mcp`                          | MCP 客户端     | Streamable HTTP，认证头与 PCP 相同                         |
| `/pcp/v1/*`                          | 已认证的调用方 | 页、原件、检索、结构、目录、身份和站点操作                 |
| `/pcp/v1/public/*`                   | 任何人         | 只返回 `visibility: public` 且未删除的页                   |
| `/media/{id}`                        | 视所属页而定   | 原件字节。所属页公开时匿名可读                             |
| `/oauth/device/auth`、`/oauth/token` | 别人的 Agent   | 申请设备码、换取和刷新访问令牌                             |
| `/admin`                             | 主人           | 登录、改密、批准设备码、API Key 和站点上线                 |
| `/_preview/{releaseId}/`             | 任何人         | 未上线 release 的预览，不移动线上指针                      |

认证方式：API Key 用 `Authorization: ApiKey <key>` 或 `X-Api-Key`；OAuth 访问令牌用 `Authorization: Bearer <token>`。错误体统一为 `{ "error", "message" }`。路径以 [`packages/operations/src/registry.ts`](packages/operations/src/registry.ts) 为准。

<details>
<summary><strong>PCP 操作清单</strong></summary>

| 分组       | 操作                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页与原文   | `put_page`、`edit_page`、`put_pages`、`get_page`、`list_pages`、`delete_page`、`restore_page`、`get_versions`、`revert_version`、`resolve_slugs`         |
| 原件       | `file_upload`、`file_list`、`file_url`                                                                                                                   |
| 检索       | `search`、`query`、`recall`                                                                                                                              |
| 结构回写   | `add_tag`、`remove_tag`、`get_tags`、`add_link`、`remove_link`、`get_links`、`get_backlinks`、`add_timeline_entry`、`get_timeline`、`remember`、`forget` |
| 目录与身份 | `sources_list`、`sources_add`、`sources_delete`、`sources_restore`、`sources_status`、`whoami`、`list_skills`、`get_skill`                               |
| 站点       | `list_sites`、`get_site`、`put_site`、`preview_site`、`activate_site`                                                                                    |
| 仅 HTTP    | `create_api_key`、`list_api_keys`、`revoke_api_key`                                                                                                      |

</details>

## 📝 资料写法

一页由 `(source, slug)` 标识，`type` 和 `title` 写在 frontmatter 里，其他字段随意。需要有效期或置信度的陈述写进 `## Facts`，经历写进 `## Timeline`：

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

只认这两种 fence，解析失败时整次写入回滚。完整规则见 [skills/data.md](skills/data.md)。

## 📁 项目结构

```text
OneSelf/
├── apps/
│   ├── server/            # 唯一的 Node 进程：pcp/、mcp/、oauth/、owner/、site-files/，用例在 app/
│   └── admin/             # 管理端（Vite + React），只调用 HTTP
├── packages/
│   ├── domain/            # 纯业务规则：页、原件、检索、授权、站点指针
│   ├── operations/        # 操作注册表：操作名、路径、http-only。零依赖
│   ├── ports/             # 对象存储、时钟、Markdown 解析的接口
│   ├── adapters/          # S3、PostgreSQL 实现与测试用内存实现
│   ├── db/                # Drizzle 表结构与 SQL 迁移
│   ├── public-client/     # 匿名公开 PCP 客户端，定制站点也用它
│   └── original-pages/    # 随应用发布的原始落地页源码
├── skills/                # 产品 Skill：data.md、original-page.md
├── tests/                 # 接口冒烟（smoke）与 Skill 验收测试
├── deploy/Caddyfile       # Caddy 入口，只做反向代理
├── docs/                  # 产品需求与技术架构
├── openspec/              # 行为规格与变更记录
├── compose.yaml           # 生产：应用 + PostgreSQL + RustFS + 一个入口 profile
├── compose.dev.yaml       # 本地依赖：PostgreSQL + RustFS
└── Dockerfile             # 应用镜像：管理端、原始页面、源码 zip 和 skills/
```

## 🧪 开发

```bash
pnpm check            # Prettier、ESLint、tsc、Vitest、dependency-cruiser、Knip 依次执行
pnpm test             # 单元测试和进程内接口测试（不需要启动 Compose）
pnpm test:smoke       # 闭环冒烟：用 compose.dev.yaml 起真实 PostgreSQL 和 RustFS
pnpm boundaries       # 只检查包之间的依赖方向
pnpm db:migrate       # 对 .env 里的 DATABASE_URL 执行迁移
```

`pnpm check` 是合并前的本地门禁。依赖只用 pnpm 安装。行为以 [docs/PRD.md](docs/PRD.md) 为准，路径、事务和部署以 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 为准。

## 🚢 部署

<details>
<summary><strong>Docker Compose 部署与公网入口详解</strong></summary>

`compose.yaml` 包含应用、PostgreSQL 18 和单盘 RustFS（`rustfs/rustfs:1.0.1`），首次启动时用 aws-cli 创建对象桶。应用、数据库和对象存储都不映射宿主机端口，数据放在命名卷里。应用镜像由仓库根目录的 `Dockerfile` 构建，打进管理端、原始页面、原始页面源码 zip 和 `skills/`，监听 `3000`。生产请把 `ONESELF_IMAGE` 设为写死的版本标签，不要用 `latest`。

公网入口是互斥的 Compose profile，由 `.env` 的 `COMPOSE_PROFILES` 选择，换入口不需要改应用镜像：

| profile               | 谁能访问                  | 需要                                               |
| --------------------- | ------------------------- | -------------------------------------------------- |
| `cloudflared`（默认） | 公网，主机名在 Cloudflare | `TUNNEL_TOKEN`。不开放路由器端口                   |
| `caddy`               | 公网，自己的域名          | `APP_DOMAIN`、`ACME_EMAIL`，80 和 443 能从公网到达 |
| `tailscale`           | 只有同一 tailnet 里的设备 | `TAILSCALE_AUTHKEY`。只做 Serve，不开 Funnel       |

三个入口都只把 HTTPS 转给应用，不保存站点文件。`PUBLIC_ORIGIN` 必须与所选入口的对外地址一致。没有隧道令牌或 auth key 时入口容器可以失败，应用和数据库仍会保留运行。

使用 Cloudflare 时，不要缓存 `/pcp`、`/oauth`、`/admin`、`/skills`、`/media`、`/_preview`。应用内置简单限流：每个 IP 每分钟登录和设备码 10 次，公开搜索和上传 30 次，客户端地址只取入口送来的头。

</details>

## 📚 文档

- [产品需求（PRD）](docs/PRD.md)：目标、非目标、数据组织、PCP 和验收标准
- [技术架构](docs/ARCHITECTURE.md)：技术选型、代码边界、数据、路径和关键流程
- [Skill：资料写法](skills/data.md)
- [Skill：原始页面](skills/original-page.md)
- [OpenSpec 变更：oneself-mvp](openspec/changes/oneself-mvp/proposal.md)
- 运行中的实例：`/.well-known/pcp`、`/openapi.json`、`/skills/data.md`、`/skills/original-page.md`

## 🤝 贡献

欢迎 Issue 和 Pull Request。

1. 从当前 `main` 拉分支。
2. 保持改动和 [docs/PRD.md](docs/PRD.md) 的范围一致；操作名、权限或错误码有变化时，先改文档和 [`packages/operations`](packages/operations/src/registry.ts)，再改代码。
3. 提交前运行 `pnpm check`。
4. 发起 Pull Request，说明行为变化和验证方式。
