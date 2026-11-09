# Proposal

## Why

所属人可以同时批准多条设备码授权。概览「已批准设备」每行只有随机授权编号、权限摘要和批准时间。几条授权的权限相近时，作废前分不清哪一条是哪一个 Agent。API Key 列表有所属人起的标签和最近使用时间，设备码授权没有。

## What Changes

- **BREAKING** `POST /admin/device` 必须带所属人填写的 `label`。去掉首尾空白后为空，或长于 80 个字符，返回现有的 `invalid`，并且不批准。Agent 不能提交或修改这个标签。
- `oauth_grants` 增加可空的 `label`、`last_used_at` 和 `refresh_expires_at`。已有行不补填标签。测试配置里的授权码授权仍可以没有标签。
- `GET /admin/oauth-grants` 在现有字段上增加 `label`、`last_used_at` 和 `expires_at`。`expires_at` 是当前刷新令牌的到期时刻；刚批准、尚未换到刷新令牌，或已经作废时为 `null`。响应仍不包含令牌、哈希或刷新载荷。
- `last_used_at` 只在 access token 被用来调用时更新，与 API Key 相同。批准、换 token 和刷新都不更新。作废后保留最后一次使用时间。
- 刷新令牌仍是 30 天、用则顺延。到期时刻在签发或轮换时由服务端记下。进程重启后按记下的时刻判断，不再一律改成现在加 30 天。旧行没有这个时刻时，列表显示空，下次成功刷新再写入。
- 概览用标签当标题；没有标签的旧行仍用缩短的编号。行内显示最近使用、批准时间和刷新到期。已作废的行保留最近使用和作废时间，不显示到期，也没有作废按钮。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `access`: 设备码批准要求所属人标签；已批准设备列表返回标签、最近使用和当前刷新到期，概览用这些字段分辨每一条授权。该需求目前定义在尚未归档的 `redesign-orbit-ui` 和 `device-unrestricted-data` 里，`openspec/specs/access` 还不存在。

## Impact

- `packages/db` 新迁移，以及 `oauth_grants` 的表定义和结构测试。
- `apps/server` 的设备码批准、刷新令牌轮换、重启装载、访问令牌认证和 `GET /admin/oauth-grants`。
- `apps/admin` 的批准页、概览「已批准设备」和列表解析。
- `docs/ARCHITECTURE.md` 的 `oauth_grants` 说明和设备码批准步骤。
- 不新增 PCP 操作、错误码、依赖，也不进 MCP 或 OpenAPI。不改产品 Skill。不改 `docs/PRD.md`：该文件要等本变更归档后再改。
