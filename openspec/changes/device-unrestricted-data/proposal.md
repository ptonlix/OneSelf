# Proposal

## Why

设备码批准不能勾选全部数据权限，OAuth 授权也不能 `sources_add`。空库上让 Agent 用设备码做初始化时，它不能新建目录，只能停下来换一把带全部数据权限的 API Key。两种凭据在这一档上应该一样。

## What Changes

- 设备码批准页增加「全部数据权限」，与 API Key 同一含义：勾选后忽略当时的 source 列表，包含以后新建的 source，三档都为真。`site:write` 仍单独勾选。
- **BREAKING** `POST /admin/device` 必须带 `unrestricted_data`。带上这个字段不再返回 `invalid`。未勾选时仍只保存当时勾选的 source。已批准、没有这一列的授权视为未勾选，不自动放大。
- 带全部数据权限的 OAuth 授权可以 `sources_add`，与同权限的 API Key 结果相同。删除和恢复目录仍只有所属人会话可以。设备码仍不创建 API Key，也不能管理密钥或同意上线。
- `whoami` 和 `GET /admin/oauth-grants` 增加 `unrestricted_data`，让 Agent 和概览能看出这次批准是否包含以后的目录。
- 产品 Skill 改为：所属人会话，或带全部数据权限的 API Key / 设备码授权，才可以 `sources_add`。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `access`: 设备码批准可以授予全部数据权限；`whoami` 和已批准设备列表返回该标志。该需求目前定义在尚未归档的 `oneself-mvp` 和 `redesign-orbit-ui` 里，`openspec/specs/access` 还不存在。
- `pages`: `sources_add` 也允许带全部数据权限的 OAuth 授权。删除和恢复目录的规则不变。该需求目前定义在尚未归档的 `oneself-mvp` 里。

## Impact

- `packages/domain` 的 OAuth 凭据和 `canAddSource`。
- `packages/db` 新迁移：`oauth_grants.unrestricted_data`。
- `apps/server` 的设备码批准、投影、`whoami`、授权列表。
- `apps/admin` 的设备码批准页和已批准设备摘要。
- `docs/PRD.md`、`docs/ARCHITECTURE.md`、`skills/oneself/references/context.md`，以及对应测试。
- 不新增 PCP 操作、错误码或依赖。不改 API Key 的批准流程。
