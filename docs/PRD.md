# OneSelf PRD

状态：可实施 v0.14  
日期：2026-10-20

OneSelf 是一个开源的个人上下文仓。人把自己的资料放进来，用公开站点展示落地页和简历，用 PCP 把同一份资料按授权分发给自己的脚本和别人的 Agent。

路径、事务和部署只写在 `docs/ARCHITECTURE.md`。两边的操作名、权限、错误码和可见性规则必须一致。冲突时先改文档再写代码。

---

## 1. 问题

个人资料散在简历、笔记、证件原件和各个 Agent 的对话里。每接一个 Agent，就要重新粘贴一份背景，而且分不清哪些能公开、哪些只能给这个 Agent。

现成做法对不上这个需求：

- 为每一种资料各建一张业务表，新型资料就要改库。
- 让 Agent 运行时自己建表，schema 会失控，也没法从文件恢复。
- 落地页和资料写在一起，改版式会改掉事实，改事实又要重新发页面。

OneSelf 把三件事拆开：资料怎么存、页面怎么发布、Agent 怎么调用。

## 2. 目标

1. 一个人一份自托管的资料仓。公开站点展示已发布的落地页和简历。未公开的资料必须经过认证才能读。
2. 资料以 Markdown 为原文，Postgres 只做提前定义好的索引。不为某一种资料建业务表。Agent 不能建表。
3. 图片、PDF 等原件单独存放，由 Markdown 页引用。Agent 可以读取原件，再把整理结果写回一页 Markdown。
4. 公开站点是一整份落地页。原始页面已经能展示公开资料。定制是在这份页面上改，上传后经人确认才激活。页面在浏览器里向公开 PCP 读取事实，服务端不把资料渲染进 HTML。
5. 资料和站点操作只有一套规则。OpenAPI 和 MCP 使用同名操作。API Key 的创建、列表和作废只走 HTTP，不进 MCP。认证支持 OAuth 2.1 设备码和请求头 API Key。

## 3. 非目标

第一版不做：

- 多租户、多站点、社交网络、支付、商品和订单。
- Agent 运行时 `CREATE TABLE`，或按资料类型自动迁移。
- 跨库联邦、代码符号图、观点投注、自动做梦一类的知识循环。
- 字段级投影语言，以及「只能读公开页」这种授权。公开与否用页上的 `visibility` 表达。
- 承诺对方不会把已读内容用于训练或再转发。协议只控制发出去的字节。
- 为财务、健康、通讯录等具体领域做专门产品。这些只是同一种页的不同 `type`。
- 本地目录存储、独立 MCP 进程、向量检索、邮箱找回密码、删除旧 release、链接类型。
- 与 GBrain 的参数兼容。同名只表示操作名相同。
- 在应用进程里安装穿透或申请证书。公网入口是部署时选的一个容器，不是第二套应用。

## 4. 用户

| 角色 | 做什么 |
|---|---|
| 主人 | 用初始账号登录管理端并立即改密，然后导入资料，确认哪些页公开，批准 Agent，生成 API Key，同意站点上线 |
| 访客 | 不登录，只看已激活的公开站点 |
| 自己的 Agent / 脚本 | 用 API Key 读写被允许的页和文件。不能自己创建 Key |
| 别人的 Agent | 走 OAuth 2.1 设备码，人在浏览器里批准后，用短期令牌调用同一组资料接口 |

Agent 不连接数据库、对象存储或密钥。它只调用 OneSelf 的 HTTP API 或 MCP。

## 5. 借鉴边界

从 GBrain 只借数据组织：

- Markdown 是原文，按内容哈希存在对象存储。Postgres 里的正文和结构化行都是投影。库坏了，对象还在的部分可以重建投影。
- 页的身份是 `(source, slug)`。`source` 只表示业务目录，例如 `health`、`finance`、`learning`。是否公开不写在 source 上。
- 要变成有列、可约束的行，必须写在事先定好的 fence 里，或由会回写这些 fence / frontmatter 的操作产生。提取程序只认这一份语法。
- 原件不塞进 Markdown。`files` 只记录存储键、类型和哈希，并最多挂到一页。

从 MercLink 只借发布指针和「应用自己吐字节」，不借它的服务端渲染，也不借商品、订单和支付：

- 上传得到一份不可变 release。预览不改变线上。
- 人同意后只移动指针。回到旧版也只移动指针，并且要再同意一次。
- 公开站点是一份静态文件树，不是按落地页、简历页拆开的多个站点。
- 不在请求时用服务端模板填事实。

## 6. 数据组织

### 6.1 原文

一页是一个 Markdown 文件。权威字节在对象存储，键为 `pages/{source}/{slug}/{sha256}.md`。`pages` 表保存同一份正文供读取和检索。`get_page` 读投影。重建时以对象覆盖投影。

公开介绍可以写成：

```markdown
---
type: profile
name: 张三
title: 工程师
visibility: public
tags: [public-profile]
files: []
---

# 张三

做个人工具和开发者产品。
```

一段经历、一篇笔记、一份证件摘要也是同一张 `pages` 索引里的另一页，只是 `type` 和 frontmatter 不同。例如经历用 `type: experience`，笔记用 `type: note`。

- `type` 和 `title` 必填。`title` 只认 frontmatter，不认一级标题。
- `type` 和 `source` 匹配 `^[a-z][a-z0-9-]{0,62}$`。`source` 的主键就是这个名字。
- `slug` 匹配 `^[a-z0-9][a-z0-9-]{0,79}$`，不含 `/`。
- 不固定的键放在 frontmatter。索引用 JSONB 查询这些键。
- 不预置任何 source，也不预置名为 `public`、`private` 或 `agents` 的目录。只有主人会话，或带「全部数据权限」的 API Key，可以 `sources_add`。
- 只有主人会话可以 `sources_delete` 和 `sources_restore`。删除是软删除，保留 30 天。期内目录和因这次删除而隐藏的页都不可读，公开站不用重新激活。其他页里的 `[[source/slug]]` 不改写。已批准的权限不删，恢复后仍然有效。超过 30 天由每小时清理真删目录和其页投影；原件解除挂接，仍是私有的。之前已经单独软删除的页不因目录一起恢复。
- `visibility` 只有 `public` 和 `private`。缺省 `private`。其他值拒绝写入，不悄悄改掉。同一业务目录里可以既有公开页，也有私有页。
- 匿名公开 PCP 不看 source 名字，只返回 `visibility: public` 且未删除的页。
- 内容哈希是原文 UTF-8 的 SHA-256，十六进制。

### 6.2 固定 fence 和结构操作

围栏外的句子只是正文。第一版只认两种写法。解析失败则整次写入回滚。Agent 不能发明新围栏并指望系统建新表。一项资料自己的字段放在 frontmatter。只有需要有效期或置信度的陈述，才写入 `## Facts`。

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

`id`、`entity`、`statement` 必填。`confidence` 是 0 到 1 的小数，`valid_until` 是 `YYYY-MM-DD`，两者可省略。时间线每行是 `日期 | 标题 | 补充`，补充可空。

`remember`、`forget`、`add_timeline_entry`、`add_tag`、`remove_tag`、`add_link`、`remove_link` 都先改 Markdown 或 frontmatter，再走和 `put_page` 相同的写入。它们不单独改表。

- 标签只放 frontmatter 的 `tags` 字符串数组。
- 链接只认 `[[source/slug]]`。第一版没有链接类型。
- `forget` 从 `## Facts` 删除对应 `id` 的条目，然后整页重抽。历史留在旧版本的对象里。

### 6.3 提前定义的表

Agent 不能创建或修改这些表。新增有明确列的表必须改 schema、写 migration、发版本。

| 表 | 作用 |
|---|---|
| `sources` | 业务目录。主键是 source 名字 |
| `pages` | 投影。含 `source`、`slug`、`type`、`title`、`frontmatter`、正文、`content_hash`、对象键、`deleted_at` |
| `page_versions` | 每次成功写入追加的哈希和对象键。不含第二份正文。每页最多 50 条 |
| `files` | 原件的存储键、媒体类型、大小、哈希、所属页。字节不在这张表里。一页可有多个，一个文件最多属于一页 |
| `chunks` | 从正文切出的搜索块，可由 `pages` 重建 |
| `links` | 从 `[[source/slug]]` 抽出的边，没有类型 |
| `tags` | frontmatter `tags` 的投影 |
| `facts` | 只来自当前页的 `## Facts` |
| `timeline_entries` | 只来自当前页的 `## Timeline` |
| `site_releases` | 上传过的页面包，不可变 |
| `site_files` | 该 release 里每个路径对应的对象键 |
| `site_pointers` | 只有一行。没有定制时指向随应用发布的原始落地页 |
| `site_activations` | 上线申请。记下目标 release、状态和过期时间。同意前不改指针 |
| `owners` | 唯一主人。登录名、密码哈希、是否必须改密 |
| `api_keys` | 已生效密钥的哈希、标签、权限和作废时间。不存原文 |
| `api_key_requests` | 尚未生成密钥的批准请求、要求的权限和过期时间 |
| `oauth_grants` | OAuth 授权、刷新令牌哈希、作废时间 |

不按资料种类建业务表。简历、经历、笔记、证件摘要都是 `pages` 行。

软删除保留 30 天，期内可以 `restore_page`。之后同进程每小时删除过期页、它的版本和投影。没有任何指针的对象再保留 7 天后删除。第一版不删除 site release。

### 6.4 原件

图片和 PDF 进入对象存储。开发和生产都使用 S3 兼容的 RustFS，没有本地目录模式。应用只通过文件端口访问，调用方拿不到磁盘路径或存储桶地址。

上传只保存字节并返回 `id` 和本站媒体地址，不绑定页面。页面 frontmatter 用 `files: [id]` 声明引用。`put_page` 成功时才把这些 id 的 `page` 设为这一页；若某个 id 已属于另一页，整次写入失败。从 frontmatter 去掉的 id 解除挂接，文件仍保留，但是私有的。

`file_url` 返回 `{origin}/media/{id}`。`GET /media/{id}` 由应用吐字节。所属页是 `public` 且未删除时，匿名可读。没有所属页、页已删除或页是 `private` 时，只有能读该 source 的凭据可读，其他人得到与不存在相同的结果。

原件只接受 JPEG、PNG、WebP、GIF 和 PDF，单文件最大 20 MiB。

## 7. PCP

PCP（Personal Context Protocol）是上述资料和站点的一组操作。除本节标明只走 HTTP 的密钥管理外，OpenAPI 与 MCP 的操作名、参数、错误和权限必须相同。

错误体只有 `{error, message}`。`error` 取 `not_found`、`unauthorized`、`forbidden`、`conflict`、`invalid`、`payload_too_large`、`password_change_required`。

看不到某 source 时，该 source 下的页和文件都返回 `not_found`，匿名和已登录但不具备读取权一样。不要用 401 或 403 区分「没有这页」和「这页是私有的」。401 只用于没有凭据却调用了写入、非公开检索、上线申请或管理路由。403 只用于凭据有效，但操作本身不允许，例如 Agent 调用批准或密钥管理。

### 7.1 操作

名字能对上 GBrain 的，沿用原名。参数不求兼容。

页与原文：

| 操作 | 作用 |
|---|---|
| `put_page` | 整页写入 Markdown。带了哈希就必须与当前原文一致，不带则覆盖。新页直接写成 `public` 需要改可见性权限 |
| `edit_page` | 必须带当前哈希。正文是若干次「全文里恰好出现一次」的查找替换，按顺序应用。哈希不符返回 `conflict` |
| `put_pages` | 一次写多页，一个事务。任一页失败则全部不写 |
| `get_page` | 按 `source` 和 `slug` 读一页。已软删除的页对普通读取不可见 |
| `list_pages` | 按 source、type、slug 前缀列出未删除的页 |
| `delete_page` | 软删除 |
| `restore_page` | 30 天内恢复 |
| `get_versions` | 读一页最多 50 条历史哈希 |
| `revert_version` | 把一页的内容恢复成某个仍保留的版本。这是一次新的写入 |
| `resolve_slugs` | 批量回答调用方是否读得到这些页。读不到时 `exists: false`，不另给错误 |

文件：

| 操作 | 作用 |
|---|---|
| `file_upload` | 保存原件，返回 id 和本站 `/media/{id}` |
| `file_list` | 列出某页的原件，或主人列出尚未挂接的原件 |
| `file_url` | 返回原件的本站读取地址，不返回存储桶地址，也不在这个操作里直接吐字节 |

检索：

| 操作 | 作用 |
|---|---|
| `search` | 在调用方读得到的页里，按标题、正文和 frontmatter 字符串检索。返回标题和最多 140 字片段，不返回全文。默认 20 条，最多 50 条 |
| `query` | 按 source、type、tag 和时间过滤，没有匿名投影。默认 20 条，最多 50 条 |

公开 `search` 先限定 `visibility: public`，私有页不影响命中和计数。

结构操作回写原文，见 6.2。`recall` 只读取当前 `facts` 投影，按实体或陈述检索，不创建新表。

目录、身份和 Skill：

| 操作 | 作用 |
|---|---|
| `sources_list` | 列出调用方能读的业务目录 |
| `sources_add` | 增加目录。只给主人会话，或带全部数据权限的 API Key。名字仍在软删除期内则拒绝，不新建 |
| `sources_delete` | 主人会话软删除一个目录。其中的页立即不可读。不删权限，也不改其他页的 Markdown |
| `sources_restore` | 主人会话在 30 天内恢复该目录，以及因这次删除而隐藏的页 |
| `sources_status` | 查一个未删除目录的未删除页数和最近写入 |
| `whoami` | 返回凭据种类、每个 source 的读/写/改可见性，以及是否有 `site:write` |
| `list_skills` / `get_skill` | 读两份 Skill。匿名的 `/skills/*.md` 是同一份字节 |

站点只有一份。GBrain 没有这一组：

| 操作 | 作用 |
|---|---|
| `list_sites` | 返回这一行指针和已有 release，不表示有多个站点 |
| `get_site` | 下载镜像里带的原始页面源码 zip，不是已激活的 dist |
| `put_site` | 上传一份未激活的静态 zip |
| `preview_site` | 返回这份 release 的预览路径。预览不移动指针 |
| `activate_site` | 申请把指针移到某份 release，或移回内置原始页面。本次不移动指针，只返回批准地址 |

没有单独的回滚操作。回到旧版是再调用一次 `activate_site`。

API Key 管理只出现在 HTTP，不注册成 MCP 工具：

| 操作 | 作用 |
|---|---|
| `create_api_key` | 主人会话发起一把密钥。只返回批准地址，不返回密钥 |
| `list_api_keys` | 列出标签、权限、创建时间、最近使用和作废时间，不含原文 |
| `revoke_api_key` | 作废一把密钥，下一次请求即失败 |

已生效的密钥不能改权限，也不能再次查看原文。要改权限就作废后重新批准。

发现文档给出协议版本、操作清单、OpenAPI 地址、MCP 地址、OAuth 端点和 Skill 地址。

### 7.2 认证

进门之后只经过 `authorize(credential, operation, source)`。

每个 source 三档权限：读、写、改可见性。写不能把 `private` 改成 `public`，也不能改回去。新页省略 `visibility` 时按 `private` 写入，只需要写权限。全局另有一档 `site:write`：下载源码、上传、预览、申请上线。没有「只读公开页」。批准某 source 的读，就包含其中全部未删除的私有页，批准页必须写明这一点。

- 主人会话拥有全部资料权限、`site:write`、密钥管理和同意上线。
- API Key 保存批准页上的权限。可以勾选全部数据权限，以后新建的 source 也算在内；否则只包含当时勾选的 source。可以另勾 `site:write`。密钥不能同意上线，也不能管理密钥。
- OAuth 保存设备码页上勾选的 source 三档和可选的 `site:write`。不能管理密钥，也不能同意上线。
- slug 里的凭据前缀只是约定，系统不强制，也不因此分目录。

OAuth 2.1 只对生产启用设备码。授权码加 PKCE 只在测试配置开启，发现文档不公布它。不支持密码模式和 implicit。access token 15 分钟。refresh token 只存哈希，使用后轮换，旧的立即失效；旧令牌再次出现则整条授权作废。人可以单独撤销一条授权。验证地址是管理端的 `/admin/device`，必须先登录主人账号。

API Key 使用 `Authorization: ApiKey <key>` 或 `X-Api-Key`。原文以 `osk_` 开头，只在批准页出现一次，库存哈希。它不出现在设备码页，也不能由设备码换出。

创建密钥：

1. 已改密的主人会话调用创建接口，提交标签、source 权限或全部数据权限，以及是否授予 `site:write`。
2. 响应只有申请 id、`pending` 和批准地址，15 分钟有效。此时没有密钥。
3. 主人打开批准页，核对权限并确认。服务端这时生成原文。
4. 过期、重复确认或未登录，都不生成密钥。启动时不生成密钥。

忘记密码时，设置一次性环境变量 `OWNER_RESET_PASSWORD` 后重启：替换哈希并再次强制改密。用完必须删掉这个变量。没有邮箱重置。改密前只能登出和改密，其他管理操作和 PCP 返回 `password_change_required`。

### 7.3 写回

Agent 整理原件或对话后，通过 `put_page` 或 `edit_page` 写回一页 Markdown，不另开解析结果表。写到哪个业务目录，由这次授权允许的 source 决定。

激活是单独操作。上传不等于上线。持有 `site:write` 的凭据可以申请激活；指针要等主人打开批准地址并同意后才移动。主人在管理端自己点「激活」时，界面用同一次登录先申请再同意，仍然不让 Agent 调用同意接口。

## 8. 站点

安装后即可使用的是一份原始落地页。它是完整展示页，不拆成首页和简历页两个地址，也没有客户端路由。未知路径返回 404，不回退到落地页。

没有公开页时，原始页面只显示空状态。有公开页时：

- `profile`：`name`、`title` 和正文。多个公开 profile 都显示。
- `experience` 和 `education`：`title`、可选的 `org`、`start`、`end`，以及正文。
- 其他 `type`：标题、type 和正文。

公开列表只含 `source`、`slug`、`type`、`title`。展示正文时再读公开单页。原始页面不调用 facts、timeline、tags 或 links。这些结构在正文里；Agent 用 `recall` 和对应的读操作。

以后要加博客或其他路径，不需要新的站点类型。Agent 在同一次定制里往这份静态文件树增加真实文件，例如 `/blog/index.html`，再上传并申请激活。

宿主按指针提供静态文件，不在服务端渲染资料。没有定制 release 时，指针指向随应用发布的原始页面。资料变更后，下次打开就会看到新值，不必重新激活。

`get_site` 永远下载镜像内的原始页面源码 zip。已上传的 dist 不能当源码续改，下次定制仍从这份源码开始。`put_site` 上传的是根目录含 `index.html` 的 zip，最大 20 MiB、200 个文件。路径穿越、符号链接，以及 `pcp`、`oauth`、`.well-known`、`admin`、`skills`、`media`、`_preview` 这些保留路径，整包拒绝。

预览地址是 `/_preview/{releaseId}/`。release id 含 128 位随机数。预览匿名可开，因为页面只能再请求公开 PCP。

```text
访客浏览器
    │  打开 /
    ▼
宿主按指针返回 HTML / CSS / JS     不做资料渲染
    │
    ▼
页面脚本请求公开 PCP，图片请求 /media/{id}
    GET /pcp/v1/public/sources
    GET /pcp/v1/public/pages
    GET /pcp/v1/public/pages/{source}/{slug}
    POST /pcp/v1/public/search
```

流程：

1. 主人把站点 Skill 交给 Agent。
2. 若要定制，Agent 下载原始页面源码并修改。不定制则继续使用原始页面。
3. 会变的事实在运行时向公开 PCP 读取，不写进构建产物。
4. Agent 上传 zip，取得预览地址。线上指针不动。
5. Agent 调用激活。接口返回批准地址，指针仍不动。Skill 要求把这个地址交给主人，并等到已生效再报告完成。
6. 主人打开批准地址，核对预览后同意。指针这时才移动。拒绝、过期或一直不点，线上都不变。

上传后的包存在应用自己的发布存储里，不交给入口容器。入口若出现，只做 HTTPS 反向代理。

Skill 必须写明：

- 页面脚本只能调用匿名公开 PCP 和公开媒体地址，不能携带 API Key、访问令牌或主人的 Cookie。
- 不得把密钥或 private 页写进源码或构建产物。
- 不得替换保留路径。
- 公开页面的请求使用 `credentials: omit`。
- 上传和预览之后必须申请激活，把批准地址交给主人。同意前不得声称站点已经更换。
- 定制从原始源码重新开始，不能把已激活的 dist 当成下一轮源码。

## 9. 关键场景

### 9.1 写入一种新资料

1. 主人或 Agent 上传原件，或直接提供一段 Markdown。系统不询问这是不是某种预置业务对象。
2. `put_page` 按 `source` 和 `slug` 写入。`type` 和 frontmatter 进入 `pages` 投影，原文进入对象存储。
3. `search` 可以按正文、`type` 和 frontmatter 字符串命中。不需要为这个 `type` 建表。
4. 内容写错时覆盖这一页，或按哈希做 `edit_page`。不需要迁移。
5. `visibility` 不是 `public` 的页，匿名访客和公开 PCP 都读不到，响应与不存在相同。

财务凭证、证件、聊天整理都走这一条。它们只说明「新字段不改 schema」，不是第一版要单独交付的功能。

### 9.2 发布落地页

1. 主人已把个人介绍、经历和教育页标成 `visibility: public`。它们可以分属不同业务目录。
2. 不定制时，访客直接看到原始页面。若要定制，Agent 从原始源码改起，构建后上传 release。
3. 预览能看到浏览器取回的公开资料。线上路径仍是当前指针。
4. Agent 申请激活并把批准地址交给主人。主人同意后，访客才看到新版式。
5. 主人把某段经历改成 `private` 后，下一次公开 PCP 请求不再返回这段，对应媒体地址也不再匿名可读。已经打进 zip 的副本收不回来。

### 9.3 把上下文分发给 Agent

1. Agent 读取 `/.well-known/pcp` 和对应 Skill。
2. 自己的 Agent 使用已经批准生成的 API Key。别人的 Agent 用设备码请求授权。两者都不能自己创建 API Key。
3. Agent 用通过认证的请求调用 `get_page` 和 `search`。两种认证在相同权限下结果一致。
4. 未被批准的私有页返回 `not_found`，且不泄露正文。
5. 主人撤销这一条 OAuth 授权或这一把 API Key 后，它立即不能再刷新或调用。其他凭据仍可用。

## 10. 验收

- 仓库中不存在按资料种类拆开的业务表。新增一种 `type` 不需要 migration。
- 集成测试里的调用方无法执行建表。`put_page` 写入对象和 `pages` 投影，不写新表。
- 同一资料操作分别经 OpenAPI 和 MCP 调用，结果一致。密钥管理在 MCP 工具列表里不存在。
- 无读取权时，私有页、已删除页和不存在的页返回同一个 `not_found`。有读取权的 API Key 与 OAuth 结果一致。
- 主人删除 source 后，该目录的页和媒体立即不可读。其他页的链接原文不变。权限不被删掉。30 天内恢复后，只回来因目录一起隐藏的页。API Key 不能删除或恢复目录。
- 改 `visibility` 没有改可见性权限时失败。有写权限仍然可以改正文。
- `edit_page` 的哈希不符时不覆盖。`put_pages` 任一页非法时全部不写。
- `remember` 之后，Markdown 的 `## Facts` 含该条；重建投影后事实仍在。`forget` 之后当前投影不再有它。
- 上传站点 release 后，主人同意前公开 URL 仍是旧版。同意只改变指针。`activate_site` 的响应本身不改变指针。
- 创建 API Key 的响应不含密钥。未确认前不存在可用密钥。确认页只显示一次原文。OAuth 和 API Key 不能调用密钥管理，也不能调用同意上线。
- 宿主提供站点文件时不查询 `pages`。公开页面能显示的资料只来自匿名公开 PCP 和已公开页的 `/media/{id}`。
- 删除或损坏索引后，可以从对象里的 Markdown 和原件重建 `pages`、`chunks`、`links`、`tags`、`facts`、`timeline_entries`。授权、密钥哈希、主人和站点指针不在这份重建里。
- 开发和生产配置都没有本地目录存储。

## 11. 实施顺序

1. 资料仓：source、对象里的 Markdown、`put_page`、`edit_page`、原件上传和 `/media/{id}`、frontmatter 搜索。围栏先当正文保存。没有站点定制，也没有 Agent 认证。
2. 公开站点：随应用发布的原始页面、公开 PCP；可选的定制 zip、预览和「申请再同意」的激活。宿主不渲染资料。
3. 发现文档、API Key 的批准生成与作废、OAuth 2.1 设备码。OpenAPI 与 MCP 接到同一组资料和站点操作。密钥管理只接 HTTP。
4. `## Facts`、`## Timeline`、标签和链接的回写与抽取，以及从对象重建投影。抽取失败从这一步起回滚整次写入。

第 1 步完成前不做向量检索、多站点或额外认证方式。前面的包可以先建，后面的路由先不挂。

## 12. 待定

无。存储、围栏、MCP 形态、密钥和上线批准都已定死。实现时不要再引入本地目录、第二套 MCP 进程或另一种围栏。
