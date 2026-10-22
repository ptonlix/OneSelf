# 公开页

这份 reference 只写怎么定制公开宣传页。连接和凭据在入口 `SKILL.md`，不在这里。

定制唯一的个人公开宣传页。它只有 `/` 这一个线上入口，没有单独的简历地址。整理个人上下文不要用这份，改读 `references/context.md`。

发现文档给出 OpenAPI 和 MCP。两边操作名相同，按操作名调用，不要另造路径。

## 何时用

- 改公开宣传页的版式、排版和页面外壳。
- 在同一棵静态文件树里增加真实地址，例如一篇公开文章。
- 预览新版，并申请把它换上线。
- 确认内置页已经够用，这时不要上传。

不要用这份创建或修改资料页。公开内容来自已标为 `public` 的上下文，运行时读取。资料变了，下一次请求就能看到，不必重新激活。

## 先看这些

- 宣传页展示的是公开上下文，不是把简历抄进 HTML。会变的事实留在运行时的公开 PCP。写进 zip 的副本不会被改写或删除，也不能靠事后改成 `private` 收回。
- 不得写入密钥或私有页。不得把密钥或 private 页写进源码或构建产物。
- 页面脚本只能调用匿名公开接口和公开媒体地址。公开页面的请求使用 `credentials: omit`。不要携带 API Key、访问令牌或所属人的 Cookie。站点响应不 `Set-Cookie`。带上所属人会话会把私有上下文混进访客请求。
- 没有客户端路由。当前 release 里没有的路径返回 404，不回退到 `/`。
- 没有定制 release 时，指针是 `original`，页面来自随应用发布的内置页。内置页已经能展示下面的公开字段。只是换皮时，保留这个运行时读取，不要改成写死的简介。
- 定制需要 `site:write` 或所属人会话。没有就停下来，不要上传。
- 下一轮必须从原始源码 zip 开始。已上传或已激活的 dist 不能当作下一轮源码。`get_site` 下载的是镜像里的源码，不是线上正在用的构建结果。
- 上传不是激活。预览不移动指针。同意前不得声称已更换。

## 怎么定制

- [ ] 调用 `whoami`。没有 `site:write`、也不是所属人会话时，停下来说明缺权限。
- [ ] 用公开接口看现在有哪些公开页，确认宣传页有内容可展示。没有公开页时，内置页只显示空状态。要先公开资料，改读 `references/context.md`，不要把私有页抄进站点。
- [ ] 调用 `get_site`（`GET /pcp/v1/site/source`）下载 `original-page-source.zip`。只在这份源码上改版式。
- [ ] 构建一棵静态文件树。根目录有 `index.html`。`/` 读取这个文件。不要把源码 zip 本身上传。
- [ ] 核对构建产物：没有密钥，没有 private 页，没有保留路径，也没有 `..`、绝对路径或符号链接。
- [ ] 用 `put_site` 上传构建出的 zip。zip 最大 20 MiB、最多 200 个文件。上传后线上指针不动。
- [ ] 用 `preview_site` 打开预览。预览匿名可开。用浏览器而不带凭据看一遍版式和公开字段。
- [ ] 调用 `activate_site`。把批准地址交给所属人，然后停。同意前不得声称已更换。

## 原始页面能展示的公开字段

原始页面能展示的公开字段如下。没有公开页时只显示空状态。有公开页时：

- 每个公开的 `profile` 都显示，字段是 `name`、`title` 和正文。
- 公开的 `experience` 和 `education` 显示 `title`、可选的 `org`、`start`、`end`，以及正文。
- 其他公开 `type` 显示标题、type 和正文。

公开列表只含 `source`、`slug`、`type`、`title`。正文再从公开单页读取。公开单页返回 `source`、`slug`、`type`、`title`、`visibility`、`frontmatter`、`markdown`、`hash`，其中 `visibility` 一定是 `public`。

原始页面不调用 facts、timeline、tags 或 links。这些结构留在正文里。要改它们，改读 `references/context.md`，不要写进构建产物。

页面脚本只能调用：

- `GET /pcp/v1/public/sources`
- `GET /pcp/v1/public/pages`
- `GET /pcp/v1/public/pages/{source}/{slug}`
- `POST /pcp/v1/public/search`
- `GET /media/{id}`

所属页是 `public` 且未删除时，匿名可以读 `/media/{id}`。定制页要展示原件时，用这个地址，不要把图片字节打进 zip。

## 真实路径

要增加地址，就放进真实路径上的文件，例如 `blog/index.html` 对应 `/blog`。没有 `blog/index.html` 时，`/blog` 是 404。不要用客户端路由假装这些地址存在。新地址同样只读公开 PCP，不另做一套资料接口。

## 保留路径

不要覆盖保留路径。保留路径是 `pcp`、`oauth`、`.well-known`、`admin`、`skills`、`media`、`_preview`。上传包含这些保留路径、`..`、绝对路径或符号链接时，整包拒绝，不创建 release。这些路径属于协议、管理和媒体，不是宣传页。

## 容易调用错的参数

- `get_site` 没有参数。响应是 zip，文件名是 `original-page-source.zip`。
- `put_site`：HTTP 用 multipart 字段 `archive`；MCP 传 `archive_base64`。返回 `{id}`，形如 `rel_` 加上 32 个十六进制字符。这不是激活。
- `preview_site`：`{id}`。返回 `{url}`，预览地址是 `/_preview/{releaseId}/`。
- `activate_site`：`{release_id}`。目标只能是 `rel_...` 或 `original`。响应是 `{id, status:"pending", approval_url, expires_at}`，15 分钟有效，当下不移动指针。
- `list_sites` 只返回这一行指针和已有 release，不表示有多个站点。

## 批准

批准地址必须交给所属人。Agent 不能调用 `POST /admin/site-activations/{id}/approve`。拒绝、过期或一直没有决定时，线上路径保持不变。过期后要重新申请。回到旧 release 或 `original` 也要重新申请并等待所属人同意。没有删除 release 的接口。

交给所属人之后，只这样说：

```text
已提交上线申请，线上仍是当前版本。
请所属人打开这个批准地址核对并同意：
<approval_url>
同意前不得声称已更换。
```
