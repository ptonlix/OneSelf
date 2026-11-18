# Design

## Context

见 `proposal.md`。所属人已确认的 v2 设计稿在本目录的 `design/` 下，参照的是 sceneai.art 画廊里的「Intelligent Networks」（星空、正中的轨道球、倾斜轨道环、字距拉开的大写眉题、压在主视觉上的玻璃胶囊按钮）。

| 稿件 | 原型 | 截图（1440 宽） |
| --- | --- | --- |
| 首页（指针为 `public-page` 时的 `/`，有没有公开页都一样） | [home.html](design/home.html) | [home.jpg](design/shots/home.jpg)、[home-fold.jpg](design/shots/home-fold.jpg) |
| 登录 | [admin-login.html](design/admin-login.html) | [admin-login.jpg](design/shots/admin-login.jpg) |
| 强制改密 | [admin-password.html](design/admin-password.html) | [admin-password.jpg](design/shots/admin-password.jpg) |
| 概览 | [admin-overview.html](design/admin-overview.html) | [admin-overview.jpg](design/shots/admin-overview.jpg) |
| 批准设备码 | [admin-device.html](design/admin-device.html) | [admin-device.jpg](design/shots/admin-device.jpg) |
| 发起 API Key | [admin-apikey-new.html](design/admin-apikey-new.html) | [admin-apikey-new.jpg](design/shots/admin-apikey-new.jpg) |
| 批准 API Key | [admin-apikey-approve.html](design/admin-apikey-approve.html) | [admin-apikey-approve.jpg](design/shots/admin-apikey-approve.jpg) |
| 批准站点上线 | [admin-site.html](design/admin-site.html) | [admin-site.jpg](design/shots/admin-site.jpg) |
| 参考 | — | [ref-1-intelligent-networks.jpg](design/shots/ref-1-intelligent-networks.jpg)、[ref-1-motion-frames.jpg](design/shots/ref-1-motion-frames.jpg) |

样式原型在 [design/assets/brand.css](design/assets/brand.css)、[design/assets/admin.css](design/assets/admin.css) 和 [design/assets/stars.js](design/assets/stars.js)。原型里的目录、密钥和 id 都是虚构的；稿件是静态帧，动效要在浏览器里打开原型才看得到。早先的公开页稿件 `profile.html` 按 type 排版资料，已随所属人的决定从本变更移除，不作为实现参照。

现状约束，均已对照代码核实：

- `/` 怎么来的：`apps/server/src/site-files/routes.ts` 在 `app.notFound` 里处理所有非保留路径的 GET/HEAD（保留首段为 `pcp`、`oauth`、`.well-known`、`admin`、`skills`、`media`、`_preview`），先取 `runtime.currentPointer()`。数据库里没有指针行时它是 `public-page`（`postgres-state.ts`），这时 `runtime.readPublicPage()` 从 `packages/public-page/dist` 读文件；指针是 `rel_…` 时从已上传的 release 读文件。`/` 映射到 `index.html`，`index.html` 一律 `no-store`；release 里没有的路径 404，不回退。`/_preview/{id}/` 走同一段逻辑但不看指针，`/_preview/public-page/` 也能打开内置页。服务端从不渲染资料。
- 所以激活了定制 release 后，`/` 是那份 release，内置页只在 `/_preview/public-page/` 看得到；没有激活时，`/` 是内置页。
- 内置页现在的行为：`packages/public-page` 是不带框架的 TypeScript，`index.html` 只有空的 `#app`。浏览器里 `main.ts` 调 `load.ts`，用 `@oneself/public-client` 读 `listPages`；列表为空显示 `renderEmpty` 的「还没有公开页」，否则逐个 `getPage`、`getMedia`，由 `render.ts` 按 type 拼 HTML（`profile` 的 `name`/`title`，`experience`/`education` 的 `org`/`start`/`end`，其他类型的标题和 type，正文转义原样输出，图片和 PDF 原件）；任何读取失败显示 `data-state="error"`。Vite 配置是 `appType: "mpa"`，`build.test.ts` 断言产物只有 `index.html` 且未知路径 404。
- `tests/smoke/site.test.ts` 对内置页只断言 `/` 返回 200、`no-store`、含 `OneSelf`、不含 `/src/main.ts`；`tests/acceptance/skills.test.ts` 断言 `references/public-page.md` 含「原始页面能展示的公开字段」和 `name`、`org`、`start`、`end`。
- `apps/admin` 是 React，`views.ts` 用 `createElement` 写视图，`ui.ts` 管状态，`http.ts` 的 `HttpRequest.method` 只有 `GET | POST`。`routes.ts` 的路由与 `apps/server/src/owner/static.ts` 的 `ADMIN_PAGES` 一一对应。
- `owner/static.ts` 的 `adminContentType` 不认 `.woff2`，会发出 `application/octet-stream`。`site-files/routes.ts` 已经把 `.woff2` 映射为 `font/woff2`。
- Skill 的安装方式，仓库里只记了一种：`README.md` 第 301 行「安装：`npx skills add https://站点`」、`README_EN.md` 第 301 行 `npx skills add https://your-site`、`docs/ARCHITECTURE.md` 第 541 行「安装命令是 `npx skills add https://站点`。安装器读 `GET /.well-known/agent-skills/index.json`」，索引唯一一条 `oneself`，`url` 是 `{origin}/skills/oneself.tar.gz`。`SKILL.md` 提到 `npx skills update` 会覆盖安装目录。仓库没有记从 GitHub 安装（如 `npx skills add ptonlix/OneSelf`）；而且仓库里的 `SKILL.md` 不写 `metadata.oneself_origin`，只有服务器发出时才写入（`AGENTS.md`），所以从站点安装才是有效的方式。
- 镜像里的 `public-page-source.zip` 由 `Dockerfile` 遍历 `packages/public-page`（跳过 `dist`、`node_modules`）打包，所以放进该包的字体和标志会跟着源码 zip 发给定制站；`packages/public-client` 不在这份 zip 里。
- 站点 release 怎样收文件（`packages/domain/src/site-pointer.ts` 的 `assessSiteArchive`）：`put_site` 收一个 zip（HTTP multipart 字段 `archive`，MCP `archive_base64`），最多 200 个文件、合计 20 MiB，超出为 `payload_too_large`；必须有根 `index.html`；拒绝空路径、绝对路径、反斜杠、`..`、符号链接和保留首段。不限文件类型。
- release 文件怎样发出（`site-files/routes.ts` 的 `fileResponse`）：只设 `content-type` 和 `cache-control`。类型按扩展名映射 html、css、js/mjs、json、svg、png、jpg、webp、gif、pdf、woff2，其他为 `application/octet-stream`；`index.html` 为 `no-store`，文件名带 8 位以上哈希的 js/css 为一年 immutable，其他不设缓存头。服务端对站点文件和公开 PCP 都不设 CSP，也不设 CORS 头。站点和 `/pcp/v1/public/*` 同源，所以 release 里的脚本用 `fetch("/pcp/v1/public/pages", { credentials: "omit" })` 就能读，线上和预览都一样。
- 预览路径的坑：`/_preview/{id}/` 把 release 挂在子路径下。产物里以 `/` 开头的资源地址（Vite 默认 `base: "/"` 产出 `/assets/…`）在预览时会去线上路径取文件，取到的是当前线上站点的资源或 404。现在的 `packages/public-page/vite.config.js` 只有 `appType: "mpa"`，没设 `base`，所以定制 release 上线后打开 `/_preview/public-page/` 时内置页的脚本和样式会失效。
- `@oneself/public-client`：`packages/public-client/package.json` 是 `private`、未发布到 npm，`exports` 直接指向 `src/index.ts`。实现在 `src/client.ts` 一个文件里，没有任何 import，没有运行时依赖；所有请求 `credentials: "omit"`、`cache: "no-store"`，并删掉 `authorization`、`cookie`、`x-api-key` 头。服务器不发它的文件：Skill 只通过 `SKILL.md`、两份 reference 和由这三份打成的 `/skills/oneself.tar.gz` 发布（`apps/server/src/app/skill-pack.ts`）。`AGENTS.md`、`README.md` 和 `docs/ARCHITECTURE.md` 都写着「定制站也用它」。

## Goals / Non-Goals

**Goals:**

- 首页和管理端用同一套 Orbit O 品牌和 token，看起来是一个产品。
- 没有定制 release 时，`/` 讲清楚 OneSelf 的理念、「公开」的含义，以及怎样让 Agent 生成并上线自己的展示页。
- 内置页不预设任何资料版式，也不透露有没有资料。
- 管理端每次批准都是「申请详情 + 授权摘要 + 一个主按钮」，并能在概览里看到和作废 API Key 与已批准的设备授权、看到站点指针和 release。
- 不请求任何第三方资源；减少动效时页面完整可用。

**Non-Goals:**

- 除 `GET /admin/oauth-grants`（决定 10）外不新增 HTTP 路由；不新增 PCP 操作、错误码、数据表、迁移或 npm 依赖。
- 不给 OAuth 授权补名称、最近使用时间或过期时间，这些都要新列和迁移。
- 不给定制站规定视觉规范：token、字体、标志用法和 `data-*` 钩子只属于内置首页和管理端。
- 不拆出 `/about`、`/resume` 等新路径，不做客户端路由，不启用 SPA 回退。
- 内置页不读取、不展示任何资料：不做按 type 的字段映射、Markdown 正文渲染、原件展示或搜索。展示成什么样由 Agent 生成的定制站决定。
- 不改站点服务逻辑和指针语义。
- 不做浅色主题，不打包中文字体，不改发现文档。产品 Skill 只改 `references/public-page.md` 里描述内置页的那一节（决定 5）。
- 不改站点文件的缓存策略。

## Decisions

1. **token 各放一份，用测试锁住。** 架构第 4 节没有共享 UI 包，AGENTS 也不许另起目录，所以不建 `packages/ui-tokens`。`apps/admin/src/brand.css` 与 `packages/public-page/src/brand.css` 是同一份文件，只含 CSS 变量、字体声明和通用类（`.kicker`、`.glass`、`.glass-orbit`、`.btn*`、`.chip*`、`.switch`、`.seg`、动效类）。各自的 `styles.css` 只写本包布局。`apps/admin/src/brand.test.ts` 读两份文件并断言字节相同，以后改 token 必须两边一起改。备选是 Vite 别名跨包引用；那会让 `public-page-source.zip` 缺文件，定制站构建失败。

2. **颜色全部从品牌渐变推出。** `--teal #2dd4bf`、`--blue #6d8bf8`、`--violet #a855f7` 及各自亮一档的 `-2`，`--orbit` 为 135° 三色渐变，`--orbit-text` 为暗底上更亮的文字渐变。夜空 `--sky-0/1/2` 取自 `docs/images/hero.png`。语义映射固定：公开、已批准、读权限用 teal，授权范围、写权限用 blue，Agent、改可见性、`site:write` 用 violet。只有待批准 `#f5c77e` 和危险 `#fb7d96` 两个功能色不在渐变上，只用于状态标签、提示和作废、拒绝按钮。对比度：`--fg` 与 `--fg-2` 在 `--ink-0` 上为 17.6:1 和 8.8:1。原型里的 `--fg-3 #6f7392` 只有 4.3:1，实现时改为 `#7a7e9c`（在 `--ink-0` 上 5.0:1，在 `--ink-1` 上 4.8:1）。`--fg-4` 只用于装饰性分组标题，不承载必须读到的信息。

3. **标志只用官方文件。** `docs/images/logo.svg` 复制为两个包的 `public/favicon.svg`，并作为内联 SVG 用在首页导航和 Hero、管理端侧栏和登录卡上方。内联时给渐变和遮罩 id 加前缀，避免同页多次出现时冲突。测试断言两份 `favicon.svg` 与 `docs/images/logo.svg` 字节相同。

4. **内置页就是固定首页，写死在 `index.html`。** 不论有没有公开页、读取是否成功，指针为 `public-page` 时 `/` 都是同一份首页。内容直接写在 `packages/public-page/index.html` 里，不依赖脚本就能读到；`src/main.ts` 只引入样式、启动星空、接上复制按钮，并把站点地址填进标了 `data-origin` 的元素。备选是保留 `listPages()`、只在列表为空时显示首页：那仍要预设「有资料时显示什么」，正是所属人否定的做法，而且首页出现与否本身就透露了有没有公开页，所以不调。不再读取，读取失败的错误状态也就没有存在的必要，一并删除。首页内容是静态文案：理念与效率、隐私；「公开」的含义（frontmatter `visibility: public`，任何 AI 可经 `/pcp/v1/public/*` 匿名读取，改回 `private` 下一次匿名读取即消失）；安装 Skill 和用 Agent 做事（决定 16）；怎样得到展示页（让装好 Skill 或经 `/mcp` 接入的 Agent 按公开资料生成，`get_site → put_site → preview_site → activate_site → 在 /admin 批准`）；Agent 接入路径 `/.well-known/pcp`、`/mcp`、`/openapi.json`、`/skills/oneself/SKILL.md`；打开管理端。服务端发出的 HTML 里接入入口只写以 `/` 开头的路径，安装命令用占位符，不嵌入任何绝对地址，这样无论有没有资料响应都逐字节相同。所属人后来要求首页显示真实地址，所以由浏览器脚本补上：`main.ts` 在 `http:`/`https:` 页面上读 `location.origin`，把 `data-origin="/路径"` 的元素改成「origin + 路径」，把 `data-origin-copy` 模板（`{origin}`）写进复制按钮的 `data-copy`，并隐藏「换成这个页面所在的地址」那句提示。只用 origin、不用当前路径，所以 `/_preview/public-page/` 下显示的也是站点根地址；`file://` 等 origin 为 `"null"` 的页面和不跑脚本时保留占位符和相对路径。显示的是访客实际打开的地址，不一定等于配置的 public origin，这是有意的：访客复制的命令就指向他正在看的这台服务器。不列任何 type 或字段清单，不出现「私有页」字样，不显示公开页数。

5. **删除按 type 渲染的代码。** 删掉 `load.ts`、`render.ts` 及其测试，`package.json` 去掉 `@oneself/public-client`。旧版输出的 `data-type`、`data-source`、`data-slug`、`data-field`、`data-file`、`data-state` 钩子随之消失。已上传的定制 release 是自带的静态文件，不受影响。以后的定制从 `get_site` 拿到的是首页源码，Agent 按 `references/public-page.md` 列出的匿名接口自己读取资料、决定版式；该文件里「原始页面能展示的公开字段」一节删掉按 type 列字段的内容，改写为「内置页只是介绍，不展示资料」，只讲流程和约束：哪些数据是公开的（`visibility: public` 的页和它引用的原件）、用哪些站点工具（`get_site`、`put_site`、`preview_site`、`activate_site`、`list_sites`）、先预览再由所属人在 `/admin` 批准；保留接口清单、`credentials: omit`、`/media/{id}` 和真实路径、保留路径规则。该文件明确写出「不规定任何视觉规范」，不提供设计 token、`brand.css`、配色、字体要求或 `data-*` 钩子，版式和样式由所属人与 Agent 自定。读取公开资料的写法见决定 14，相对资源路径见决定 15。原因：品牌 token 是为内置首页和管理端定的，定制站本来就是为了「像本人」，把产品的视觉强加给它等于又预设了一次版式。`docs/PRD.md` 第 8 节同步改写。

6. **不做的部分。** 原计划的公开页 v2 布局（Hero 头像、经历、教育、原件区和资料页脚）、只做展示的 Markdown 子集渲染器和内置页搜索都不做。它们都假设了资料的形状，应由 Agent 在定制站里按实际资料决定。

7. **字体随包发布。** 从 Geist 官方仓库（`github.com/vercel/geist-font`）发布到 npm 的 `geist` 包（实现时为 1.8.2，`dist/fonts/` 下未修改的文件，许可证即该包的 `LICENSE.txt`）取 Geist 与 Geist Mono 的可变字体 woff2 和 `OFL.txt`，在仓库里命名为 `Geist-Variable.woff2`、`GeistMono-Variable.woff2`，放进两个包的 `src/fonts/`，并在 `src/fonts/README.md` 记下来源版本，由 `brand.css` 的 `@font-face`（`font-display: swap`）引用，Vite 打包时加哈希。中文回退 `PingFang SC`、`Hiragino Sans GB`、`Noto Sans CJK SC`、`Microsoft YaHei`。`owner/static.ts` 的 `adminContentType` 补 `.woff2 → font/woff2`。两份字体加许可证约 150 KB，源码 zip 仍远低于 20 MiB 和 200 个文件。

8. **管理端界面与现有接口一一对应。**

   | 界面 | 路由 | 调用 | 变化 |
   | --- | --- | --- | --- |
   | 登录 | `/admin/login` | `POST /admin/login` | 新外观 |
   | 强制改密 | `/admin/password` | `POST /admin/password`、`POST /admin/logout` | 新外观 |
   | 外壳 | 全部 | `POST /admin/logout` | 侧栏：概览、批准设备码、API Key、站点上线、修改密码、登出 |
   | 概览·目录 | `/admin/` | `GET /pcp/v1/sources`、`GET /pcp/v1/sources/{id}`、匿名 `GET /pcp/v1/public/pages` | 新面板 |
   | 概览·API Key | `/admin/` | `GET /pcp/v1/api-keys`、`DELETE /pcp/v1/api-keys/{id}` | 新面板 |
   | 概览·站点 | `/admin/` | `GET /pcp/v1/site`，预览链接 `/_preview/{id}/`，内置页为 `/_preview/public-page/` | 新面板 |
   | 概览·已批准设备 | `/admin/` | `GET /admin/oauth-grants`（新增）、`POST /admin/oauth-grants/{id}/revoke`（已有） | 新面板 |
   | 批准设备码 | `/admin/device` | `GET /pcp/v1/sources`、`POST /admin/device` | 新外观 |
   | 发起 API Key | `/admin/api-keys/new` | `GET /pcp/v1/sources`、`POST /pcp/v1/api-keys` | 新外观，加请求体预览 |
   | 批准 API Key | `/admin/api-keys/{id}` | `GET`、`POST /admin/api-keys/{id}/approve` | 新外观，加复制和用法 |
   | 申请站点上线 | `/admin/site-activations/new` | `POST /pcp/v1/site/activate` | 新外观 |
   | 批准站点上线 | `/admin/site-activations/{id}` | `GET`、`POST /admin/site-activations/{id}/approve` | 新外观，加指针对比和预览链接 |

   `http.ts` 的 `HttpRequest.method` 加 `DELETE`，新增 `listApiKeys`、`revokeApiKey`、`sourceStatus`、`listSites`、`listPublicPages`、`listOauthGrants` 和 `revokeOauthGrant`。除 `listPublicPages` 外都沿用所属人 Cookie；`listPublicPages` 用 `credentials: "omit"`，与公开站点看到的完全相同，只用来按 `source` 计数。解析器沿用现有写法：未知形状抛 `ParseError`，任何响应里出现 `key` 字段都拒绝；授权列表里出现 `token`、`refresh`、`hash` 开头或包含这些词的字段也拒绝。目录逐个调用 `sources_status`，一个失败只把该行标成「读取失败」，不影响其他面板。

9. **作废要二次确认，结果以服务端为准。** API Key 和设备授权一样：作废按钮先变成「确认作废」，再点才发请求（API Key 为 `DELETE`，设备授权为 `POST …/revoke`）。成功后重新拉取列表；`conflict`（已作废）和 `not_found` 显示服务端消息并刷新。已作废的行显示 `revoked` 标签和作废时间，没有作废按钮。列表只显示 label、授权摘要、`created_at`、`last_used_at`、`revoked_at`，从不显示密钥原文或哈希。

10. **新增所属人路由 `GET /admin/oauth-grants`，作废沿用已有路由。** 服务端已有 `POST /admin/oauth-grants/{id}/revoke`（所属人会话、检查 Origin、只作废这一条并销毁它的访问和刷新令牌），但没有列表，`POST /admin/device` 返回 `{}`，所属人拿不到 id。所以只补列表，不重做作废。
    - 鉴权：在 `owner/routes.ts` 的 `mountOwner` 里注册，排在 `mountAdminPages` 之前；只在 `Accept` 含 `application/json` 时处理，否则落到管理端页面，与 `GET /admin/api-keys/{id}` 的写法相同。为此 `owner/static.ts` 的 `ADMIN_PAGES` 加 `oauth-grants`，浏览器直接打开该地址时拿到管理端页面而不是 404。`runtime.listOauthGrants(actor)` 走 `#ownerActor`：没有会话为 `unauthorized`，API Key 或 OAuth 令牌为 `forbidden`，需要改密为 `password_change_required`，错误体沿用 `sendError`。GET 不改状态，所以不查 Origin。
    - 返回：`{"oauth_grants":[{"id","site_write","sources":[{"id","read","write","visibility"}],"created_at","revoked_at"}]}`，snake_case，按 `created_at`、`id` 排序，含已作废的。字段全部来自 `oauth_grants` 表已有的列（`id`、`site_write`、`sources`、`created_at`、`revoked_at`）；`refresh_token_hash`、`rotated_refresh_hashes`、`refresh_token_payload` 绝不出现。设备批准后、换令牌前授权就已存在，所以刚批准的设备也会列出。
    - 不做的字段：客户端名称（引擎只有一个客户端 `oneself`）、最近使用时间和过期时间（都没有存；授权固定 30 天上限也是代码常量，不是每条记录的值）。要显示它们需要新列和迁移，留给以后。
    - OpenAPI：`/openapi.json` 由操作注册表生成，管理端路由不在注册表里，已有的作废路由也不在。列表照此处理，不进 PCP 操作表、MCP 和 OpenAPI；Agent 不能列出或作废自己的授权。备选是注册成 `httpOnly` 的 PCP 操作（像 `list_api_keys`），但那样就把只给所属人看的设备清单写进了公开的接口文档，还要动 `packages/operations` 和操作数测试，收益不大。
    - 存储：运行时内存里已有全部授权记录，`postgres-store` 也已有 `listOauthGrants()`，不改 `packages/db`、`packages/adapters`、`packages/domain` 和迁移。
    - 界面：概览「已批准设备」面板每行显示缩短的 id、授权摘要（每个 source 的读写和可见性范围）、`site:write`、批准时间；已作废的行显示 `revoked` 和作废时间，没有按钮。作废两步确认，返回 `not_found`（已作废或不存在）时显示消息并刷新。设备码批准页授权摘要下的提示改为「之后可在概览的「已批准设备」里单独作废这条授权，下一次请求即失效」。

11. **动效可关，内容不靠动效。** 只动 `transform`、`opacity` 和 `stroke-dashoffset`：入场上浮去模糊 0.9 s、轨道环上的光点 14 s 与 19 s、光晕呼吸 6 s、卫星和星点闪烁。轨道环本身不旋转（旋转会覆盖 SVG 的倾斜角，扫过正文）。星空用固定种子画在 `canvas` 上，`aria-hidden`，页面隐藏时停止。`prefers-reduced-motion: reduce` 时取消所有动画和过渡，星空只画一帧，入场元素直接处于最终状态。管理端只有登录和改密页有星空，工作区不放持续动画。管理端的 `src/stars.ts` 是首页 `src/stars.ts` 的同一份副本（理由同决定 1，不跨包引用），`brand.test.ts` 断言两份字节相同。

12. **可访问性。** 分段控件和开关仍是原生 `checkbox`，外面套 `label`，键盘和读屏行为不变；所有可聚焦元素有 2 px 的 teal 焦点环。装饰性 SVG 加 `aria-hidden`。批准页「读权限包含该 source 的全部未删除私有页」仍出现在确认按钮之前，按钮文字仍是「确认」。

13. **内置首页页脚固定，不可配置。** 首页底部始终显示 `Powered by OneSelf`，不提供开关、环境变量或操作去隐藏或改写。内置首页是产品自己的介绍页，署名是它的一部分；所属人想要别的页脚，就让 Agent 做定制站，定制站的页脚完全自定。

14. **保留 `@oneself/public-client`，定制站用它时必须打进构建产物。** 所属人决定保留这个包，代码不改。它不再被内置页引用，但仍是公开接口的类型化客户端，有自己的测试，也是 `AGENTS.md` 写明的「定制站也用它」。
    - 契约是公开 HTTP 接口，不是这个包：`GET /pcp/v1/public/sources`、`GET /pcp/v1/public/pages`、`GET /pcp/v1/public/pages/{source}/{slug}`、`POST /pcp/v1/public/search`、`GET /media/{id}`。包只是这些接口的一层薄封装。
    - 包是 `private`，没有发布到 npm；服务器不提供它的文件，`get_site` 的源码 zip 和 Skill 包里都没有它；release 只是上传的静态文件，服务器不会安装依赖，也不解析裸模块名。所以页面里写 `import "@oneself/public-client"` 却不打包、从 CDN（`esm.sh`、`unpkg` 等）引入、或在上线后再 `npm install`，都拿不到它。
    - `references/public-page.md` 新增「读取公开资料」一小节，写明：可以用 `@oneself/public-client`，但必须在构建时打进产物。手里有 OneSelf 仓库时，把 `packages/public-client/src/client.ts`（单文件、无依赖）复制进站点源码，例如 `src/vendor/public-client.ts`，由打包器打进 JS；在仓库里做站点时也可以用 workspace 依赖，结果同样打进产物。拿不到仓库时，直接用 `fetch` 调上面的接口，带 `credentials: "omit"`，不带任何凭据头，效果相同。上传前核对产物里没有对 `@oneself/public-client` 的裸 import，也没有外部脚本地址。这一节只讲读取方式，不涉及视觉。
    - 备选一：把预构建的 ESM 放进 Skill 文件夹并由服务器发出。要改 `skill-pack.ts` 的打包清单、新增一个 `/skills/oneself/…` 路由、在镜像构建里把 TypeScript 编成 JS，并加一条防漂移测试；换来的只是少写五个 `fetch`。不做。备选二：`Dockerfile` 把 `client.ts` 一起放进 `public-page-source.zip`。只改打包脚本，但内置页并不用它，会让「源码 zip 就是首页源码」不再成立。本变更不做，以后若发现 Agent 普遍拿不到仓库再提。

15. **内置页用相对资源路径，Skill 要求定制站也这样。** `packages/public-page/vite.config.js` 加 `base: "./"`，产物里的脚本、样式、字体和标志都用 `./assets/…` 这类相对地址，这样 `/` 和 `/_preview/public-page/` 都能正确加载，从 `get_site` 起步的定制站也自动继承。`references/public-page.md` 在「怎么定制」的构建一步写明：资源用相对路径，否则 `/_preview/{id}/` 下会加载线上路径的文件。这只是让预览可用的路径规则，不是视觉要求。站点页面调用 `/pcp/v1/public/*` 和 `/media/{id}` 仍用以 `/` 开头的绝对路径，它们在预览和线上都指向同一个接口。

16. **首页教用户安装 Skill，再通过 Agent 做事；有 GitHub 链接，没有部署命令。** 能看到首页，服务就已经在运行，所以不放 `docker compose`、`git clone`、`pnpm install` 之类的服务端命令。
    - 段落顺序：导航（理念、安装 Skill、展示页，右侧 GitHub 和管理端）→ Hero（slogan 和导语，不放按钮；所属人要求去掉原稿的「安装 Skill」「生成我的展示页」两个按钮，导航已能跳到各节，轨道主视觉相应上移）→ 理念与效率、隐私 → **安装 Skill**（含接口细节）→ 展示页（「公开」的含义、四步）→ 收尾卡（「在 GitHub 查看源码」和「打开管理端」）→ 页脚（GitHub、`Powered by OneSelf`）。
    - 安装命令只用仓库文档里的那一条：`npx skills add https://<你的站点>`，可复制。静态 HTML 里 `<你的站点>` 用虚线下划线和紫色标成占位符，旁边写「换成这个页面所在的地址」；脚本运行后按决定 4 换成 `location.origin`，提示隐藏，复制按钮复制填好的命令。不写 `npx skills add ptonlix/OneSelf` 一类仓库没有记载的命令。
    - 安装后三张卡：01 连接并由你批准（批准设备码或给一把 API Key，随时收回）；02 上传和管理资料（默认私有，附一句可复制的示例指令）；03 定制展示页（你批准后才上线，附示例指令）。示例指令是固定文案，不读任何资料。管理端路径和工具名由 Skill 给出（决定 19）。
    - 原稿单独的「Agent 接入」一节（发现、接入、边界三卡）按所属人要求并进本节，因为两节都在教 Agent 用 OneSelf。分工写明：Skill 管流程（连接与批准、资料、展示页），接口细节（操作、认证、端点）由 PCP 发现文档 `/.well-known/pcp` 给出，Skill 要求 Agent 先读它。三卡下方一块「给 Agent 的入口」：可复制的 `GET {origin}/.well-known/pcp`，一句说明发现文档列出全部接口、认证方式和 MCP 地址；其余端点不在首页列出（决定 19）。
    - Skill 也按同一分工收紧：`SKILL.md` 新增「先读发现文档」和「连接并由所属人批准」，references 不再写已在发现文档里的操作路径（如 `get_site` 的 `GET /pcp/v1/site/source`）。当时发现文档只列操作名、方法、路径和几个地址，请求头、匿名接口、参数和上传限制只能留在 Skill；决定 18 把这些搬进服务端生成的文档，Skill 只留流程。
    - 复制按钮由 `main.ts` 用 `navigator.clipboard.writeText` 实现，复制的是占位符原样的命令；没有脚本时命令仍是可选中的文字。
    - GitHub 链接 `https://github.com/ptonlix/OneSelf` 出现在导航、收尾卡和页脚，`rel="noopener"`。它是普通 `<a>` 外链，不是「第三方资源」；构建产物扫描只看 `script`、`link`、`img` 的地址和 CSS 的 `url()`，`home.test.ts` 对 `https://` 只放行这一个地址和带占位符的安装命令。

17. **实现时对稿件的取舍。** 以下几处与 `design/` 稿件不同，是有意的：
    - 站点上线批准页的预览卡只给 `/_preview/{id}/` 链接和「新窗口打开」，不在管理端里嵌 `iframe` 或画缩略图：Agent 写的页面不应在管理端同源环境里运行。
    - 改密页不做稿件里的密码强度条：服务端没有强度规则，前端单独估算会给出与服务端不一致的判断。
    - 批准设备码和发起 API Key 的权限行只显示 source id，不显示每个目录的页数，避免为此逐个调用 `sources_status`。
    - 站点上线批准页的确认按钮文字仍是「确认」（决定 12），不用稿件里的「确认上线」。
    - 管理端界面拆成 `views.ts`（外壳、登录、各批准页）、`overview.ts`（概览面板和并发上限）、`parts.ts`（共用小部件）、`icons.ts`（标志与图标）、`sky.ts`（星空挂载），只是文件组织。`knip.json` 忽略 `openspec/**`（稿件里的 `stars.js` 不是代码入口）和管理端的 `stars.ts` 副本（导出与首页那份保持一致）。

18. **接口细节由服务端文档给出，与实现同源；Skill 只讲流程。** 所属人批准把 Skill 里写死的接口细节搬到发现文档和 OpenAPI：
    - 发现文档只增字段、版本仍为 `1`：`auth.headers`（`Authorization: ApiKey <key>`、`X-Api-Key: <key>`、`Authorization: Bearer <access_token>`）、`public`（`credentials: "omit"` 和五条匿名接口）、`uploads`（`file_upload` 字段 `file`、`put_site` 字段 `archive`，各自对应的 MCP 参数、媒体类型、`max_bytes`，站点另有 `max_files`）。所属人会话 Cookie 只给管理端用，不写进发现文档，只在 OpenAPI 的 `ownerSession` 方案里出现。
    - 同源防漂移：OpenAPI 的参数和 MCP 的 `inputSchema` 都由 `operationSchemas` 经 `z.toJSONSchema(…, { io: "input" })` 生成；冒烟测试拿实际 `tools/list` 与 `/openapi.json` 逐个操作比属性和必填项，上传操作比 `uploads.*.mcp_arguments` 和 multipart 字段。multipart 路由按 `uploads.*.field` 取字段；大小、类型、数量来自 `packages/domain` 常量，路由和文档读同一个值。匿名接口登记在 `packages/operations` 的 `publicEndpoints`，测试逐条请求确认都有路由。
    - `security`：可经 Agent 调用的操作列四种方案（`apiKey`、`apiKeyHeader`、`oauthBearer`、`ownerSession`），三个密钥操作只列 `ownerSession`，匿名接口 `security: []` 并带 `x-oneself-credentials: omit`。响应部分不变（仍只有响应码）。（方案、上传类型和错误响应已由决定 23 修正。）
    - Skill 去掉请求头、接口清单、字段名、限制和参数正则，改为指向这些字段；保留批准流程、来源（origin）规则、配置位置和参数语义。验收测试断言这些细节不再出现。
    - 未归档变更原则上不改 `docs/PRD.md`，但本变更在 2.8 已改过 PRD，这次所属人明确要求，只把发现文档一句补全为新增的三个字段。
    - 审查提醒：PRD 里补的这句在本变更归档前只是预先写入的说明，不是已生效的规格。其他变更在本变更归档前不得把它当作现行要求引用或依赖；现行要求以 `openspec/specs/` 为准，本变更的内容以本目录的 spec delta 为准。

19. **首页文案去冗余：首页讲是什么、怎么开始，细节交给 Skill 和发现文档。** 所属人指出首页说明重复、实现细节太多。取舍：
    - 删去安装器内部细节（`agent-skills/index.json`、`oneself.tar.gz`、直接读 `SKILL.md` 的备选），`npx skills add` 一条命令足够。
    - 端点只留 `/.well-known/pcp` 作为 Agent 的唯一入口。`/openapi.json`、`/mcp`、OAuth 元数据、五条匿名接口、`credentials: omit`、`/admin/device`、`/admin/api-keys/new`、`config.json`、`site:write` 和站点包大小、数量限制都已在发现文档或 Skill 里，首页不再重复。
    - 上线流程原来写了三遍（卡 03 的工具链、四步、「上线流程」卡），只留四步的白话和卡 03 一句话；删掉「上线流程」卡和工具名。「公开」一节右栏改为「谁能读到」（public 与 private 各一行）。
    - 不写实现栈（Node.js、PostgreSQL、RustFS），隐私一条改为「资料和原件都存在你自己的机器上」。
    - 合并重复说法：批准、随时收回各只在一处主讲；删掉收尾卡里与 Hero 重复的导语、与展示页导语重复的脚注，以及「注重隐私与效率平衡」和中英重复的小标题（「· Agent-first」「· Your public self」等）。
    - 版式和设计系统不变；只删掉不再使用的样式。`data-origin` 只剩安装命令和发现地址两处，`main.ts` 的机制不变。`home.test.ts` 断言这些细节不再出现。

20. **首页的大标志会动：卫星绕行，核心呼吸，圆环渐变慢转。** 只作用于 Hero 和理念一节的两个大标志，导航、页脚的小标志和 favicon 保持静态。
    - 几何不变（与 `docs/images/logo.svg` 一致）：三颗卫星仍在半径 178 的轨道上，起始位置就是原图位置；圆环上为卫星让出的缺口来自遮罩里的三个洞，洞和卫星放在同一个旋转组、用同一个动画，所以缺口始终跟着卫星走。
    - 节奏：卫星分别 18 秒、26 秒（反向）、38 秒一圈，匀速；核心 5 秒一次轻微放大到 1.06，并叠一层同色模糊光晕淡入淡出；圆环 120 秒转一圈，看到的只是渐变方向慢慢变化。
    - 实现：纯 CSS 动画，只动 `transform` 和 `opacity`，不加脚本和依赖。每个动的组先 `translate(256 256)` 移到标志中心，再以 `transform-origin: 0 0`（`transform-box: view-box`）旋转或缩放，组内元素再平移回去，渐变坐标不受影响。这种写法不依赖 `fill-box` 的中心计算，各浏览器（含 Safari）结果一致。
    - `prefers-reduced-motion: reduce` 时不加动画（且 `brand.css` 的全局规则会关掉所有动画），画面和原来的静态标志完全相同。样式写在 `packages/public-page/src/styles.css`，`brand.css` 不动。

21. **标志周围的轨道和行星也动起来。** Hero 和理念一节原本就有三条倾斜的椭圆轨道、轨道上的六颗小行星（带光晕）和两圈同心装饰圆，不新增元素，只让它们动：
    - 行星沿各自所在的椭圆轨道运行：在轨道的局部坐标里，用两个交替往返的平移（X、Y 各一个，缓动 `cubic-bezier(0.37, 0, 0.63, 1)` 近似正弦，Y 比 X 落后四分之一周期）合成椭圆运动，行星本身不变形。每颗周期不同（Hero 73–113 秒，理念 71–103 秒，互不整除），方向有正有反；负的 `animation-delay` 让每颗从原来的位置出发。原位置离轨道不到 1 个单位的，先吸附到轨道上。
    - 轨道本身缓慢变化：每条轨道在自己的倾角上左右摆动 ±5°（31–43 秒一个来回），并沿短轴做 `scaleY` 呼吸（1 → 0.88，13–23 秒）。行星放在与轨道同样嵌套、同样类名的组里，跟着一起摆动和呼吸，始终在轨道上；为保持原来的层次，轨道仍画在标志后面、行星画在标志前面。
    - 同心装饰圆：虚线圆的 `stroke-dashoffset` 缓慢流动，淡色实线圆的透明度缓慢起伏。原有的轨道流光和行星闪烁保留。
    - 只动 `transform`、`opacity`、`stroke-dashoffset`，纯 CSS、无脚本。每个行星的关键帧由轨道参数算出写进 `styles.css`（首页 HTML 不用行内 `style`，与现有写法一致）。`prefers-reduced-motion: reduce` 下全部静止，画面与改动前一致。

22. **管理端的大标志和轨道也动起来；登录页去掉页脚，找回说明收进提示。**
    - 动效与首页一致（决定 20、21），只用于大图：登录页和首次改密页的轨道图、概览的目录轨道图、发放 API Key 后的 72px 标志。卫星绕环转（18、26、38 秒，其中一颗反向），环上的缺口跟着卫星走；渐变环 120 秒转一圈；实心核心 5 秒呼吸并带一圈品牌渐变的柔光。登录轨道图的三条倾斜轨道各自摆动 ±5°（29–41 秒）并沿短轴呼吸到 0.88（17–23 秒）；四颗小行星沿所在轨道运行（35.5–54.5 秒走半圈），同一条轨道上的两颗同向，两条轨道方向相反；虚线圆流动、淡色圆透明度起伏。行星坐标改写为所在轨道的局部坐标，起始位置与原图相同（偏差不到 1 个单位）。概览图上的目录节点带文字标签，保持不动，只让中心标志转动、内圈虚线流动。侧栏、登录页顶栏的小标志和 favicon 不动。
    - 只动 `transform`、`opacity`、`stroke-dashoffset`，纯 CSS。规则写在 `apps/admin/src/styles.css`，两份 `brand.css` 不改，仍逐字节一致。`prefers-reduced-motion: reduce` 下全部静止。登录卡片压在轨道图下沿上，表单区域下面没有运动元素。
    - 登录页（及共用外框的首次改密页）删掉页脚「Argon2id 密码哈希 · HttpOnly 会话 · 每个 IP 每分钟最多 10 次登录」，取代决定 17 之后写全的那行页脚。
    - 登录页底部的找回说明删掉，改为「密码」标签旁的圆圈 i 按钮（`aria-label="忘记密码怎么办"`，`aria-describedby` 指向 `role="tooltip"` 的气泡）。气泡文字是「忘记密码时，在 .env 里设置 OWNER_RESET_PASSWORD 并重启服务」，变量名用等宽字体。悬停、键盘聚焦时显示，触屏点按切换，按 Esc 收起；气泡出现在按钮右侧，用玻璃面板的颜色、描边和模糊。原来包住密码框的 `label` 改为 `label for` 加输入框 `id`，按钮不放在 `label` 里，以免点标签时触发按钮。稿件 `design/admin-login.html`、`admin-password.html` 同步改文案（不含动效），截图重拍。

23. **代码审查修正：OpenAPI 与运行时一致，站点文案只讲站点，类型和资源收紧。**
    - 上传：multipart 字段写成 `type: string`、`format: binary`，去掉错误的 `application/octet-stream`。单一类型（站点 `application/zip`）直接写 `contentMediaType`；文件有多种类型，写成每种一个 `contentMediaType` 的 `anyOf`（这是注解，用 `oneOf` 会让每个分支都匹配），`encoding.contentType` 是 OpenAPI 3.1 允许的逗号分隔列表。类型都取自 `uploads`，即 `FILE_MEDIA_TYPES` 等领域常量。测试断言文档里的类型等于常量，且每种类型服务端都接受、其他类型被拒绝。
    - 认证方案：原来 `Authorization` 头上的 `apiKey` 方案会让生成的客户端发送裸密钥，而服务端只认 `ApiKey <key>`。现在方案由 `authHeaders` 的取值格式推出：裸 `<key>` 对应 `X-Api-Key` 上的 `apiKey` 方案（`apiKeyHeader`），`Bearer <access_token>` 对应 `http` `bearer`（`oauthBearer`）；`Authorization: ApiKey <key>` 没有标准方案，只写在 `apiKeyHeader` 的说明里。发现文档的 `auth.headers` 和 `securitySchemes` 出自同一份 `authHeaders`。测试按每个方案、每条发现文档请求头各构造一次请求，都能通过 `whoami`。
    - 错误响应：同一状态码的错误码合并为一个响应，说明列出全部错误码，响应体的 `error` 用 `enum`（403 同时有 `forbidden` 和 `password_change_required`）。
    - 站点文案：概览的「站点」面板和站点上线页不再出现「读权限包含该 source 的全部未删除私有页」，改为「先预览再上线；上线要你批准，指针不会自动移动」。读权限那句只留在设备授权和 API Key 页。
    - `GET /admin/oauth-grants` 的条目类型改为显式的 `OauthGrantView`（五个字段），运行时、路由、管理端客户端和测试都用它。
    - 星空（两份 `stars.ts` 仍逐字节一致）：`stop()` 移除 `visibilitychange` 监听并断开 `ResizeObserver`；画布尺寸或设备像素比变化时按新尺寸重排、立即重画；尺寸为 0 时不画，等有尺寸再画。
    - 新增测试从 `docs/images/logo.svg`、首页 `index.html` 的全部 Orbit O（含 Hero 和理念）以及管理端 `OrbitMark`（静态和动效）读出核心、环半径和线宽、卫星位置和半径、遮罩洞，逐一比对，防止手工改坐标造成漂移。
    - `knip.json` 不再整文件忽略 `apps/admin/src/stars.ts`，只对它忽略「未使用的导出类型」（共用文件里的 `StarContext` 只在首页一侧用到）。

## Risks / Trade-offs

- [两份 token 文件漂移] → `brand.test.ts` 断言字节相同，`pnpm run check` 会失败。
- [有公开页但没激活定制站的已有安装，升级后 `/` 不再显示资料] → 这是所属人确认的行为变化，发布说明写明；资料仍可经公开 PCP 读取，首页说明怎样让 Agent 生成展示页并在 `/admin` 批准上线。
- [定制起点不再带读取资料的示例代码] → `references/public-page.md` 写明匿名接口、返回字段、`credentials: omit` 和 `/media/{id}`，Agent 照此实现；不在内置页里保留不运行的示例代码。
- [Skill 指向的字段被改名] → 验收测试断言 Skill 引用的 `auth`、`public`、`uploads` 字段名，冒烟测试精确断言发现文档里这三个字段；任一边改动都会让 `pnpm run check` 失败。
- [字体文件名带哈希但不匹配站点的长缓存规则] → `site-files` 只对 `js`、`css` 加 immutable，字体每次按普通缓存走。体积小，不在本变更改缓存策略。
- [定制站沿用旧 DOM 写的样式] → 已上传的 release 不受影响；从 `get_site` 重新开始的定制拿到的是首页源码，没有旧版的 `data-*` 钩子。
- [概览在目录很多时请求变多] → 每个目录一次 `sources_status`，并发不超过 4。目录数通常很少。
- [授权列表泄露凭据] → 响应只从五个已知字段逐个拷贝，不展开记录；冒烟测试断言响应里没有访问令牌、刷新令牌和任何 64 位十六进制哈希，管理端解析器遇到令牌类字段直接拒绝。
- [设备行没有名称，难以分辨] → 按批准时间和授权范围区分；需要名称时另提加列的变更。
- [中文字体随系统不同] → 只影响字形，不影响布局；字号和行高按中文校过。

## Migration Plan

先落 token、字体、标志和 `.woff2` 类型，再把内置页换成固定首页并删除按 type 渲染的代码，同步改 PRD、Skill reference 和验收测试，最后改管理端外壳、各批准页和概览。每一步跑对应测试。没有数据或协议迁移；回滚只需还原两个前端包、`owner/static.ts` 的 `.woff2` 映射和 `oauth-grants` 页面名、`runtime.ts` 和 `owner/routes.ts` 里的授权列表，以及文档；授权数据本身不变。已有安装若想继续在 `/` 展示资料，按首页说明让 Agent 生成定制站并批准上线。

## Open Questions

- OAuth 授权的名称、最近使用时间和过期时间：本变更不存也不显示（决定 10）。若以后需要，要给 `oauth_grants` 加列和迁移，另提变更。
