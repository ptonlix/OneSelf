# Design

## Context

星图抽屉已经能读一页正文，并显示 `visibility`。公开与否只存在 frontmatter 里，权威写入是 `put_page`。`apps/server/src/app/structure.ts` 里的 `serializeFrontmatter` 会丢掉注释、重排键并改写标量，不能用来改这一行。

管理端不能引用 `packages/domain`。`Runtime.exclusive` 是队列，不是可重入锁；在一次 `exclusive` 里再调 `putPage()` 会死锁。结构写入已经在同一次 `exclusive` 里改 Markdown，然后直接调 `#writeOne`。

## Goals / Non-Goals

**Goals:**

- 所属人在页抽屉里两步确认后，只改这一页的 `visibility`。
- 写入仍走 `put_page` 的投影、版本、原件挂接和哈希冲突规则。
- 省略 `visibility` 仍视为 `private`；没变化时不追加版本。

**Non-Goals:**

- 不新增 PCP 操作，不改 Agent 的改可见性权限。
- 不提供正文编辑器，不按目录批量改。
- 不改星体颜色或资料列表。
- 不把已打进站点包的副本收回来。

## Decisions

1. **所属人路由，不让浏览器改 YAML。** `POST /admin/pages/{source}/{slug}/visibility`，JSON `{ "visibility": "public" | "private" }`。只认所属人会话，写请求核对 `Origin`。API Key 和设备码得到 `forbidden`。缺字段或其他值得到 `invalid`。这不是注册表操作，所以不进 MCP 和 OpenAPI。

   备选是管理端 `get_page` 后自己 `put_page`。那样会在管理端复制一份 frontmatter 解析器，也会在两次请求之间被 Agent 覆盖。

2. **纯函数只动 frontmatter 块。** `setPageVisibility(markdown, next)` 放在 `packages/domain`。用现有 `splitFrontmatter` 限定范围。已有顶层 `visibility:` 就替换该行的值；没有就在结束 `---` 前插入一行。正文按原字节接回去。注释、其他键、换行风格不动。改完必须还能被 `projectMarkdown` 接受。

   不复用 `serializeFrontmatter`。它不能保留注释，也不保证正文两侧的空白不变。

3. **同一次写入锁里读、改、写。** `setPageVisibility` 方法先 `#ownerActor`，再 `getPage`。目标可见性已经成立时返回当前哈希，不调用 `#writeOne`。否则把刚读到的 `hash` 传给 `#writeOne`，不要再包一层 `putPage()`。省略 `visibility` 且请求 `private` 也算已经成立，不插入空转的一行。

4. **确认文案放在抽屉，交互照搬删除。** 第一次点击只武装按钮。公开确认写明：这一页和挂接原件立刻匿名可读，站点包里的副本收不回，指针不动。私有确认写明：下一次公开读取不再返回这一页和这些原件，包里的副本还在。成功后重拉星图和这一页；失败只留在抽屉。

## Risks / Trade-offs

- [frontmatter 行替换碰到正文里的同名句子] → 只处理 `splitFrontmatter` 返回的块，并单测正文里含 `visibility: public` 时不变。
- [空转写入挤掉 50 条版本] → 已是目标值时不写。
- [公开立刻放出原件] → 不新写媒体规则，确认文案说明现有行为；冒烟断言改私有后匿名 `/media/{id}` 为 `not_found`。
- [管理端写请求被跨站伪造] → 与其他所属人写路由一样核对 `Origin`。

## Migration Plan

没有迁移。部署后旧页保持原样。回滚时去掉路由和按钮；已经改过的页仍是合法 Markdown，不必迁回。

## Open Questions

无。
