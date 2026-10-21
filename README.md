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

OneSelf 是开源、自托管的**个人上下文管理**系统。你的简历、经历、笔记、照片和证件扫描件，汇成一份关于你的上下文：文字整理成页面，图片和 PDF 作为原件挂在页面上。任何 AI Agent 都通过同一套 PCP 操作（HTTP 与 MCP 通用）读取、写回和维护它；哪个 Agent 能看哪些目录、能不能修改、能不能公开，都由你批准，也能随时收回。你的公开主页同样只是这份上下文的一个出口：只展示你标为公开的内容，换版也要你点头。

- **效率**：一份上下文，所有 AI 共用。Agent 读发现文档和 Skill 就能自助接入，还能帮你整理资料、写回新内容，不用每次重新介绍自己。
- **隐私**：默认私有，按目录授权，每次授权都要你批准，随时可以作废；整套服务跑在你自己的机器上。

> 一句话：One self. One context. Every AI. 你决定哪些上下文、给哪个 AI、给多少、何时收回。

## ✨ 特性

**OneSelf 是 Agent-first 的个人上下文管理：Agent 负责读取、整理和维护，你负责划定边界：给谁、给多少、何时收回。**

**🗂️ 管理**

- **一份上下文，汇集所有资料**：经历、笔记、证件摘要写成页面，照片和 PDF 作为原件上传并挂到页面上；新增一种资料不用改数据库，事实、时间线、标签和页面之间的链接都会建立索引，可以按关键词、条件或事实检索。
- **改动可追溯、可回退**：增量编辑必须带上当前版本，不会悄悄覆盖别人刚做的修改；每页保留最近 50 个版本，页面和目录删除后 30 天内都能恢复。

**🔐 隐私**

- **默认私有，公开由你决定**：权限按目录分读、写、改可见性三档；没有权限时，私有页和不存在的页看起来一模一样。公开主页只展示你标为公开的内容，Agent 可以帮你改版，但新版本要你批准才上线。
- **每次授权你批准，随时可以收回**：Agent 无论用 API Key 还是 OAuth 设备码接入，都要在你的批准页确认，密钥只显示一次；任何一把 Key、任何一条授权都能单独作废，下一次请求即失效。Agent 不能给自己发密钥，也不能替你批准。
- **上下文留在你自己的机器上**：一个 Node.js 进程加 PostgreSQL 和 RustFS，用 Docker Compose 部署；Agent 只走接口，碰不到数据库、对象存储和密钥。

**⚡ 效率**

- **Agent-first，每个 AI 都能自助接入**：Agent 读 `/.well-known/pcp` 和两份 Skill 就知道怎么用；同一张操作表同时提供 HTTP（OpenAPI）和 MCP，任何支持其中一种的 AI 都能接入，结果一致。
- **AI 帮你维护，不用反复解释**：Agent 可以读取你上传的原件并整理成页面、记住或忘掉一条事实、补一条时间线、加标签和链接；下一次任何 AI 读到的，都是最新的你。

## 🚀 快速开始

### 🐳 方式一：Docker Compose 自托管

前提：机器已安装 Docker 与 Docker Compose v2。默认入口是 Cloudflare Tunnel，需要一个 Tunnel 令牌；也可以改用 Caddy（自有域名）或 Tailscale（只在 tailnet 内可访问），见 [部署](#-部署)。

```bash
cp .env.example .env
```

编辑 `.env`，至少填写：

- `PUBLIC_ORIGIN`：唯一对外地址，例如 `https://自己的域名`
- `OWNER_PASSWORD`：所属人账号的初始口令（首次登录后强制修改）
- `POSTGRES_PASSWORD`、`RUSTFS_ACCESS_KEY`、`RUSTFS_SECRET_KEY`
- 所选入口需要的变量（默认 `TUNNEL_TOKEN`）

在本机构建镜像并启动：

```bash
docker compose up -d --build
```

> [!IMPORTANT]
> 应用启动时**不会**自动执行数据库迁移。迁移文件在 [`packages/db/migrations`](packages/db/migrations)，仓库提供 `pnpm db:migrate`（drizzle-kit，读取 `.env` 里的 `DATABASE_URL`）。生产 Compose 的 PostgreSQL 不映射宿主机端口，首次启动前请自行安排一次迁移。

启动后打开 `PUBLIC_ORIGIN` 看公开主页，打开 `PUBLIC_ORIGIN/admin` 登录并改密，然后把 `PUBLIC_ORIGIN/.well-known/pcp` 交给要接入的 AI Agent。

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
> 应用直接启动时会检查 `DATABASE_URL`、`OBJECT_STORAGE_*` 以及 `apps/admin/dist`、`packages/original-pages/dist` 是否存在，缺一项就拒绝启动。还没有所属人账号且没有设置 `OWNER_PASSWORD` 时也会拒绝启动。

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
| `ONESELF_IMAGE`                                                   | 应用镜像标签，默认 `oneself:local`                                                                 |
| `HOST` / `PORT`                                                   | 监听地址和端口，默认 `127.0.0.1:3000`；容器内设为 `0.0.0.0`                                        |

## 🧱 架构

<p align="center">
  <img src="docs/images/architecture.png" alt="OneSelf 系统架构：浏览器打开按指针提供的站点并匿名读取公开 PCP；任意 AI Agent 用所属人批准的 API Key 或 OAuth 设备码令牌调用同一份 PCP 操作表；单个 Node.js 进程使用 RustFS 保存页面、原件和站点包，使用 PostgreSQL 保存索引、授权和站点指针" width="100%" />
</p>

- **一个进程**：PCP、MCP、OAuth、管理端静态文件和已发布站点都由同一个 Hono 应用提供，不拆微服务，也没有 Redis 或队列。
- **规则不在路由里**：HTTP 和 MCP 只做认证、解析和返回，同一组用例在 `apps/server/src/app`，业务规则在纯 TypeScript 的 `packages/domain`；对象存储、时钟和页面解析经 `ports` / `adapters` 接入，依赖方向由 dependency-cruiser 检查。
- **原文与投影分离**：页面原文、原件和站点文件以对象存储为准；PostgreSQL 里的正文、标签、链接、事实和时间线都是投影。写一页时先写哈希对象，再在一个事务里更新投影并追加版本。
- **站点不查资料表**：提供站点文件的处理函数只看站点指针，不查询 `pages`；页面上的资料由浏览器另行请求公开 PCP。

| 角色     | 能做什么                                                                                              | 不能做什么                             |
| -------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 所属人   | 登录管理端，批准 API Key 和设备码授权，作废密钥和授权，同意主页上线，删除或恢复目录                   | 没有邮箱找回密码                       |
| AI Agent | 用批准过的 API Key 或设备码令牌，在授权的目录和权限内调用同一组操作；有 `site:write` 时可申请主页上线 | 不能创建或管理密钥，不能批准授权或上线 |
| 访客     | 打开当前上线的公开站点，读取公开内容和公开原件                                                        | 读不到任何 `private` 页                |

Mermaid 版系统总览图、代码边界、数据表和关键流程见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#系统总览图)。

## 🤖 Agent 入口

| 路径                                 | 谁用           | 用途                                                       |
| ------------------------------------ | -------------- | ---------------------------------------------------------- |
| `/.well-known/pcp`                   | Agent          | 发现文档：协议版本、操作清单、OpenAPI、MCP、OAuth 和 Skill |
| `/skills/data.md`                    | Agent          | 上下文怎么写：页面字段、可见性、事实与时间线、原件和链接   |
| `/skills/original-page.md`           | 站点 Agent     | 原始页面能展示什么、如何定制、上传、预览和申请上线         |
| `/openapi.json`                      | Agent、脚本    | 由操作注册表生成的 OpenAPI                                 |
| `POST /mcp`                          | MCP 客户端     | Streamable HTTP，认证头与 PCP 相同                         |
| `/pcp/v1/*`                          | 已认证的调用方 | 页、原件、检索、结构、目录、身份和站点操作                 |
| `/pcp/v1/public/*`                   | 任何人         | 只返回 `visibility: public` 且未删除的页                   |
| `/media/{id}`                        | 视所属页而定   | 原件字节。所属页公开时匿名可读                             |
| `/oauth/device/auth`、`/oauth/token` | Agent          | 申请设备码、换取和刷新访问令牌                             |
| `/admin`                             | 所属人         | 登录、改密、批准设备码、API Key 和站点上线                 |
| `/_preview/{releaseId}/`             | 任何人         | 未上线 release 的预览，不移动线上指针                      |

接入方式二选一：API Key（`Authorization: ApiKey <key>` 或 `X-Api-Key`），或 OAuth 2.1 设备码换来的访问令牌（`Authorization: Bearer <token>`）。两种方式都要所属人批准，权限相同时结果一致。错误体统一为 `{ "error", "message" }`。路径以 [`packages/operations/src/registry.ts`](packages/operations/src/registry.ts) 为准。

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

- **页面**：由 `(source, slug)` 标识，`type`、`title`、`visibility` 等字段写在开头的 frontmatter 里，其他字段随意。需要有效期或置信度的陈述放进 `## Facts`，经历放进 `## Timeline`。
- **原件**：照片、扫描件和文档（JPEG、PNG、WebP、GIF、PDF，单个最大 20 MiB）用 `file_upload` 上传，再在页面的 `files` 里引用；挂接的页面公开时，原件才能匿名访问。

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

页面里只认这两种结构块，解析失败时整次写入回滚。完整规则见 [skills/data.md](skills/data.md)。

## 📁 项目结构

```text
OneSelf/
├── apps/
│   ├── server/            # 唯一的 Node 进程：pcp/、mcp/、oauth/、owner/、site-files/，用例在 app/
│   └── admin/             # 管理端（Vite + React），只调用 HTTP
├── packages/
│   ├── domain/            # 纯业务规则：页、原件、检索、授权、站点指针
│   ├── operations/        # 操作注册表：操作名、路径、http-only。零依赖
│   ├── ports/             # 对象存储、时钟、页面解析的接口
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
- [Skill：上下文怎么写](skills/data.md)
- [Skill：原始页面](skills/original-page.md)
- [OpenSpec 变更：oneself-mvp](openspec/changes/oneself-mvp/proposal.md)
- 运行中的实例：`/.well-known/pcp`、`/openapi.json`、`/skills/data.md`、`/skills/original-page.md`

## 🤝 贡献

欢迎 Issue 和 Pull Request。

1. 从当前 `main` 拉分支。
2. 保持改动和 [docs/PRD.md](docs/PRD.md) 的范围一致；操作名、权限或错误码有变化时，先改文档和 [`packages/operations`](packages/operations/src/registry.ts)，再改代码。
3. 提交前运行 `pnpm check`。
4. 发起 Pull Request，说明行为变化和验证方式。
