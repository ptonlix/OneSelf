# Proposal

## Why

星图点开一页时只渲染 Markdown。挂在 frontmatter 上的原件只剩一行媒体类型，例如 `application/pdf`。体检报告这类页的对照件是 PDF，所属人在对话框里看不到字节，也无法预览。

## What Changes

- 点开有原件的页时，对话框默认只给出去掉 frontmatter 的正文。打开原件后，正文和预览在同一个框里，顶栏横跨两栏，中间是一条细线，不是两扇窗之间的空隙。原件、收起和新标签用图标。大小用 KB 或 MB。窄到放不下两栏时改成上下排，正文在上。
- 打开页时额外调用已有的 `GET /pcp/v1/files?source=&slug=`。预览地址用同站相对路径 `/media/{id}`，不用该接口返回的绝对 `url`。
- JPEG、PNG、WebP、GIF 用图片预览。PDF 用浏览器自带查看器内嵌预览，并提供同一相对地址的新标签打开。一页多个原件时列出类型和大小，默认预览第一个，点另一个再换。
- 没有原件时仍是现在的单栏，不再单独印媒体类型。原件列表失败、但星图已知这一页有原件时，正文照常，并写明原件没读到。
- 原件仍不是恒星。不提供 Markdown 编辑。不改 `GET /admin/graph`，不把字节放进星图响应。

不新增 PCP 操作、错误码、数据表或依赖。不改公开站、产品 Skill 或发现文档。不在这一变更里给 `GET /media/{id}` 增加 Range。

## Capabilities

### New Capabilities

- `nebula-file-preview`: 所属人在星图页对话框里阅读正文，并按需在同一个框里预览这一页挂接的原件。

### Modified Capabilities

- 无。`openspec/specs/` 里还没有已归档能力。未归档的 `admin-nebula` 要求对话框展示正文和原件类型，并且原件不是恒星。本变更不改那条读模型，只把类型行换成可预览的原件。

## Impact

- `apps/admin`：星图打开页时调用已有的 `file_list`，对话框按类型预览 `/media/{id}`。
- `apps/server`、`packages/operations`、`packages/domain`：不改。原件权限仍是现有的 `GET /media/{id}`。
