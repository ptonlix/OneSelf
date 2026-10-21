# Tasks

第一波的车道在主代理完成第 1 节之前不要开工。每条车道只写自己的目录，不修改根 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`compose.yaml` 或 `compose.dev.yaml`。第二波在第 3 节合并进 `main` 之后再开。

## 1. 主代理准备空工作区

- [x] 1.1 在主工作树创建 pnpm 工作区、TypeScript strict、Vitest 和 dependency-cruiser 配置，包目录先留空的 `package.json`。运行 `pnpm install`，确认它成功且没有 `package-lock.json`。
- [x] 1.2 添加 `compose.yaml` 和 `compose.dev.yaml`。生产不映射应用、PostgreSQL 或 RustFS 的宿主机端口。开发只把 PostgreSQL 和 RustFS `9000` 绑到回环，不发布 `9001`，应用用 pnpm 跑在宿主机。`cloudflared`、`caddy`、`tailscale` 是互斥 profile，默认 `COMPOSE_PROFILES=cloudflared`。用 `docker compose config` 确认这两种端口结果。
- [x] 1.3 添加 `.env.example`，包含 `PUBLIC_ORIGIN`、主人初始口令和入口令牌的占位，不含真实密钥。确认示例文件可被提交，而 `.env` 仍被 gitignore。

## 2. 第一波并行车道

- [ ] 2.1 `packages/domain`：实现 slug、source、visibility、哈希条件写入、恰好一次的替换、两种 fence、30 天软删除，以及没有改可见性权限时仍可改正文。目录删除只隐藏未单独删除的页，恢复时不复活更早的页删除。这些测试不启动 HTTP 或数据库，并全部通过。
- [ ] 2.2 `packages/operations`：按架构第 6 节登记操作名、方法、路径、错误码和 `http-only`。测试断言三个密钥操作是 `http-only`，并且资料和站点操作都会同时生成 HTTP 与 MCP。
- [ ] 2.3 `packages/db`：按 `schema.md` 添加 Drizzle schema，并只追加一份初始 migration。测试断言列与该文件一致，没有按资料 `type` 分开的业务表，且 `page_versions` 不保存第二份正文。
- [ ] 2.4 `packages/ports`：定义对象存储、时钟和 Markdown 解析端口。`pnpm exec tsc --noEmit` 在该包通过，且源码不引用厂商 SDK。
- [ ] 2.5 `apps/admin`：实现登录、改密、设备码批准、API Key 批准和站点批准页面，只调用 HTTP。批准页在确认前写明：读权限包含该 source 的全部未删除私有页。生产构建成功，页面源码不引用 `packages/domain` 或 `packages/db`。
- [ ] 2.6 `packages/public-client` 与 `packages/original-pages`：客户端请求公开 PCP 时使用 `credentials: omit`。原始页面在没有公开页时显示空状态，有公开页时按 site 规格展示，未知路径构建结果不启用 SPA 回退。相关测试通过。
- [ ] 2.7 `skills/data.md` 与 `skills/original-page.md`：写明 frontmatter、两种 fence、`files`、`[[source/slug]]`、原始页面能展示的公开字段、真实路径、保留路径、`credentials: omit`、不得写入密钥或私有页、批准地址必须交给主人、同意前不得声称已更换，以及下一轮必须从原始源码 zip 开始。测试断言这些句子存在，且正文不出现 Hono、Express 或 Next.js。

## 3. 主代理登记第一波

- [ ] 3.1 把第一波各包登记进工作区并更新 `pnpm-lock.yaml`。运行类型检查和 dependency-cruiser，确认 `packages/domain` 没有引用 Hono、React、数据库驱动或对象存储 SDK。
- [ ] 3.2 将第一波分支按 domain、operations、db、ports、skills、original-pages、admin 的顺序合并到 `main`。独占目录之外的冲突退回原车道，不在主工作树重写业务。

## 4. 第二波并行车道

- [ ] 4.1 `packages/adapters`：实现 RustFS 所用的 S3 端口、Postgres 端口，以及测试用的内存对象存储。单元测试使用内存假实现，不连接生产端点。
- [ ] 4.2 `apps/server` 写入路径：同一事务完成对象指针、投影和最多 50 条版本；`put_pages` 任一页失败则全部不写；fence 失败整次回滚。每小时清理超过 30 天的软删除和超过 7 天且无引用的对象，不删除 release。集成测试覆盖 stale hash、模糊替换、跨页原件和这次清理。
- [ ] 4.3 `apps/server` 读取与检索：实现授权搜索、匿名公开搜索、`query`、`recall`、目录、`whoami`、`resolve_slugs` 和结构读接口。`search` 查 `pages` 的 type、标题、正文和 frontmatter，不查 `chunks`。主人可以软删除和恢复 source；API Key 不能。测试断言私有页不改变公开命中和计数，匿名 `query` 返回 `unauthorized`，无权限、已删除和不存在都是 `not_found`，删除目录后其他页的链接原文不变。
- [ ] 4.4 `apps/server` 站点：按指针提供 `original` 或 release。预览匿名可开且不移动指针。只有主人批准才移动指针。公开资料变化后不用重新激活；已打进 zip 的副本不回收。测试覆盖保留路径整包拒绝、没有删除 release 的路由，以及 Agent 调用批准路由得到 `forbidden`。
- [ ] 4.5 `apps/server` 身份：实现主人引导、改密门、API Key 一次展示、设备码、刷新令牌轮换和重用即作废。测试断言启动不生成 API Key，且 OAuth 不能管理密钥。
- [ ] 4.6 `apps/server` 协议与入口：从注册表生成 OpenAPI 和 `POST /mcp`，路径与 protocol 规格一致，不启用 CORS。发现文档只使用 `PUBLIC_ORIGIN`。限流只信任当前入口这一跳。Cloudflare 规则不缓存 `/pcp`、`/oauth`、`/admin`、`/skills`、`/media`、`/_preview`。测试断言 MCP 工具列表没有密钥操作，伪造的 `X-Forwarded-For` 不改变限额桶。

## 5. 主代理合并并验收

- [ ] 5.1 合并 adapters 后合并 server，再次更新锁文件。运行全部单元测试、HTTP 与 MCP 契约测试和 dependency-cruiser，三者都通过。
- [ ] 5.2 用 `compose.dev.yaml` 启动 PostgreSQL 和回环上的 RustFS `9000`，跑一条闭环：改密、写入公开页、原始页面读到它、上传 release、批准前线上路径不变、批准后改变、再把该页改成 private 后公开读消失。开发和生产配置都没有本地目录存储。这条测试通过才算本变更完成。
