# 公开页

这份 reference 只写怎么生成和上线个人展示页。连接和凭据在入口 `SKILL.md`，不在这里。

站点只有一个个人展示页。它只有 `/` 这一个线上入口，没有单独的简历地址。整理个人上下文不要用这份，改读 `references/context.md`。

站点工具的方法、路径、参数和上传限制，以及匿名公开接口的清单，以入口 `SKILL.md` 要求先读的发现文档 `/.well-known/pcp` 为准：公开接口看 `public`，站点包看 `uploads.put_site`，参数看它指向的 OpenAPI。这里只写流程。按操作名调用，不要另造路径。

## 何时用

- 为所属人生成或改版个人展示页：按公开资料决定版式、排版和页面外壳。
- 在同一棵静态文件树里增加真实地址，例如一篇公开文章。
- 预览新版，并申请把它换上线。

不要用这份创建或修改资料页。展示页上的内容来自已标为 `public` 的上下文，运行时读取。资料变了，下一次请求就能看到，不必重新激活。

## 先看这些

- 展示页展示的是公开上下文，不是把简历抄进 HTML。会变的事实留在运行时的公开 PCP。写进 zip 的副本不会被改写或删除，也不能靠事后改成 `private` 收回。
- 不得写入密钥或私有页。不得把密钥或 private 页写进源码或构建产物。
- 页面脚本只能调用发现文档 `public` 里列出的匿名公开接口和公开媒体地址。公开页面的请求使用 `credentials: omit`。不要携带 API Key、访问令牌或所属人的 Cookie。站点响应不 `Set-Cookie`。带上所属人会话会把私有上下文混进访客请求。
- 没有客户端路由。当前 release 里没有的路径返回 404，不回退到 `/`。
- 没有定制 release 时，指针是 `public-page`，`/` 是随应用发布的内置首页。它只介绍 OneSelf，不读取、不展示任何资料。所属人想在 `/` 展示自己，就要按这份 reference 生成展示页并由所属人批准上线。
- 定制需要 `site:write` 或所属人会话。没有就停下来，不要上传。
- 下一轮必须从原始源码 zip 开始。已上传或已激活的 dist 不能当作下一轮源码。`get_site` 下载的是镜像里的源码，不是线上正在用的构建结果。
- 上传不是激活。预览不移动指针。同意前不得声称已更换。

## 怎么定制

- [ ] 调用 `whoami`。没有 `site:write`、也不是所属人会话时，停下来说明缺权限。
- [ ] 用公开接口看现在有哪些公开页，确认展示页有内容可展示。没有公开页时，先和所属人确认要公开哪些资料，改读 `references/context.md`，不要把私有页抄进站点。
- [ ] 调用 `get_site` 下载 `public-page-source.zip`。它是内置首页的源码，可以当作构建脚手架；页面内容按公开资料重写。
- [ ] 构建一棵静态文件树。根目录有 `index.html`。`/` 读取这个文件。资源一律用相对路径（Vite 设 `base: "./"`，产物里是 `./assets/…`），否则 `/_preview/{id}/` 下会去线上路径加载文件。不要把源码 zip 本身上传。
- [ ] 核对构建产物：没有密钥，没有 private 页，没有保留路径，也没有 `..`、绝对路径或符号链接；没有对 `@oneself/public-client` 的裸 import，也没有外部脚本地址。
- [ ] 用 `put_site` 上传构建出的 zip。大小和文件数上限看发现文档 `uploads.put_site`，超出就精简产物，不要拆成多个 release。上传后线上指针不动。
- [ ] 用 `preview_site` 打开 `/_preview/{id}/` 预览。预览匿名可开。用浏览器而不带凭据看一遍版式和公开内容。
- [ ] 调用 `activate_site`。把批准地址交给所属人，由所属人在 `/admin` 批准，然后停。同意前不得声称已更换。

## 内置页只是介绍

内置页（指针为 `public-page` 时的 `/`）是固定的 OneSelf 首页，不读取、不展示任何资料，有没有公开页看起来都一样。个人展示页由 Agent 按公开资料生成，经所属人批准才上线。

流程和约束只有这些：

- 哪些数据是公开的：frontmatter 为 `visibility: public` 且未删除的页，以及这些页引用的原件。其他内容匿名都读不到；改回 `private` 后下一次匿名读取就看不到。
- 用哪些站点工具：`get_site` 取源码，`put_site` 上传构建产物，`preview_site` 拿预览地址，`activate_site` 申请上线，`list_sites` 查看当前指针和已有 release。
- 先在 `/_preview/{id}/` 预览，再由所属人在 `/admin` 批准。批准前线上不变。

本 Skill 不规定任何视觉规范：不提供设计 token、品牌样式表、配色、字体要求或 `data-*` 钩子。内置首页和管理端的品牌样式只属于它们自己。展示页的样式和版式由所属人与 Agent 按资料自定。

公开列表只含 `source`、`slug`、`type`、`title`。正文再从公开单页读取。公开单页返回 `source`、`slug`、`type`、`title`、`visibility`、`frontmatter`、`markdown`、`hash`，其中 `visibility` 一定是 `public`。

公开接口不提供 facts、timeline、tags 或 links。这些结构留在正文里。要改它们，改读 `references/context.md`，不要写进构建产物。

页面脚本只能调用发现文档 `public.endpoints` 列出的接口：公开目录、公开页列表、公开单页、公开检索和公开媒体 `media`。参数看 OpenAPI 里同名的操作。

所属页是 `public` 且未删除时，匿名可以读公开媒体。展示页要展示原件时，用这个地址，不要把图片字节打进 zip。这些接口地址以 `/` 开头，线上和 `/_preview/{id}/` 下指向同一个接口。

## 读取公开资料

契约是发现文档 `public` 列出的公开 HTTP 接口，不是某个包。

- 可以用 `@oneself/public-client`，它是这些接口的类型化封装。但它是未发布的 `private` 包：npm 上没有，服务器不提供它的文件，`get_site` 的源码 zip 和 Skill 包里也没有它；release 只是上传的静态文件，服务器不会安装依赖，也不解析裸模块名。所以必须在构建时把它打进产物。
- 手里有 OneSelf 仓库时，把 `packages/public-client/src/client.ts`（单文件、无依赖）复制进站点源码，例如 `src/vendor/public-client.ts`，由打包器打进 JS。在仓库里做站点时也可以用 workspace 依赖，结果同样打进产物。
- 不能在运行时安装它，也不能从任何 CDN 引入它。
- 拿不到仓库时，直接用 `fetch` 调这些接口，带 `credentials: "omit"`，不带任何凭据头，效果相同。
- 上传前核对产物里没有对 `@oneself/public-client` 的裸 import。

## 真实路径

要增加地址，就放进真实路径上的文件，例如 `blog/index.html` 对应 `/blog`。没有 `blog/index.html` 时，`/blog` 是 404。不要用客户端路由假装这些地址存在。新地址同样只读公开 PCP，不另做一套资料接口。

## 保留路径

不要覆盖保留路径。保留路径是 `pcp`、`oauth`、`.well-known`、`admin`、`skills`、`media`、`_preview`。上传包含这些保留路径、`..`、绝对路径或符号链接时，整包拒绝，不创建 release。这些路径属于协议、管理和媒体，不是展示页。

## 结果的语义

参数看 OpenAPI 或 MCP 输入 schema，上传字段看 `uploads.put_site`。schema 看不出的含义在这里：

- `get_site` 的响应是 zip，文件名是 `public-page-source.zip`。
- `put_site` 返回 `{id}`，形如 `rel_` 加上 32 个十六进制字符。这不是激活。
- `preview_site` 返回 `{url}`，预览地址是 `/_preview/{releaseId}/`。
- `activate_site` 的目标只能是 `rel_...` 或 `public-page`。响应是 `{id, status:"pending", approval_url, expires_at}`，15 分钟有效，当下不移动指针。
- `list_sites` 只返回这一行指针和已有 release，不表示有多个站点。

## 批准

批准地址必须交给所属人。Agent 不能调用 `POST /admin/site-activations/{id}/approve`。拒绝、过期或一直没有决定时，线上路径保持不变。过期后要重新申请。回到旧 release 或 `public-page` 也要重新申请并等待所属人同意。没有删除 release 的接口。

交给所属人之后，只这样说：

```text
已提交上线申请，线上仍是当前版本。
请所属人打开这个批准地址核对并同意：
<approval_url>
同意前不得声称已更换。
```
