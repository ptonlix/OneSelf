# 上下文

这份 reference 只写怎么管理个人上下文。连接和凭据在入口 `SKILL.md`，不在这里。定制公开宣传页不要用这份，改读 `references/public-page.md`。

公开请求使用 `credentials: omit`。不得写入密钥或私有页。不得把密钥或 private 页写进源码或构建产物。

操作的方法、路径、参数、请求头和上传限制以入口 `SKILL.md` 要求先读的发现文档 `/.well-known/pcp` 为准：参数看它指向的 OpenAPI 或 MCP 工具的输入 schema，上传看它的 `uploads`。这里只写流程和容易出错的语义。按操作名调用，不要另造路径。

## 何时用

- 把简历、经历、笔记、对话、照片或证件整理进这份上下文。
- 查找、修改、删除或恢复已有的页和原件。

不要用这份上传站点、预览或申请上线，也不要创建或作废密钥。

## 先看这些

- 一页由 `source` 和 `slug` 标识，格式以参数 schema 为准；`slug` 不含 `/`。不预置名为 `public`、`private` 或 `agents` 的目录。公开与否只看这一页的 `visibility`。
- 没有可写目录时停下来问所属人。不要调用 `sources_add`，除非这次凭据是所属人会话，或带全部数据权限的 API Key / 设备码授权。软删除期内的同名会 `conflict`，不要改个近名再造。
- 没有人要求公开时保持 `private`。frontmatter 省略 `visibility` 时保存为 `private`。其他值会被拒绝，不会被改成二者之一。改可见性，或把新页直接写成 `public`，都要有该 source 的改可见性权限。只有写权限不够。
- `title` 只认 frontmatter，不认一级标题。`type` 是标签，不是新表。不要为一种新资料建表或发明围栏。
- 图片和 PDF 是原件，不写进 Markdown，也不要描述成「已经上传」。先 `file_upload`，再挂到页上。
- 小改用 `edit_page`，并带当前哈希。不带哈希的 `put_page` 会覆盖整页。新页不要带哈希。哈希不一致返回 `conflict`，原文不变。
- `edit_page` 的每一段 `search` 必须在当前原文里恰好出现一次，按顺序替换。否则返回 `invalid`，并且不写。
- 删除用 `delete_page`，不要把正文改成空页冒充删除。它是软删除，30 天内可以 `restore_page`。写错内容用 `get_versions` 和 `revert_version`，回退是一次新写入。
- 事实 `id` 不是全局的。`remember` 和 `forget` 必须带目标页的 `source` 和 `slug`。
- 读不到某页时，结果与不存在相同。不要用 401 或 403 判断它是私有的还是没有这页。

## 收到资料后

- [ ] 调用 `whoami` 和 `sources_list`。确认能写哪个目录，以及该目录有没有改可见性权限。
- [ ] 用 `search`、`list_pages` 或 `recall` 找已有页。`search` 只返回标题和最多 140 字片段，不返回全文。要改内容先 `get_page`，用返回的当前哈希。
- [ ] 一段可以单独引用的资料做成一页。稳定字段放进 frontmatter，叙述放进正文，带日期的事件放进 `## Timeline`，会过期或不确定的陈述放进 `## Facts`。
- [ ] 图片和 PDF 不进正文，用 `file_upload` 上传。字段名、允许的类型和单文件大小上限看发现文档 `uploads.file_upload`；超出的不要硬传，先告诉所属人。
- [ ] 新页用 `put_page`，正文是完整 Markdown。已有页的小改用 `edit_page`。多页一起写用 `put_pages`，任一页不合法则全部不写。
- [ ] 原件返回 `id` 和 `/media/{id}` 后，把 id 放进 frontmatter 的 `files`，再写入该页。上传成功还不等于挂上，更不等于公开。
- [ ] 用返回的哈希再 `get_page` 核对。失败时不要改成不带哈希的覆盖，除非你就是要用当前正文替换刚写过的内容。

`remember`、`forget`、`add_timeline_entry`、`add_tag`、`remove_tag`、`add_link`、`remove_link` 会回写 Markdown 或 frontmatter，再走和 `put_page` 相同的写入。它们不单独改表。能用这些操作完成的小改，就不要整页覆盖。

## 参数的语义

参数名和类型看 OpenAPI 或 MCP 输入 schema。schema 看不出的含义在这里：

- `put_page`：新页不带 `hash`；带上当前哈希才是安全覆盖。
- `edit_page`：`hash` 必填，是当前哈希。
- `forget`：从该页的 `## Facts` 去掉这一条。
- `add_timeline_entry`：`date` 用 `YYYY-MM-DD`。
- `add_link` / `remove_link`：页里仍然只写 `[[source/slug]]`。
- `revert_version`：`hash` 来自 `get_versions`，每页最多 50 条历史。

`query` 没有匿名投影，只在已授权的上下文里按 source、type、tag 或时间过滤。不要用它代替公开站点的读取。

## frontmatter

`type` 和 `title` 放在 frontmatter，两者必填。`type` 与 `source` 使用同一模式。不固定的键也放在 frontmatter。

`visibility` 只有 `public` 和 `private`。

标签只放 frontmatter 的 `tags` 字符串数组。也可以用 `add_tag` 和 `remove_tag` 改这一页。

```markdown
---
type: profile
title: 工程师
name: 张三
visibility: private
tags: []
files: []
---

围栏外的句子只是正文。相关页写成 [[work/acme]]。
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

## files

原件用 `file_upload` 只保存字节，返回 `id` 和本站 `/media/{id}`，此时不绑定页面。frontmatter 用 `files` 数组声明引用，例如 `files: [id]`。`put_page` 成功提交后才把这些 id 挂到这一页。某个 id 已经属于另一页时，整页写入失败，文件仍留在原来的页。从 `files` 去掉的 id 解除挂接；字节还在，但是私有的。

所属页是 `public` 且未删除时，匿名可以读 `/media/{id}`。没有所属页、页已删除或页是 `private` 时，匿名结果与不存在相同。`file_url` 只返回本站地址，不返回存储桶地址，也不在这个操作里吐字节。

## 链接

链接只写 `[[source/slug]]`。链接没有类型。删除一个目录时，其他页里的 `[[source/slug]]` 保持原样，不改写。删目录不是删一页的办法：它会让该目录下的页立刻不可读，而且只有所属人会话可以做。
