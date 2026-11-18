# Design

## Context

星图对话框已经用 `readPage` 渲染去掉 frontmatter 的正文。原件只来自 `GET /admin/graph` 的 `media_types`，对话框把它们拼成一行字。字节仍由已有的 `GET /pcp/v1/files?source=&slug=` 和 `GET /media/{id}` 提供。管理端请求默认 `credentials: include`，会话 Cookie 是 `SameSite=Lax`。`file_list` 返回的 `url` 使用配置的 public origin，不看当前 Host。文件 id 是 `file_` 加 16 字节十六进制。见 proposal.md。

## Goals / Non-Goals

**Goals:**

- 打开页时并行读取原件列表。原件默认收起；打开后正文和预览在同一个框里，顶栏横跨两栏。
- 预览只打当前管理端主机上的 `/media/{id}`。

**Non-Goals:**

- 不改星图响应、操作表、媒体权限或公开站。
- 不加 PDF 库，不给媒体接口补 Range。
- 不在资料页做同样的预览。

## Decisions

1. **只加管理端客户端方法。** `AdminClient` 增加 `listPageFiles(source, slug)`，请求已有的 `GET /pcp/v1/files?source=&slug=`。解析 `id`、`media_type`、`byte_size`。绝对 `url` 不进入视图。失败沿用现有请求错误，由星图画「原件没读到」。

2. **路径在视图里用纯函数拼。** 只有匹配 `file_` 加 32 位小写十六进制的 id 才变成 `/media/{id}`。其他 id 不嵌入，避免把列表里的异常字符串拼进地址。图片用 `img`，`application/pdf` 用带标题的 `iframe`。不设 `sandbox`，否则浏览器自带 PDF 查看器可能打不开。不设 `download`。新标签用同一个相对地址，`rel="noopener"`。

3. **多个原件只嵌一个。** 列表按接口返回顺序。未选择时预览第一项。选择另一项只换预览，不重新请求正文。不能嵌入的类型不出现在现有允许列表里；若类型不是图片或 PDF，只显示类型和大小，不嵌入。

4. **原件默认收起。** 打开页只显示正文。有原件时用图标打开，不写「原件」。点开后正文和原件在同一个框里，框铺满星图区域，顶栏横跨两栏，可见性在左、关闭在右。两栏之间是一条细线，不是两扇窗之间的空隙；预览栏比正文栏宽。原件、收起和新标签打开都用图标，不写这几个字。类型和大小写在工具条上，大小用 KB 或 MB。PDF 与图片铺满原件那一块。可以收起，收起后正文还在。窄于 900px 时原件改到正文下面，正文在上。没有原件时不给入口。列表失败且星图已知有原件时，正文旁写「原件没读到」。

5. **状态留在星图屏。** 选择页时与正文并行调用 `listPageFiles`。换页或关闭时丢掉上一页的列表、选中项和已打开的原件窗口。星图里的 `file_count` 只用来区分「列表失败」和「确实没有原件」，不用来代替列表。

备选：把文件 id 放进 `GET /admin/graph`。拒绝。那条响应规定不含原件字节，也没有必要为预览改读模型。备选：用返回的绝对 `url` 做 iframe。拒绝。Host 和 public origin 不一致时，私有原件不会带上管理端 Cookie。备选：引入 pdf.js。拒绝。本变更不新增依赖，浏览器查看器覆盖允许的 PDF。

## Risks / Trade-offs

- [浏览器 PDF 查看器请求 Range，而 `GET /media/{id}` 一次返回全文] → 20 MiB 上限内通常仍能打开。打不开时另开变更补 Range，不在这里换方案。
- [iframe 里的 PDF 查看器是浏览器浅色界面] → 不改主题。管理端只提供容器。
- [列表成功后媒体仍可能 404] → 对话框不探测字节。权限仍由现有媒体接口决定。
- [未归档的 `admin-nebula` 要求展示原件类型] → 有原件时在预览旁显示类型和大小，不删掉这个信息。

## Migration Plan

只改管理端静态包。不迁移数据。回滚是去掉对话框预览和 `listPageFiles`。

## Open Questions

无。窄屏断点取 900px，不影响规格。
