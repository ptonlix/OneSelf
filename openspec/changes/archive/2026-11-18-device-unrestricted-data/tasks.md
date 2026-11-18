# Tasks

## 1. 规则和表

- [x] 1.1 给 OAuth 凭据加上 `unrestrictedData`，让 `sourceFlags` 和 `canAddSource` 与 API Key 用同一判断；删除和恢复目录仍只允许所属人。用 `packages/domain` 的纯函数测试验证：无限制 OAuth 可以建目录，受限 OAuth 不行，无限制 OAuth 不能删目录。
- [x] 1.2 追加迁移，给 `oauth_grants` 增加 `unrestricted_data boolean not null default false`。不改已有迁移。用现有表结构测试确认列和默认值。

## 2. 批准和投影

- [x] 2.1 `POST /admin/device` 要求 `unrestricted_data`。为真时忽略 `sources` 并存空数组；缺字段返回 `invalid` 且不批准。投影读写这一列，已有行读成 false。用 `tests/smoke` 里的设备码用例验证批准、重启后重载，以及缺字段被拒绝。
- [x] 2.2 `whoami` 和 `GET /admin/oauth-grants` 返回 `unrestricted_data`。无限制 OAuth 的 `whoami.sources` 包含批准后新建的目录，三档都为真。列表仍不含令牌或哈希。用同一冒烟验证。

## 3. 管理端和说明

- [x] 3.1 设备码批准页增加全部数据权限开关，勾选后提交空的 source 列表。确认前仍写明读权限包含私有页。概览的已批准设备显示这个标志。用 `apps/admin` 的表单和视图测试验证请求体和文案。
- [x] 3.2 更新 `docs/PRD.md`、`docs/ARCHITECTURE.md` 和 `skills/oneself/references/context.md`：`sources_add` 也允许带全部数据权限的设备码授权。用产品 Skill 验收测试确认这句话在，且正文仍不出现服务端框架名。

## 4. 门禁

- [x] 4.1 跑 `pnpm exec vitest run` 覆盖改过的领域、管理端和冒烟文件，再跑 `pnpm run check`。
