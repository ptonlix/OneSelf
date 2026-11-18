# Proposal

## Why

装好的 OneSelf 已经能让 Agent 读写上下文、让所属人批准授权和上线，但闭环在四处断掉：生产安装目录不能自己备份；检索实现和架构文档不一致，改错就会让中文命中退步；所属人删过的目录没有管理端入口可恢复；安装结束后人仍要自己判断该不该先造 API Key。这四处都停在现有边界里，不需要新的登录、检索产品或内容编辑器。

## What Changes

- 安装后的 `oneself backup` / `restore` 必须在安装目录里独立完成，沿用现有 bundle format 1 和 `--via compose` 语义。不要求检出仓库、宿主机 Node 或宿主机 `pg_dump`。应用服务仍在跑时不得读写这份包。交互式运行可以先停 `app`、做完再拉起；非交互仍必须显式 `--stopped`，不得自己停服务。`--replace` 仍是显式的破坏性导入。包内不含 `.env`、`PUBLIC_ORIGIN`、对象存储密钥、会话或未批准的设备码；所属人密码哈希、API Key 哈希和 OAuth 授权哈希仍在包内，包按敏感文件处理。
- 锁定 `search` / `public_search` 的命中规则：对 `type`、标题、正文和 frontmatter 字符串做连续子串匹配。连续的中文片段（例如「上海」）必须命中。不得改成 `to_tsvector('simple')` 的词法匹配，不得把 `chunks` 当被搜文档，不得引入向量索引、Elasticsearch 或中文分词扩展。去掉当前没有被查询使用的 `simple` GIN 索引，避免以后有人把它当成检索实现。
- 管理端补上所属人现在只能靠 Cookie 调接口才能做的目录恢复：列出 30 天内软删除的目录，确认后调用已有的 `sources_restore`；删除目录同样要二次确认，并调用已有的 `sources_delete`。30 天是保留期，不是条数上限；这个列表按页返回，默认每页 20，最多 50，可翻到最后。概览增加只读的「最近写入」，数据来自已有的 `query`（按 `updated_at` 降序），同样分页，不把 20 当成总条数。不返回正文，不显示是哪把密钥写的。不新增 PCP 操作，也不做页面编辑器。
- 第一次接入只写一条顺序：把配置好的 origin 和 `npx skills add <origin> -a <agent> -s oneself -y` 交给正在对话的 Agent；它没有凭据时申请设备码；所属人在已有的 `/admin/device` 批准。API Key 仍可用，但是脚本、CI 或所属人主动要一把长期密钥时的选择，不是第一次对话的默认请求。安装结束提示、README、产品 Skill 和管理端尚无凭据时的空状态使用这条顺序。公开首页维持现有规格：两种授权都提到，且不写出 `/admin/device` 或 `/admin/api-keys/new`。

不改 `docs/PRD.md`。不新增错误码、第三种登录、凭据归属列、链接类型、旧 release 删除、向量检索或自定义 Postgres 镜像。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `host-install`：安装目录内的备份与恢复不再依赖仓库里的 `scripts/transfer-cli.ts`；安装成功提示改成设备码接入顺序。该能力目前在未归档的 `host-install-cli`，`openspec/specs/host-install` 尚不存在。
- `retrieval`：把已实现的连续子串检索写成要求，并禁止用 `simple` 全文配置替换它。该能力目前在未归档的 `oneself-mvp`。
- `access`：管理端增加软删除目录的删除/恢复，以及只读最近写入。概览已有的目录计数、公开页计数、密钥、授权和站点指针保持。该能力的界面要求目前在未归档的 `redesign-orbit-ui`，权限规则在 `oneself-mvp`。
- `skill-discovery`：连接说明把设备码定为没有凭据的对话 Agent 的默认路径，API Key 降为显式的另一种选择。该能力目前在未归档的 `host-skill-discovery`。

## Impact

- `apps/cli`：把现有 compose 传输编进 CLI，不再在安装目录找不到脚本时失败。`scripts/data-transfer.ts` 仍是 bundle 规则的来源，仓库里的 `pnpm data:export` / `data:import` 继续可用。
- `packages/db`：只追加迁移，删除未被查询使用的 `pages_title_body_search_idx`。不新增扩展。
- `apps/server/src/app` 与 `packages/adapters`：检索测试锁住中文连续子串；不改命中形状、权限和 140 字片段上限。
- `apps/server/src/owner`：新增仅所属人会话可调用的已删除目录列表。恢复和删除仍走现有 PCP。
- `apps/admin`：软删除目录面板、最近写入、无凭据时的接入空状态。origin 取发现文档里的配置源，不取浏览器 `Host`。
- `skills/oneself/SKILL.md`、README、安装结束文案，以及对应的 Skill / CLI 测试。
- 不改公开首页规格，不改 `packages/operations` 的操作表。
