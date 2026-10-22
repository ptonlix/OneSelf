# Proposal

## Why

仓库里只有 PRD 和架构，没有可以启动的应用。所属人现在不能把资料放进自己的机器，也不能让访客或 Agent 用同一套规则读到它。这次变更把 v0.13 文档收成一个能在本机闭环跑起来的实现，并切成互不改同一批文件的工作包，方便多个 worktree 同时写、由主代理按顺序合并后再做最终验收。

## What Changes

- 新增 pnpm 工作区：一个 Node 进程提供 PCP、MCP、OAuth、管理端和已发布站点。
- 新增 Markdown 原文、Postgres 投影、原件、检索，以及 Facts、Timeline、标签和链接的回写。
- 新增公开静态站：原始落地页、预览、申请后才移动的站点指针。
- 新增所属人登录、API Key 批准和 OAuth 2.1 设备码。密钥管理只走 HTTP。
- 新增唯一 HTTPS 入口。默认 cloudflared，可改成 Caddy 或仅 tailnet 的 Tailscale Serve。
- 不新增第二套应用、Redis、本地目录存储、Next.js 或独立 MCP 进程。

## Capabilities

### New Capabilities

- `pages`: 业务目录、Markdown 原文、投影、版本、软删除，以及回写原文的结构操作。
- `originals`: 原件上传、挂接和按可见性吐字节。
- `retrieval`: 已授权检索、公开检索、过滤查询和事实回忆。
- `site`: 单一静态站、公开 PCP、原始页面、预览和批准后才移动的指针。
- `access`: 所属人会话、API Key、设备码，以及统一的 `authorize`。
- `protocol`: 发现文档、OpenAPI 与 MCP 同操作，错误体和两份 Skill 字节一致。
- `ingress`: 一个对外源、三个互斥入口 profile，以及按真实客户端地址限流。

### Modified Capabilities

- 无。`openspec/specs/` 里还没有能力。

## Impact

- 新代码在 `apps/server`、`apps/admin`、`packages/domain`、`packages/operations`、`packages/db`、`packages/ports`、`packages/adapters`、`packages/public-page`、`packages/public-client`，产品 Skill 在仓库根 `skills/`。
- 新依赖：Hono、Drizzle、PostgreSQL 18、Zod、Vitest、Vite、React、`node-oidc-provider`、官方 MCP TypeScript SDK、Argon2。对象存储运行时是 RustFS。
- 根上的 `compose.yaml`、锁文件和工作区清单只由主代理修改。并行工作包只写自己的目录。
- 行为以 `docs/PRD.md` 与 `docs/ARCHITECTURE.md` v0.14 为准。文档和规格冲突时先停，不在实现里另选一种协议。
- 表的列和约束在 `schema.md`。PRD 和架构只有每张表的用途，没有列定义。
