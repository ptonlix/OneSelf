# 资料写法

用这一份说明写入 Markdown 页。`GET /skills/data.md` 与 `GET /pcp/v1/skills/data` 是同一份字节。

一页由 `source` 和 `slug` 标识。`source` 匹配 `^[a-z][a-z0-9-]{0,62}$`。`slug` 匹配 `^[a-z0-9][a-z0-9-]{0,79}$`，且不含 `/`。不预置名为 `public`、`private` 或 `agents` 的目录。公开与否只看这一页的 `visibility`。

`put_page` 整页替换 Markdown。带了当前哈希就必须一致，否则返回 `conflict` 且原文不变；不带哈希则覆盖。`put_pages` 在一个事务里写多页，任一页不合法则全部不写。`edit_page` 必须带当前哈希；每一段查找都必须在当前原文里恰好出现一次，否则返回 `invalid` 且不写对象。

## frontmatter

`type` 和 `title` 放在 frontmatter，两者必填。`title` 只认 frontmatter，不认一级标题。`type` 与 `source` 使用同一模式。不固定的键也放在 frontmatter。

`visibility` 只有 `public` 和 `private`。frontmatter 省略 `visibility` 时保存为 `private`。其他值拒绝写入，不会被改成二者之一。已有页从 `private` 改成 `public`，或从 `public` 改回 `private`，都需要改可见性权限；只有写权限不够。新页直接写成 `public` 同样需要改可见性权限。

标签只放 frontmatter 的 `tags` 字符串数组。

```markdown
---
type: profile
title: 工程师
name: 张三
visibility: private
tags: []
files: []
---

围栏外的句子只是正文。
```

## 两种 fence

只认两种 fence：`## Facts` 和 `## Timeline`。不要发明新的围栏。围栏解析失败时，整次写入回滚，不留下半页投影。

一项资料自己的字段放在 frontmatter。只有需要有效期或置信度的陈述，才写入 `## Facts`。

事实条目必填 `id`、`entity`、`statement`。可选的 `confidence` 是 0 到 1 的数。可选的 `valid_until` 是 `YYYY-MM-DD`。时间线每行是 `date | title | detail`，也就是日期、标题、补充；补充可空。

```markdown
## Facts

- id: fact_01
  entity: 张三
  statement: 现居上海
  confidence: 0.9
  valid_until: 2027-01-01

## Timeline

- 2024-06-01 | 加入某公司 | 做后端
```

`remember`、`forget`、`add_timeline_entry`、`add_tag`、`remove_tag`、`add_link`、`remove_link` 先改 Markdown 或 frontmatter，再走和 `put_page` 相同的写入。它们不单独改表。`remember` 和 `forget` 必须写明目标页的 `source` 和 `slug`，因为事实 `id` 不是全局的。

## files

原件用 `file_upload` 只保存字节，返回 `id` 和本站 `/media/{id}`，此时不绑定页面。frontmatter 用 `files` 数组声明引用，例如 `files: [id]`。`put_page` 成功提交后才把这些 id 挂到这一页。某个 id 已经属于另一页时，整页写入失败，文件仍留在原来的页。从 `files` 去掉的 id 解除挂接；字节还在，但是私有的。

原件只接受 JPEG、PNG、WebP、GIF 和 PDF，单文件最大 20 MiB。所属页是 `public` 且未删除时，匿名可以读 `/media/{id}`。没有所属页、页已删除或页是 `private` 时，匿名结果与不存在相同。

## 链接

链接只写 `[[source/slug]]`。链接没有类型。删除一个目录时，其他页里的 `[[source/slug]]` 保持原样，不改写。
