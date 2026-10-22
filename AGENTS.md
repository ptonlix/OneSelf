# OneSelf 开发规范

这份文件给人和 AI Coding 助手共用。改代码前先读它，再读对应实现，不要凭通用框架习惯重写本仓库。

事实来源按这个顺序：

1. `docs/PRD.md` 决定做什么、不做什么。
2. `docs/ARCHITECTURE.md` 决定怎么分层、用什么依赖、路径怎么走。
3. `openspec/specs/` 是已经生效的行为规格。`openspec/changes/` 里未归档的变更只在被明确要求实现时才改代码。
4. `packages/operations` 是操作名、路径和错误码的唯一注册表。

文档和代码冲突时，先停下来指出冲突。不要为了让测试通过去改规格，也不要为了迁就旧文档去发明第二种协议。未归档变更不能改写 `docs/PRD.md`。

## 技术约束

- Node.js 24、TypeScript `strict`、pnpm。只用 `pnpm install` 和 `pnpm run <script>`。不要生成 `package-lock.json` 或 `yarn.lock`。
- 一个进程提供 API、MCP、OAuth、管理端静态文件和已发布站点。不拆微服务，不引入 Redis、队列或第二套数据库。
- 公网入口是 Compose 的互斥 profile，默认 `cloudflared`。可换 `caddy` 或只在 tailnet 内的 `tailscale`。不要同时开两个，也不要把入口程序装进应用镜像。
- 服务端用 Hono，只做认证、解析和返回。不用 Next.js、Express、Nest，也不用 `hono/jsx`。
- 管理端和原始页面是 Vite + React 的静态包。公开站点不是服务端模板。
- 数据库是 PostgreSQL 18 + Drizzle。表结构只来自 migration。不把 `drizzle-kit push` 当部署方式，也不同时支持 PGLite。
- 对象存储只有 RustFS。没有本地目录模式。
- MCP 使用官方 TypeScript SDK，同进程 Streamable HTTP，路径 `POST /mcp`。工具从操作注册表生成，不另起 MCP 进程。
- 不新增依赖，除非任务明确要求。

## 代码放哪里

```text
apps/server/src/app/     用例。解析后的输入进入 domain，再经 ports 和 adapters。
apps/server/src/pcp/     /pcp/v1、公开 PCP、OpenAPI、发现文档。
apps/server/src/mcp/     POST /mcp。不另写一套操作。
apps/server/src/oauth/   设备码。不写 SQL。
apps/server/src/owner/   /admin 的登录、改密和两次批准。
apps/server/src/site-files/  按当前指针吐站点文件、/media、/_preview。不查询 pages。
apps/admin/              Vite + React。只调用 HTTP，不碰 domain 或 db。
packages/domain/         纯规则。不开事务，不读对象。
packages/operations/     操作名、路径、错误码、http-only。零依赖。
packages/ports/          对象存储、时钟、Markdown 解析的类型。
packages/adapters/       S3 与 Postgres。测试假实现留在这里。
packages/db/             Drizzle 表和 SQL 迁移。不放查询。
packages/public-client/  匿名 PCP 客户端。定制站也用它。
packages/original-pages/ 原始落地页源码。不改名为 pages。
skills/oneself/          给外部 Agent 的产品 Skill。进镜像。
.agents/skills/          开发技能。不进镜像，不和产品 Skill 合并。
tests/smoke/             进程内接口冒烟。只打已经启动的进程。
tests/acceptance/        产品 Skill 等验收。
```

依赖不是一条链。`operations` 不引用包外代码。`domain` 不引用服务器、React、数据库驱动或对象存储 SDK。`adapters` 不引用 `domain`。管理端、原始页面和公开客户端不引用 `domain` 或 `db`。不另建 `packages/application`、`services/`、`controllers/` 或 `utils/`。

`pnpm run boundaries` 会检查这些方向。没有列在 `docs/ARCHITECTURE.md` 第 4 节的目录不要另起。

## 改行为之前

影响对外行为、数据形状、发现文档或产品 Skill 的改动，先写 OpenSpec 变更，再等明确要求后实现：

```text
openspec/changes/<短名>/
  proposal.md
  design.md
  tasks.md
  specs/<能力>/spec.md
```

规格增量用英文 Requirement 和 Scenario。提案和设计用中文，写清为什么、不做什么、失败时如何表现。实现时按 `tasks.md` 做，只有该项行为已经落地并通过对应测试，才把 `- [ ]` 改成 `- [x]`。没有被要求时不要归档。

没有被要求时，不要顺手重构、不要扩大到相邻功能、不要把未归档提案当成已经上线的规格。

## 不能破坏的规则

- 资料和站点操作只有一套规则。先改 `packages/operations`，再让 PCP 和 MCP 一起出现。只加其中一个入口，测试失败。`create_api_key`、`list_api_keys`、`revoke_api_key` 只走 HTTP，不进 MCP。
- 对外源来自配置的 public origin，不看请求 `Host`。发现文档、Skill 的 `oneself_origin` 和安装索引都是如此。
- 产品 Skill 只有 `oneself`。入口是 `skills/oneself/SKILL.md`，写页规则在 `references/context.md`，公开页规则在 `references/public-page.md`。不要把两份正文拼进入口，也不要恢复 `context-management` 或 `public-page` 这两个产品名字。
- 产品 Skill 正文用中文，文件名和 `name` 用英文。不要在产品 Skill 或面向用户的协议说明里写出服务端框架名。不要写只给作者看的格式说明。
- 仓库里的 `SKILL.md` 不写死某台站点的 origin。发出入口和 archive 前才写入 `metadata.oneself_origin`。reference 不插入 origin。`GET /skills/oneself/SKILL.md` 与 `GET /pcp/v1/skills/oneself` 必须是同一份字节。
- 安装索引由应用生成，不放进站点 zip。上传含 `.well-known` 的站点包仍整包拒绝。
- 站点指针名 `original` 和源码包名 `original-page-source.zip` 不改。上传不等于上线。Agent 不得调用同意上线的接口，同意前不得声称站点已更换。
- 页面脚本只能匿名调用公开 PCP 和公开媒体。公开请求使用 `credentials: omit`。不要用管理端 Cookie 给公开站点里的脚本授权。
- 所属人密码、API Key 原文、OAuth 刷新令牌和对象存储密钥不进代码、测试、产品 Skill、页面、公开站或提交说明。库存哈希。
- 保留路径 `pcp`、`oauth`、`.well-known`、`admin`、`skills`、`media`、`_preview` 不能被站点包占用。Cloudflare 前面不要缓存这些路径。

## 实现习惯

- 外部 JSON 先用 Zod 解析，再进入领域类型。领域规则不使用 `any`。`unknown` 停在适配器边界。Zod 不生成表结构。
- 错误沿用现有 `{ error, message }` 和已有错误码。不要为了措辞新增错误码。
- 新迁移只追加 SQL 文件，不改已经应用过的迁移。Markdown 的权威副本是对象，不是表里的正文。不为一种资料建表。
- 单元测试与被测源码放在一起，文件名 `*.test.ts`。领域规则直接测纯函数，不启动 HTTP 或数据库。外部存储用端口假实现。
- `tests/smoke/` 按模块分文件，和 `pnpm test` 一起跑，不启动 Compose。`closed-loop` 才用 `vitest.smoke.config.ts`，打已经用 `compose.dev.yaml` 起来的数据库和对象存储。不要把领域规则搬进冒烟。
- 改了产品 Skill、发现文档、认证门或站点发布，要补或更新对应测试。管理端页面不要求单元测试。
- 注释只解释非显而易见的约束。不要复述代码在做什么。

## 完成前检查

先跑受影响的测试，再按改动范围跑门禁：

```bash
pnpm run typecheck
pnpm exec vitest run <相关测试文件>
pnpm run boundaries
```

推送到 GitHub 后，`.github/workflows/ci.yml` 会跑同一条 `pnpm run check`，并构建一次应用镜像但不推送。版本标签 `v1.2.3` 才会由 `release-image.yml` 推送 Docker Hub 上的应用镜像。不要把入口程序或密钥写进这个镜像。

准备提交或声明完成时，运行：

```bash
pnpm run check
```

它包含格式、lint、类型、测试、依赖方向和 Knip。编辑器没有报错不能代替这条命令。没有跑过的冒烟不要说成通过。

不要主动提交或推送。用户要求提交时，说明用一句祈使句，重点写为什么，而不是罗列文件。

## 不要做

- 不要把业务 if 堆进路由文件。路由只做认证、解析和返回。
- 不要让领域层为了省事直接查数据库或调用对象存储 SDK。
- 不要新增第二份操作表、第二份页面解析或第二套限流存储。
- 不要跟随请求 `Host` 改写发现文档，也不要同时开两个入口 profile。
- 不要实现架构明确排除的能力：按资料种类建表、服务端渲染公开站点、本地目录存储、Redis、向量索引、任务队列、微服务、邮箱找回密码。
- 不要把 `.agents/skills/` 和 `skills/oneself/` 混成一套，也不要把 API Key 写进产品 Skill 或它的安装目录。
