---
name: context-management
description: 管理 OneSelf 的个人上下文。用户给出简历、经历、笔记、对话、照片或证件时，先查已有页，把文字写成 Markdown，把图片和 PDF 作为原件上传并挂接，再按授权读取、写入、修改、删除或恢复。定制公开宣传页、上传站点或申请上线时不要用，改读 public-page。
compatibility: OneSelf PCP。文件与 get_skill 的名字是 context-management，经 /skills/context-management.md 整份下发。开头 YAML 是 Skill 元数据，不是页面 frontmatter。
metadata:
  author: oneself
  version: "2"
---

# context-management

上面的 YAML 只描述这份 Skill。不要把它写进页面。

维护一份默认私有的个人上下文：文字是 Markdown 页，图片和 PDF 是原件。定制公开宣传页不要用这份，改读 `/skills/public-page.md`。`GET /skills/context-management.md` 与 `GET /pcp/v1/skills/context-management` 是同一份字节。

发现文档给出 OpenAPI 和 MCP。两边操作名相同，按操作名调用，不要另造路径。参数以工具 schema 或 OpenAPI 为准；下面只写容易调用错的部分。

## 连接配置

凭据和站点地址不要写进这份 Skill，也不要写进 Skill 安装目录。`npx skills update` 会覆盖那个目录。统一读写用户配置目录里的这一个文件：

- 设置了 `XDG_CONFIG_HOME` 时：`$XDG_CONFIG_HOME/oneself/config.json`
- 否则：`~/.config/oneself/config.json`
- Windows：`%APPDATA%\oneself\config.json`

文件不存在就创建，权限设为仅当前用户可读。不要提交到仓库。

```json
{
  "origin": "https://oneself.example",
  "auth": "api_key",
  "api_key": "osk_..."
}
```

`auth` 只能是 `api_key` 或 `oauth`。用设备码时不写 `api_key`，改为 `refresh_token`。不要写所属人密码，不要只存 15 分钟的 access token，也不要存批准地址或设备码。

调用前按这个顺序取 origin：`ONESELF_ORIGIN`、配置文件、本 Skill 的 `metadata.oneself_origin`。都没有就问一次，并写入配置文件。配置文件还没有 origin、而 Skill 里有 `oneself_origin` 时，先抄进去。API Key 优先读 `ONESELF_API_KEY`，没有再读配置文件。设备码换到 refresh token 后立刻写入配置文件。下次先用这份配置，不要重新问所属人要已经发过的 `osk_`。

## 何时用

- 把简历、经历、笔记、对话、照片或证件整理进这份上下文。
- 查找、修改、删除或恢复已有的页和原件。

不要用这份上传站点、预览或申请上线，也不要创建或作废密钥。

## 先看这些

- 一页由 `source` 和 `slug` 标识。`source` 匹配 `^[a-z][a-z0-9-]{0,62}$`。`slug` 匹配 `^[a-z0-9][a-z0-9-]{0,79}$`，且不含 `/`。不预置名为 `public`、`private` 或 `agents` 的目录。公开与否只看这一页的 `visibility`。
- 没有可写目录时停下来问所属人。不要调用 `sources_add`，除非这次凭据是所属人会话，或带全部数据权限的 API Key。软删除期内的同名会 `conflict`，不要改个近名再造。
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
- [ ] 图片和 PDF 不进正文。HTTP 用 `file_upload` 的 multipart 字段 `file`；MCP 传 `data_base64` 和 `media_type`。只接受 JPEG、PNG、WebP、GIF 和 PDF，单文件最大 20 MiB。
- [ ] 新页用 `put_page`，正文是完整 Markdown。已有页的小改用 `edit_page`。多页一起写用 `put_pages`，任一页不合法则全部不写。
- [ ] 原件返回 `id` 和 `/media/{id}` 后，把 id 放进 frontmatter 的 `files`，再写入该页。上传成功还不等于挂上，更不等于公开。
- [ ] 用返回的哈希再 `get_page` 核对。失败时不要改成不带哈希的覆盖，除非你就是要用当前正文替换刚写过的内容。

`remember`、`forget`、`add_timeline_entry`、`add_tag`、`remove_tag`、`add_link`、`remove_link` 会回写 Markdown 或 frontmatter，再走和 `put_page` 相同的写入。它们不单独改表。能用这些操作完成的小改，就不要整页覆盖。

## 容易调用错的参数

- `put_page`：`{source, slug, markdown, hash?}`。新页不带 `hash`。
- `edit_page`：`{source, slug, hash, edits:[{search, replace}]}`。`hash` 必填。
- `remember`：`{source, slug, entity, statement, confidence?, valid_until?, id?}`。
- `forget`：`{source, slug, id}`。这是从该页的 `## Facts` 去掉这一条。
- `add_timeline_entry`：`{source, slug, date, title, detail?}`。`date` 用 `YYYY-MM-DD`。
- `add_link` / `remove_link`：`{from:{source, slug}, to:{source, slug}}`。页里仍然只写 `[[source/slug]]`。
- `delete_page` / `restore_page`：`{source, slug}`。
- `revert_version`：`{source, slug, hash}`。`hash` 来自 `get_versions`，每页最多 50 条历史。

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
