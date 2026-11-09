# Proposal

## Why

已作废的设备码授权仍留在「已批准设备」里。升级前没有标签的历史行无法改名，所属人只能一直看着这些记录。作废只让下一次请求失效，并不移出列表。

## What Changes

- 新增所属人接口 `POST /admin/oauth-grants/{id}/delete`。这是软删除：仍有效的授权先作废并销毁令牌，再写 `deleted_at`。行留在 `oauth_grants`。列表不再返回这一条。不存在或已经软删除时返回现有的 `not_found`。
- 只认所属人会话，并核对 Origin。不进 PCP 操作表、MCP 和 OpenAPI。不新增错误码。
- 概览和设备码页的「已批准设备」增加两步确认的删除。已作废的行也可以删除。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `access`: 所属人可以删除一条设备码授权记录，列表不再保留它。该需求目前定义在尚未归档的 `redesign-orbit-ui` 和 `distinguish-oauth-grants` 里，`openspec/specs/access` 还不存在。

## Impact

- `apps/server` 的授权引擎、运行时和所属人路由。
- `packages/adapters` 增加删除一行 `oauth_grants` 的方法。
- `apps/admin` 的概览、设备码页和 HTTP 客户端。
- `docs/ARCHITECTURE.md` 的设备码步骤。不改 `docs/PRD.md`。
