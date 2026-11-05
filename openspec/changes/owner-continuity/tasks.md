# Tasks

## 1. 安装目录内的备份

- [x] 1.1 让 `apps/cli` 在找不到 `scripts/transfer-cli.ts` 时仍用安装目录的 `compose.yaml` 跑 format 1 导出和导入，并验证 `apps/cli` 测试：无仓库、无 `ONESELF_REPO_ROOT` 时 backup 不再提示克隆仓库。
- [x] 1.2 非交互且未传 `--stopped`、`app` 在跑时失败且不写档案；交互式确认后只 `stop app`，完成后 `start app`。用 CLI 测试桩验证没有停 postgres，也没有 `compose down`。
- [x] 1.3 保持档案不含 `.env`，Unix 上模式为 `0600`，摘要仍声明会话、设备码、`PUBLIC_ORIGIN` 和存储密钥未导出；无 `--replace` 时不截断数据表。用现有 `scripts/data-transfer` 测试加上 CLI 摘要断言验证。
- [x] 1.4 更新 `docs/ARCHITECTURE.md` 里 CLI 备份那段，写明安装目录不依赖仓库脚本。核对 README 运维命令与这段一致。

## 2. 连续子串检索

- [x] 2.1 在适配器或应用检索测试里锁住：可读页标题或正文含「上海」时 `search` 命中；字符串只在 chunk 行里时不命中。运行对应 vitest 文件。
- [x] 2.2 追加迁移删除 `pages_title_body_search_idx`，并更新 `packages/db` 的 schema 测试。不新增扩展，不改旧迁移。
- [x] 2.3 把 `docs/ARCHITECTURE.md` 的检索描述改成连续子串，并写明不用 `to_tsvector('simple')`。不改 `docs/PRD.md`。

## 3. 管理端目录与最近写入

- [x] 3.1 增加仅所属人会话可调用的 `GET /admin/deleted-sources`，返回 30 天内软删除目录的 id 和 `deleted_at`。`limit` 默认 20、最大 50，`cursor` 是偏移；超过 20 条时第二页仍能取到，超过 30 天的不出现。API Key 调用得到 `forbidden`。用 owner 路由测试或冒烟验证，不新增错误码。
- [x] 3.2 概览列出这些目录；删除和恢复都要第二次确认，再分别调用 `sources_delete` 和 `sources_restore`。用 `apps/admin` 视图测试验证第一次点击不发请求。
- [x] 3.3 概览用所属人 Cookie 调用 `query`。第一页 limit 20；满页后用 `cursor` 取下一页，不把 20 当成总条数。按返回顺序显示 source、slug、type、title、`updated_at`，不显示正文，也没有编辑动作。用视图测试验证 21 条时能翻到第二页。
- [x] 3.4 一个面板失败时，密钥、站点和设备面板仍渲染。扩展现有概览失败测试。

## 4. 设备码接入顺序

- [x] 4.1 安装成功摘要先给出 `npx skills add <PUBLIC_ORIGIN> -a <agent> -s oneself -y`，并写明到 `/admin/device` 批准设备码，不把创建 API Key 放在第一步。更新 `apps/cli/src/summary.test.ts`。
- [x] 4.2 改 `skills/oneself/SKILL.md`：没有凭据时申请设备码，不先要 API Key；API Key 只作为脚本或长期密钥的另一种选择。仓库副本不写死 origin。用 `tests/acceptance/skills.test.ts` 验证。
- [x] 4.3 README 快速开始改成同一顺序。公开首页不改，确认没有加入 `/admin/device` 或 `/admin/api-keys/new`。
- [x] 4.4 管理端在没有有效密钥且没有已批准设备时显示这条命令。origin 从匿名发现文档的 `skills.oneself` 解析，不用 `location.origin`。用视图测试覆盖伪造 Host 不会改命令；已有授权时不拿空状态替换授权面板。

## 5. 集成核对

- [x] 5.1 跑受影响的 vitest、`pnpm run typecheck` 和 `pnpm run boundaries`。四条规格的场景都有对应断言后再勾选。

## Workflow follow-up

- 归档前先归档或合并 `oneself-mvp`、`redesign-orbit-ui`、`host-skill-discovery` 和 `host-install-cli`，因为本变更修改的是那些未进入 `openspec/specs/` 的要求。
- 不要在实现时改 `docs/PRD.md`。
