---
name: oneself
description: Use when implementing, reviewing, or changing OneSelf. Triggers on this repo's server, admin, original pages, PCP, MCP, Drizzle schema, or site publishing. Project architecture overrides generic framework skills.
---

# OneSelf

事实来源按这个顺序：`docs/PRD.md`、`docs/ARCHITECTURE.md`、已归档的 `openspec/specs/`。通用技能和未归档变更都不能改写这些约束。

## 选型

- Node.js 24、TypeScript `strict`、pnpm。不提交 `package-lock.json` 或 `yarn.lock`。
- 一个进程提供 API、MCP、OAuth、管理端静态文件和已发布站点。不拆微服务，不引入 Redis。
- 公网入口是 Compose 的互斥 profile，默认 `cloudflared`。可换 `caddy` 或只在 tailnet 内的 `tailscale`。不要同时开两个，也不要装进应用镜像。
- 服务端用 Hono，只做认证、解析和返回。不用 Next.js、Express、Nest，也不用 `hono/jsx`。
- 管理端和原始页面是 Vite + React 的静态包。公开站点不是服务端模板。
- 领域代码是纯 TypeScript。不能引用 Hono、React、数据库驱动或对象存储 SDK。
- 数据库是 PostgreSQL 18 + Drizzle。表结构只来自 migration，不把 `drizzle-kit push` 当部署方式，也不同时支持 PGLite。
- 对象存储只有 RustFS。没有本地目录模式。
- MCP 使用官方 TypeScript SDK，同进程 Streamable HTTP，路径 `POST /mcp`。工具从操作注册表生成，不另起 MCP 进程。
- 测试用 Vitest。外部存储用端口假实现。

## 不要跟着通用技能走偏

- `hono` 只约束服务端路由。页面继续用 React。
- `drizzle-best-practices` 里的 MySQL、SQLite、Prisma 迁移和 `drizzle-zod` 生成表校验，不适用于本仓库。Zod 只解析接口入参和 frontmatter。
- `vercel-composition-patterns` 只用于 React 组件结构。部署不走 Vercel，页面不用 Next.js App Router。
- 仓库根目录的 `skills/` 是给外部 Agent 读的产品说明，不是这里的开发技能。
