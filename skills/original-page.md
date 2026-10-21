# 原始页面

用这一份说明查看或定制唯一的公开落地页。`GET /skills/original-page.md` 与 `GET /pcp/v1/skills/original-page` 是同一份字节。

落地页只有 `/`，没有单独的简历地址，也没有客户端路由。当前 release 里没有的路径返回 404，不回退到 `/`。没有定制 release 时，指针是 `original`，页面来自随应用发布的内置页。

## 原始页面能展示的公开字段

原始页面能展示的公开字段如下。没有公开页时只显示空状态。有公开页时：

- 每个公开的 `profile` 都显示，字段是 `name`、`title` 和正文。
- 公开的 `experience` 和 `education` 显示 `title`、可选的 `org`、`start`、`end`，以及正文。
- 其他公开 `type` 显示标题、type 和正文。

公开列表只含 `source`、`slug`、`type`、`title`。正文再从公开单页读取。公开单页返回 `source`、`slug`、`type`、`title`、`visibility`、`frontmatter`、`markdown`、`hash`，其中 `visibility` 一定是 `public`。

原始页面不调用 facts、timeline、tags 或 links。这些结构留在正文里。

公开资料改变后，下一次请求就能看到，不必重新激活。把一页改成 `private` 后，之后的匿名读取看不到这一页，也看不到它的媒体。已经打进 zip 的副本不会被改写或删除。

页面脚本只能调用匿名公开接口和公开媒体地址：

- `GET /pcp/v1/public/sources`
- `GET /pcp/v1/public/pages`
- `GET /pcp/v1/public/pages/{source}/{slug}`
- `POST /pcp/v1/public/search`
- `GET /media/{id}`

公开页面的请求使用 `credentials: omit`。不要携带 API Key、访问令牌或主人的 Cookie。站点响应不 `Set-Cookie`。

## 从原始源码 zip 构建

定制需要 `site:write` 或主人会话。调用 `get_site`（`GET /pcp/v1/site/source`）下载镜像内的原始页面源码 zip，文件名是 `original-page-source.zip`。这不是已上传的 dist。

在这份源码上修改。会变的事实在运行时向公开 PCP 读取，不写进构建产物。构建结果是一棵静态文件树：根目录有 `index.html`，未知路径保持 404，不把任意路径回退到 `/`。

用 `put_site`（`POST /pcp/v1/site/releases`）上传这个 zip。zip 最大 20 MiB、最多 200 个文件。上传不是激活，线上指针不动。

## 真实路径

要增加地址，就放进真实路径上的文件，例如 `blog/index.html` 对应 `/blog`。`/` 读取 `index.html`。没有 `blog/index.html` 时，`/blog` 是 404。

## 保留路径

不要覆盖保留路径。保留路径是 `pcp`、`oauth`、`.well-known`、`admin`、`skills`、`media`、`_preview`。上传包含这些保留路径、`..`、绝对路径或符号链接时，整包拒绝，不创建 release。

## 批准

`preview_site` 的预览地址是 `/_preview/{releaseId}/`。release id 是 `rel_` 加上 32 个十六进制字符。预览匿名可开，不移动指针。

预览之后调用 `activate_site`（`POST /pcp/v1/site/activate`）。目标只能是 `rel_...` 或 `original`。响应当下不移动指针。批准地址必须交给主人。Agent 不能调用 `POST /admin/site-activations/{id}/approve`。同意前不得声称已更换。拒绝、过期或一直没有决定时，线上路径保持不变。回到旧 release 或 `original` 也要重新申请并等待主人同意。没有删除 release 的接口。

## 下一轮

下一轮必须从原始源码 zip 开始。已上传或已激活的 dist 不能当作下一轮源码。

不得写入密钥或私有页。不得把密钥或 private 页写进源码或构建产物。
