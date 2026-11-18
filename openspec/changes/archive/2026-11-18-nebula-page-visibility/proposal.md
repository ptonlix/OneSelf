# Proposal

## Why

所属人要确认哪些页公开，但星图抽屉只显示「公开」或「私有」，不能改。Agent 只能通过 `put_page` 或 `edit_page` 改 frontmatter，而且必须有该 source 的改可见性权限。没有这档权限时，人无法自己收回或放开一页。公开会立刻让这一页和它挂接的原件匿名可读，这个决定不该再绕一圈对话。

## What Changes

- 星图页抽屉增加两步确认的可见性开关。第一次点击不发请求。确认后只把该页 frontmatter 的 `visibility` 改成 `public` 或 `private`。
- 新增仅所属人会话可调用的 `POST /admin/pages/{source}/{slug}/visibility`。它不进入 PCP 操作表、MCP 或 OpenAPI。服务端在同一次写入里读取当前原文，只改 frontmatter 的可见性行，再带当前哈希走已有的 `put_page`。
- 省略 `visibility` 的页视为 `private`。改成公开或私有时都写上这一行。正文、其他 frontmatter、链接和原件挂接保持不变。已经是目标状态时不再写一版。
- 改为公开的确认文案写明：这一页和挂接原件会立刻匿名可读，已打进站点包的副本收不回，不必重新激活。改为私有的确认文案写明：下一次公开读取不再返回这一页和这些原件，包里已有的副本还在。
- 不新增 PCP 操作、错误码、数据表或依赖。不改星体颜色，不在资料列表加开关，不提供 Markdown 编辑器，也不放宽 Agent 的改可见性权限。

## Capabilities

### New Capabilities

- `page-visibility`: 所属人在星图抽屉里把一页改成公开或私有。写入仍走 `put_page`，不新增资料操作。

### Modified Capabilities

- 无。`openspec/specs/` 里还没有已归档能力。未归档的 `admin-nebula` 要求抽屉展示可见性和正文，并且不提供编辑动作。本变更不把那个要求改成可编辑 Markdown；可见性开关是所属人的另一次确认，不是正文编辑器。

## Impact

- `packages/domain`：纯函数只改 frontmatter 的 `visibility` 行，再交给现有 `put_page`。
- `apps/server`：所属人路由 `POST /admin/pages/{source}/{slug}/visibility`。API Key 和设备码得到 `forbidden`。
- `apps/admin`：星图页抽屉的两步确认。成功后重拉星图和这一页正文。
- 不改 `packages/operations`、发现文档、产品 Skill、站点指针或公开 PCP 的形状。
