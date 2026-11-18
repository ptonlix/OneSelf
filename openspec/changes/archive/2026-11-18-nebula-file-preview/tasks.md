# Tasks

## 1. 原件列表客户端

- [x] 1.1 在 `AdminClient` 增加 `listPageFiles(source, slug)`，请求 `GET /pcp/v1/files?source=&slug=`，只解析 `id`、`media_type`、`byte_size`。用 `apps/admin/src/http.test.ts` 验证查询串和解析结果，并验证绝对 `url` 没有进入返回值。

## 2. 对话框预览

- [x] 2.1 在星图视图用纯函数把合法 id（`file_` 加 32 位小写十六进制）变成 `/media/{id}`，非法 id 不生成地址。用视图测试验证合法 id 得到该路径，非法 id 没有预览地址。
- [x] 2.2 原件默认收起。打开后同一个框里渲染去掉 frontmatter 的正文和预览：图片用 `img`，PDF 用带标题的 `iframe`，旁边显示类型和 KB 或 MB 大小，新标签用同一相对路径的图标。多个原件默认预览第一项，选择另一项后只换预览。用 `apps/admin/src/nebula.test.ts` 验证打开后正文和 `/media/{id}` 同时出现，绝对 origin 不出现，切换后不再嵌入前一个原件，文件 id 不是恒星标签。
- [x] 2.3 没有原件时保持单栏，不单独印媒体类型。列表失败且星图 `file_count` 大于 0 时保留正文并显示「原件没读到」。列表进行中且 `file_count` 大于 0 时显示「正在读取原件」。用视图测试验证这三种状态。
- [x] 2.4 打开原件后对话框铺满星图区域，左右分栏各自滚动，预览栏更宽；视口窄于 900px 时上下排，正文在上。用样式检查 `.nebula-windows`、`.nebula-frame` 和该断点存在。

## 3. 打开页时读取

- [x] 3.1 星图屏在选中页时与 `readPage` 并行调用 `listPageFiles`。换页或关闭时丢掉上一页的列表和选中项。列表失败只影响原件区。用现有星图屏的调用方式或视图传入的状态验证：失败时正文仍在，成功时预览用的是列表 id 而不是星图里的媒体类型字符串。
