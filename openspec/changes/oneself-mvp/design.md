# Design

## Context

仓库现在没有应用代码。行为已经写在 `docs/PRD.md` 和 `docs/ARCHITECTURE.md` v0.13。见 `proposal.md` 的 Why。实现必须能在一台机器上跑通「写入一页、公开页被原始落地页读到、所属人批准后指针才移动」。

并行约束：后面会有多个 subagent，各自使用独立 git worktree。主代理把分支合并回 `main`，再跑最终验收。因此每个工作包只能拥有自己的目录；根清单、锁文件和 `compose.yaml` 只有主代理能改。

## Goals / Non-Goals

**Goals:**

- 一个 Node 进程闭环提供 PCP、MCP、OAuth、管理端和站点文件。
- 领域规则不依赖 Hono、React、数据库驱动或对象存储 SDK。
- 工作包按目录切开，合并时除主代理拥有的根文件外没有交叉改动。
- 最终验收覆盖 PRD 第 10 节，并额外检查发现文档不跟随 `Host`。

**Non-Goals:**

- 不实现 Tailscale Funnel、ngrok、应用内安装器，或把入口打进应用镜像。
- 不实现向量检索、Redis、本地目录、独立 MCP 进程、邮箱找回和管理端里的资料编辑器。
- 不在这一变更里做多租户或按 `type` 建表。

## Decisions

### 工作区按依赖方向切开

目录与架构第 4 节相同。`packages/operations` 零依赖，不引用 `packages/domain`。用例在 `apps/server/src/app/`，由 `pcp/` 和 `mcp/` 共同调用，再进入 domain。`packages/domain` 不引用服务器、数据库或对象 SDK。管理端、原始页面和公开客户端不引用 `packages/domain` 或 `packages/db`。

不把这理解成 `server → operations → domain` 一条链。注册表若依赖 domain，第一波就不再零依赖，管理端和公开客户端也不能单独引用路径。不新建 `packages/application`：多一个工作区包，第一波并行就要改根清单。

选择这个边界，是因为每个目录可以成为一条 worktree 的独占写入范围。备选是先写一个垂直切片再复制，但那样每个切片都会改服务器路由，worktree 无法并行。

### 两波开工，而不是所有目录同时写服务器

第一波在主代理放入空工作区之后并行。每个包只添加自己的 `package.json` 和源码，不修改根 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` 或 `compose.yaml`。

| 车道 | 独占目录 | 依赖 |
| --- | --- | --- |
| domain | `packages/domain` | 无 |
| operations | `packages/operations` | 无。操作名、路径、错误码、`http-only` 以架构第 6 节为准 |
| db | `packages/db` | 无。只放表和 migration |
| ports | `packages/ports` | 无。对象存储、时钟、Markdown 解析的类型 |
| admin | `apps/admin` | 只调用 HTTP |
| pages | `packages/original-pages`、`packages/public-client` | 公开 PCP 的形状 |
| skills | `skills/` | 无。两份产品说明 |

第二波等第一波合并到 `main` 之后再开：

| 车道 | 独占目录 | 依赖 |
| --- | --- | --- |
| adapters | `packages/adapters` | ports、db |
| server | `apps/server` | operations、domain、adapters、ports。用例在 `src/app/`，不在 operations |

主代理在两波之间把新包登记进工作区并更新锁文件。服务器车道不和其他车道同时改路由。

备选是让服务器也在第一波开工，用假的包名编译。那样合并时路由和注册表会冲突，所以不采用。

### 表的列定义单独成文

PRD 和架构没有列类型。`schema.md` 是 migration 的列清单。其中 `pages.visibility` 和 `pages.updated_at` 是行为所必需的投影，架构的列示里漏了它们。不要再加第三张业务表。

### 注册表是路径的唯一代码来源

`packages/operations` 导出操作名、HTTP 方法、路径、参数形状、错误码和 `http-only`。OpenAPI 和 MCP 都从这里生成。产品 Skill 里的路径由测试与注册表对照；不一致则失败。它不写用例，也不引用 domain。

### 服务器内部目录

`apps/server/src` 用 `app/`、`pcp/`、`mcp/`、`oauth/`、`owner/`、`site-files/`。不用 `http/` 或 `site/`，也不叫 `admin/`。站点指针规则在 `packages/domain/src/site-pointer.ts`；domain 不开事务、不读对象。`site-files/` 只按当前指针吐文件，不查询 `pages`。

以下不改：不合并或再拆 domain、operations、db、ports、adapters；db 不放查询；内存假实现留在 adapters 且生产入口不导出；adapters 不依赖 domain；`skills/` 与 `.agents/skills/` 不合并不改名；Dockerfile 和 compose 留在仓库根；不做 `apps/ingress`；`public-client` 不并进 `original-pages`；`original-pages` 不改名为 `pages`。

### 写入顺序

对象先写到内容哈希键。数据库事务再更新投影、版本和站点指针。事务失败时没有指针指向新对象。结构操作先改 Markdown，再走与 `put_page` 相同的事务。fence 解析失败则整次回滚。

### `remember` 和 `forget` 必须带页身份

架构把 `remember` 放在 `POST /pcp/v1/facts`，JSON 只写了事实字段；`forget` 只在路径里放 fact id。fact id 只在一页内唯一。本变更规定两者的 JSON 都包含 `source` 和 `slug`。这是为了让规格可测试，不是新的操作名。

### 入口 profile 互斥

三个入口都是 Compose profile。`.env` 示例里的 `COMPOSE_PROFILES=cloudflared`。镜像标签写死，并用 `CLOUDFLARED_IMAGE`、`CADDY_IMAGE`、`TAILSCALE_IMAGE` 覆盖。Tailscale 使用 userspace networking，只做 Serve。`PUBLIC_ORIGIN` 由环境变量注入应用，发现文档不读请求 `Host`。

开发用 `compose.dev.yaml`，只起 PostgreSQL 和 RustFS。应用在宿主机用 pnpm 跑。PostgreSQL 和 RustFS 的 `9000` 只绑回环，控制台 `9001` 不发布。生产不把数据库或 RustFS 映射到宿主机。

### 合并和验收只在主工作树

subagent 不推 `main`，不互相改 worktree。主代理按「domain、operations、db、ports、skills、pages、admin」合并第一波，解决根文件后合并 adapters，最后合并 server。冲突若来自独占目录之外，退回该车道，不在主代理里重写业务。

最终验收命令由主代理在合并后的 `main` 上执行：工作区类型检查、各包旁边的 `*.test.ts`、`apps/server` 里的 HTTP 与 MCP 契约测试、架构依赖检查，以及 `tests/smoke/` 里那条使用 compose 依赖的闭环。冒烟不替代领域测试。

## Risks / Trade-offs

- [第一波不产生可启动的服务器] → 闭环验收明确放在第二波合并之后，避免把半成品当成完成。
- [七条车道同时存在时根锁文件冲突] → 车道禁止改根文件；主代理每波只登记一次。
- [`remember` 的页身份是文档缺口上的假设] → 写进 pages 规格。若要改路径，先改规格再实现。
- [Cloudflare 读超时会切断过长的 MCP 响应] → 规格只要求普通调用能完成；不在这一变更里加流式保活。
- [Tailscale 跑在 Docker userspace 时地址分配和主机版不同] → profile 只保证 Serve 转到应用；不在应用里探测 Tailscale。

## Migration Plan

没有旧数据。首次启动创建所属人并要求改密。回滚是停掉 compose 并丢弃开发卷；不提供生产数据迁移。

入口切换只改 `COMPOSE_PROFILES` 和 `PUBLIC_ORIGIN`。换域名后，已保存旧发现地址的 Agent 必须重新读取 `/.well-known/pcp`。

## Open Questions

无。页身份、profile 互斥和主代理拥有根文件都已经定为实现约束。
