# Design

## Context

见 `proposal.md` 的 Why。实现时对着这些已有事实，不要另起一套：

- 备份包已经是 format 1：`scripts/data-transfer.ts` 的 `DATA_TABLES`、`pages/` `files/` `sites/` 前缀、`--stopped`、`--replace`，以及 compose 路径里在 Postgres 容器内调用 `pg_dump`。`apps/cli/src/transfer.ts` 只在安装目录、仓库或 `ONESELF_REPO_ROOT` 找到 `scripts/transfer-cli.ts` 时才转调，找不到就失败。`oneself-compose.tar.gz` 不能再塞脚本。
- `searchPages` 已是 `LIKE` 连续子串，适配器测试期望「上海」命中、「只在块里」不命中。`pages_title_body_search_idx` 是 `to_tsvector('simple', …)`，查询没有用它。`docs/ARCHITECTURE.md` 仍把检索写成 Postgres 全文检索。
- 管理端概览已经读目录、公开页计数、密钥、站点指针和已批准设备。`sources_list` 不返回软删除目录。`page_versions` 没有凭据列。`query` 已按 `updated_at` 降序，且不返回正文。
- 公开首页规格要求两种授权都提到，并且不写出 `/admin/device` 或 `/admin/api-keys/new`。这条不改。

## Goals / Non-Goals

**Goals:**

- 安装后的 CLI 自己完成 format 1 的 compose 备份和恢复。
- 用测试锁住连续子串检索，并去掉会误导实现的无用索引。
- 所属人在管理端删除和恢复目录，并看到最近写入的页标识。
- 安装提示、README、Skill 和管理端空状态使用同一条设备码顺序。

**Non-Goals:**

- 第二套备份格式、把数据库端口映射出来、在备份里写入 `.env`。
- `pg_trgm`、中文分词扩展、自定义 Postgres 镜像、向量索引。
- 新的 PCP 操作或错误码，页面编辑器，凭据归属列。
- 改公开首页的接入文案。
- 改 `docs/PRD.md`。

## Decisions

1. **传输逻辑编进 CLI，不进 compose 包。** `apps/cli` 直接调用现有 bundle 函数和 compose IO。安装后的 `backup` / `restore` 固定走安装目录的 `compose.yaml`，相当于今天的 `--via compose`。仓库里的 `pnpm data:export` / `data:import` 仍走 `scripts/transfer-cli.ts`，保留 host 与 compose 两条路径。不另发布传输二进制：多一个 Release 资产就要多一套校验，而 CLI 已经是运维的唯一实现。
2. **只有交互式运行可以代停 `app`。** 用 `docker compose stop app`，做完 `start app`。不停 Postgres、RustFS，也不 `down`。非交互没有 `--stopped` 且 `app` 在跑时，直接失败。停之前必须询问；启动失败时打印要执行的 start 命令，不假装站点还在。
3. **检索不改匹配器。** 补「上海」命中和「只在块里」不命中的回归测试。新迁移只 `DROP INDEX pages_title_body_search_idx`。实现时把 `docs/ARCHITECTURE.md` 里「全文检索」改成连续子串，避免下一次按文档改回 `simple`。PRD 已写字符串检索，不动。
4. **已删除目录只加管理端路由。** `GET /admin/deleted-sources` 要所属人会话，从已有的 source 列表里取 `deleted_at` 在 30 天内的行，返回 id 和 `deleted_at`。30 天是保留期，超过就不再出现。列表本身分页：`limit` 默认 20、最大 50，`cursor` 是偏移，按删除时间降序。不把全部软删除目录一次塞进响应。删除和恢复仍是 `sources_delete` / `sources_restore`，二次确认后由管理端用所属人 Cookie 调用。不把软删除目录塞进 `sources_list`，否则 Agent 的目录清单会变。
5. **最近写入复用 `query`。** 管理端 `POST /pcp/v1/query`，`credentials: include`。第一页 `limit` 20；这一页满了就用已有的 `cursor` 取下一页，直到返回不满一页。不提高 `query` 每次最多 50 条的上限，也不新增排序参数。不显示 visibility；`query` 没有这个字段。
6. **接入命令的 origin 来自发现文档。** 管理端匿名读 `/.well-known/pcp`，从 `skills.oneself` 取出 origin。不用 `location.origin`，也不相信请求 `Host`。仓库里的 `SKILL.md` 仍不写死某台 origin。
7. **归档顺序。** `retrieval`、`access`、`skill-discovery`、`host-install` 的现行要求在未归档变更里，`openspec/specs/` 还是空的。本变更要在那些变更归档之后再归档，或归档时把对应 delta 一起合并。不要为了本变更去改 `docs/PRD.md`。

## Risks / Trade-offs

- [备份含密码哈希和密钥哈希] → 档案模式 `0600`，摘要继续声明会话、设备码、`PUBLIC_ORIGIN` 和存储密钥没有导出。不在日志里打印 `.env`。
- [交互式停 `app` 后启动失败] → 命令失败并打印 `docker compose start app`。非交互绝不自动停。
- [删目录是不可由 Agent 代做的破坏操作] → 与作废密钥一样，第二次点击才发请求。
- [丢掉无用 GIN 索引] → 查询本来就不用它。回滚是再追加一条建索引的迁移，不改旧迁移。
- [旧 CLI 仍不会备份] → 要等用户重跑新 Release 的安装命令换二进制。这和现有升级方式一致。
- [公开首页仍并列两种授权] → 有意保留。第一次顺序只出现在安装提示、README、Skill 和管理端。

## Migration Plan

1. 追加迁移，删除 `pages_title_body_search_idx`。已有数据不变。
2. 发版时先有带传输逻辑的 CLI 资产，再推应用镜像。旧安装不自动获得备份能力。
3. 回滚应用镜像不影响备份包格式。回滚 CLI 只是恢复「安装目录不能备份」的旧失败，不损坏已导出的包。

## Open Questions

无。Windows 上交互式停 `app` 与现有安装器一样，只能在真实 PowerShell 里手测，不改变上述决定。
