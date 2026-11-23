<div align="center">

<img src="docs/images/hero.png" alt="OneSelf: One self. One context. Every AI." width="100%" />

<h1>OneSelf</h1>

<p><strong>One self. One context. Every AI.</strong></p>

<p>开源、自托管的个人上下文与认知系统<br />让 AI 不只是记住你，更能逐渐理解你</p>

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
  <a href="#-这是什么">这是什么</a> ·
  <a href="#-为什么需要-oneself">为什么</a> ·
  <a href="#-soul-与-recent">Soul 与 Recent</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-架构">架构</a> ·
  <a href="#-agent-入口">Agent 入口</a> ·
  <a href="#-文档">文档</a> ·
  <a href="README_EN.md">English</a>
</p>

</div>

<p align="center">
  <a href="https://chenfudong.win/">
    <img src="docs/assets/site-intro.gif" alt="chenfudong.win 打开时的开场动画" width="100%" />
  </a>
  <br />
  <sub>用 OneSelf 做出来的个人站点：<a href="https://chenfudong.win/">chenfudong.win</a></sub>
</p>

---

## 💡 这是什么

每换一个 AI，都要重新介绍自己？

经历、思维方式、工作习惯、兴趣和目标，散落在不同平台、不同对话和不同文件里。AI 可能记住了一些信息，却很难形成对一个人的持续理解。

**OneSelf 想解决的，不只是记忆问题，而是 AI 如何持续理解一个人。**

它把个人资料、经历、知识和文件放回你自己手里，并由 Agent 从中逐渐提炼：

- 你真正重视什么？
- 你如何思考、判断和解决问题？
- 你习惯怎样工作和生活？
- 你长期追求什么？
- 你最近关注什么，正在经历什么？
- 你正在发生怎样的变化？

这些理解收成两份核心认知：

- **Soul：理解长期的你。**
- **Recent：理解近期的你。**

原始资料是证据，个人认知是积累，AI 协作是最终价值。获得你的授权后，不同 AI 读取的是同一份上下文，不必每次从零认识你。

**你的资料，你做主。你的认知，由证据逐渐建立。你的上下文，不属于任何一个 AI 平台。**

## 🤔 为什么需要 OneSelf

现在很多 AI 都有 Memory。那为什么还要 OneSelf？

1. **记忆是割裂的。** 换一个 AI，就要重新介绍自己。平台里的记忆带不走，也合并不到一起。
2. **记住不等于理解。** 资料、事实和个人认知不是一回事。堆了很多笔记，仍然可能不了解一个人怎样思考、怎样做决定。
3. **个人数据不该属于某个平台。** 你需要拥有、控制和授权自己的上下文，而不是把理解你的权利交给每一次对话。

> AI 不应该每次都从零认识你。OneSelf 让每一个 AI，都能逐渐理解真实的你。

## 🧠 Soul 与 Recent

OneSelf 不只保存你说过的话。它通过持续积累的资料和证据，逐渐形成对一个人的理解。个人认知分成两个维度。`self` 是内置目录；`self/soul` 和 `self/recent` 由系统按模板生成，Agent 不另起总览。

### Soul：长期的你

`self/soul` 记录经过观察、反复印证后，能够帮助 AI 理解这个人的稳定特征。它不是简历，也不是人物标签。一次偶然的行为不进入正式画像。

| 维度                  | 理解什么                               |
| --------------------- | -------------------------------------- |
| Values                | 价值观与信念：真正重视什么             |
| Thinking              | 思维与认知：如何思考和判断             |
| Operating             | 做事与决策：如何行动和解决问题         |
| Habits                | 习惯与行为规律：长期反复出现的做法     |
| Motivations           | 内在动机：长期追求和驱动力             |
| Strengths & Frictions | 优势与摩擦：擅长什么，什么会反复挡住你 |

有证据支持的判断进入正式画像。值得以后再验证、但尚未确认的规律留在候选观察区，不能说成已经确认的特征。

### Recent：最近的你

`self/recent` 记录最近一段时间仍有理解价值的生活状态。它不是日记流水账，也不是上传记录。

| 维度               | 理解什么                       |
| ------------------ | ------------------------------ |
| Focus              | 最近关注、研究和思考什么       |
| Work               | 当前工作、事业和项目           |
| Mood               | 最近的情绪、压力和动力         |
| Health             | 资料里已经出现的身体与健康状态 |
| Life               | 生活状态、作息和环境变化       |
| Relationships      | 近期重要的人际关系             |
| Goals & Challenges | 当前目标、困难和面临的选择     |

每条要当作现状引用的判断都有时间依据和 `valid_until`。过期的情绪、已经结束的项目和历史健康状态，不会因为曾经被记录就一直被当作现在。

### 两者有什么区别？

|          | Soul                         | Recent                   |
| -------- | ---------------------------- | ------------------------ |
| 核心问题 | 这个人长期是怎样的？         | 这个人最近正在经历什么？ |
| 时间属性 | 长期、相对稳定               | 近期、持续变化           |
| 内容     | 价值观、思维、习惯、动机     | 工作、情绪、健康、生活   |
| 更新方式 | 新证据支持、修正或推翻旧认知 | 随近期生活变化更新       |
| 维护原则 | 不轻易下结论                 | 不把过期信息当成现状     |

**Soul 理解内在规律，Recent 理解现实处境。两者一起，才是 AI 理解你的基础。**

认知有边界：不把单次行为当作长期特征；不把 Agent 推断当成用户自述；不为了填满画像而编造；不把过期信息当成当前状态；不因为你上传了资料，就擅自做长期归档。格式与初始化见 [skills/oneself/references/self.md](skills/oneself/references/self.md)。

## ✨ 核心特性

**持续理解：从资料管理到个人认知**

- **Soul 长期画像**：从持续积累的资料里理解价值观、思维方式、做事规律、习惯和内在动机。
- **Recent 近期画像**：了解最近的关注、工作、情绪、健康、生活、人际关系和目标。
- **主动关联**：Agent 不只整理单份资料，还会对照已有证据，发现重复模式、重要变化和潜在矛盾。
- **有边界的认知**：区分用户自述、行为观察和 Agent 推断。不确定就留在候选，或只保留原始证据。
- **持续演化**：新证据可以支持、修正或推翻旧判断。理解应逐渐接近真实，而不是越记越满。

**个人上下文：资料与认知统一管理**

- **资料留在原处**：经历、项目、笔记和知识写成页面，照片、PDF 等原件上传并挂接。
- **证据可追溯**：Soul 和 Recent 里的判断链回原始资料，避免脱离证据的主观描述。
- **时间与历史**：Facts、Timeline、标签、页面链接和有效期可检索。增量编辑带版本校验；每页保留最近 50 个版本，删除后 30 天内可恢复。
- **不重复保存**：原始资料留在各自目录。个人认知只提炼有价值的判断，不把原文再抄一遍。

**Agent-first：主动维护，而不是被动记录**

- **先完成你这次要做的事**：翻译、总结、修改等一次性任务，不会自动变成长期记忆。
- **按价值决定是否更新画像**：意图不清时，不擅自归档敏感资料。
- **从空白长出来**：新用户不必先填一份简历。已有资料的人，可以逐步从历史证据里建立画像。
- **同一个入口**：PCP、HTTP / OpenAPI 和 MCP 使用同一张操作表。不同 Agent 用的是你批准过的同一份上下文。

**自主与隐私：数据始终由你掌握**

- **开源、自托管**：Node.js、PostgreSQL 和 RustFS，用 Docker Compose 部署。Agent 只走接口。
- **默认私有**：按目录分读、写、改可见性。没有权限时，私有页和不存在的页看起来一样。
- **授权可控**：API Key 和 OAuth 设备码都要你批准，也可以单独收回。Agent 不能给自己发密钥，也不能替你批准。
- **公开由你决定**：Agent 可以协助做个人公开主页，上线需要你批准。

## 🗂️ 上下文怎么组织

个人上下文分三层。原始资料是证据，Soul 和 Recent 是认知结果，AI 协作是最终价值。

### 1. 原始资料：保留真实证据

经历、项目、笔记、知识、健康资料、照片和 PDF，留在各自的目录里。目录名由你决定，例如：

```text
work/
knowledge/
health/
life/
```

页面保存结构化文字。原件用 `file_upload` 上传，挂到对应页面；挂接页公开时，原件才可匿名访问。这些目录不是固定档案分类，也不代替画像。

### 2. 个人认知：提炼有价值的理解

在资料之上有两份核心页面。它们不复制原文，只记录经过判断、有证据支持的认知，并用页面链接追溯来源。

```text
self/soul      # 长期个人认知，含候选观察
self/recent    # 近期生活画像，判断带有效期
```

`self` 是内置目录。服务启动时会补上缺失的这两页，已有正文不覆盖。Agent 不要再创建，也不要另写一份总览来代替。

### 3. AI 协作：共享同一份个人上下文

获得授权的 Agent 通过 PCP 读取 Soul、Recent 和相关原始资料，在理解你的基础上协作。读取、修改和公开都受你的权限约束。

页面格式、Facts / Timeline 和操作规则见 [context.md](skills/oneself/references/context.md)。画像怎么写见 [self.md](skills/oneself/references/self.md)。

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
- `update` 有新版本就升级并重启，没有就重新拉取当前镜像。`doctor` 只检查
- `update` 可改 `.oneself-release` 和 `ONESELF_IMAGE`，但更换 CLI 二进制仍需重跑 Release 安装命令。
- 口令保留。旧 Release 的安装命令不会降级；确要换旧版设 `ONESELF_REF=v1.2.3`

安装与运维的实现在 [apps/cli](apps/cli)。`oneself.sh` / `oneself.ps1` 只下载并校验本平台二进制后转交，脚本见 [deploy/oneself-bootstrap.sh](deploy/oneself-bootstrap.sh) 与 [deploy/oneself-bootstrap.ps1](deploy/oneself-bootstrap.ps1)。

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

| 路径                                        | 谁用           | 用途                                                                                   |
| ------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `/.well-known/pcp`                          | Agent          | 发现文档：协议版本、操作清单、认证头、公开接口、上传限制、OpenAPI、MCP、OAuth 和 Skill |
| `/.well-known/agent-skills/index.json`      | 安装器         | 产品 Skill `oneself` 的 archive 索引                                                   |
| `/skills/oneself/SKILL.md`                  | Agent          | 唯一产品 Skill：使命、连接方式，以及何时读哪份 reference                               |
| `/skills/oneself/references/philosophy.md`  | Agent          | 设计哲学：用更少、更准确的判断理解一个人                                               |
| `/skills/oneself/references/cognition.md`   | Agent          | 主动观察、关联和认知判断的边界                                                         |
| `/skills/oneself/references/self.md`        | Agent          | `self/soul` 与 `self/recent` 的格式和初始化                                            |
| `/skills/oneself/references/context.md`     | Agent          | 页面、原件和文件操作                                                                   |
| `/skills/oneself/references/public-page.md` | Agent          | 个人公开主页：定制、预览和申请上线                                                     |
| `/openapi.json`                             | Agent、脚本    | 由操作注册表和 MCP 同一份输入 schema 生成的 OpenAPI                                    |
| `POST /mcp`                                 | MCP 客户端     | Streamable HTTP，认证头与 PCP 相同                                                     |
| `/pcp/v1/*`                                 | 已认证的调用方 | 页、原件、检索、结构、目录、身份和站点操作                                             |
| `/pcp/v1/public/*`                          | 任何人         | 只返回 `visibility: public` 且未删除的页                                               |
| `/media/{id}`                               | 视所属页而定   | 原件字节。所属页公开时匿名可读                                                         |
| `/oauth/device/auth`、`/oauth/token`        | Agent          | 申请设备码、换取和刷新访问令牌                                                         |
| `/admin`                                    | 所属人         | 登录、改密、批准设备码、API Key 和站点上线                                             |
| `/_preview/{releaseId}/`                    | 任何人         | 未上线 release 的预览                                                                  |

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
pnpm data:export --out oneself-export --stopped
pnpm data:import --from oneself-export.tar.gz --stopped
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
- [哲学](skills/oneself/references/philosophy.md) · [认知](skills/oneself/references/cognition.md) · [Soul / Recent](skills/oneself/references/self.md) · [上下文操作](skills/oneself/references/context.md) · [公开页](skills/oneself/references/public-page.md)
- 运行中的实例：`/.well-known/pcp`、`/openapi.json`、`/skills/oneself/SKILL.md`

## 🤝 贡献

欢迎 Issue 和 Pull Request。请先读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题走 [SECURITY.md](SECURITY.md)，不要把密钥、口令或导出包贴进 Issue。一起协作的约定见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

1. 从当前 `main` 拉分支。
2. 改动与 [docs/PRD.md](docs/PRD.md) 范围一致；操作名、权限或错误码有变时，先改文档和 [`packages/operations`](packages/operations/src/registry.ts)。
3. 提交前运行 `pnpm check`。
4. 发起 PR，说明行为变化和验证方式。

## ⭐ Star History

<a href="https://www.star-history.com/#ptonlix/OneSelf&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ptonlix/OneSelf&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ptonlix/OneSelf&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ptonlix/OneSelf&type=date&legend=top-left" />
  </picture>
</a>
