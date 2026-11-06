# Tasks

## 1. 只改可见性行

- [x] 1.1 在 `packages/domain` 增加 `setPageVisibility(markdown, visibility)`。只改 frontmatter 块：已有顶格 `visibility:` 则替换该行；没有则在结束 `---` 前插入。正文逐字节不变。省略且目标是 `private` 时返回 `null`。改完的文本必须能被 `projectMarkdown` 接受。用同包纯函数测试覆盖：省略后改公开、已是目标值、正文里的 `visibility: public`、注释和其他键、CRLF。
- [x] 1.2 导出该函数。确认 `packages/domain` 测试不启动 HTTP 或数据库。

## 2. 所属人写入

- [x] 2.1 `Runtime` 增加 `setPageVisibility(actor, source, slug, visibility)`。在一次 `exclusive` 里用 `#ownerActor` 鉴权，读当前页，调用 1.1 的函数。`null` 时返回当前哈希且不追加版本。否则把当前哈希传给 `#writeOne`，不要嵌套调用 `putPage()`。未改密返回 `password_change_required`。隐藏、已删除或不存在返回 `not_found`。
- [x] 2.2 在 `apps/server/src/owner/routes.ts` 注册 `POST /admin/pages/:source/:slug/visibility`。核对 `Origin`。JSON 只有 `public` 或 `private` 才进入 2.1，否则 `invalid`。成功返回 `{ source, slug, hash, visibility }`。
- [x] 2.3 用进程内冒烟验证：所属人把省略 `visibility` 的页改成公开后，匿名公开读返回该页，原文含 `visibility: public` 且正文不变；再改私有后，匿名页和挂接原件都是 `not_found`，所属人仍能读到页和原件。API Key 与设备码得到 `forbidden` 且原文不变。未改密得到 `password_change_required`。已是目标值时版本数不变。`/openapi.json` 与 MCP `tools/list` 不含 `visibility` 操作或 `/admin/pages`。

## 3. 星图抽屉

- [x] 3.1 `apps/admin` 的 HTTP 客户端增加这个 POST。不解析密钥字段。用 `http.test.ts` 锁住路径、方法和 Cookie。
- [x] 3.2 页抽屉在「公开 / 私有」旁加开关。第一次点击不发请求，确认文案按规格写明匿名读取和站点包副本。第二次才发送这一页的决定。目录抽屉不加开关。成功后重拉星图和正文；失败不清空星图。用视图测试断言第一次点击不调用客户端，且没有 Markdown 编辑器。

## 4. 门禁

- [x] 4.1 跑改过的 domain、admin 和冒烟测试，再跑 `pnpm run typecheck` 与 `pnpm run boundaries`。`page-visibility` 的每个场景都有对应断言后再勾选。不改 `packages/operations` 和产品 Skill。
