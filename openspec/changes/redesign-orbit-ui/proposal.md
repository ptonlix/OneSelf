# Proposal

## Why

内置公开页和管理端现在是三套互不相关的样式：米色衬线的管理端和公开页，加上深蓝网格的空状态。没有设计 token，没有项目自己的标志。新装的站点打开 `/` 只看到「还没有公开页」，访客和所属人都不知道 OneSelf 是什么、展示页怎么来。管理端把每次批准做成一列原生复选框；接口已经支持的 API Key 列表与作废、release 列表和目录状态，管理端都没有入口。OAuth 设备授权更糟：服务端已经能作废单个授权（`POST /admin/oauth-grants/{id}/revoke`），却没有任何办法列出已批准的授权，所属人不知道该作废哪一个。

内置页现在还按 `type` 预设了一套资料版式：有公开页时，`profile` 显示 `name` 和 `title`，`experience`、`education` 显示 `org`、`start`、`end`，其他类型显示标题和 type，正文转义后原样输出。所属人已决定不再预设：系统无法事先知道用户会放进什么资料，按固定字段排出来的页面要么缺东西，要么不像本人。个人展示页应当由 Agent 在读过公开资料之后生成，经预览和所属人批准上线；内置页只负责讲清楚项目理念和这条路径。

所属人已确认 v2 设计稿（`design/`）：以官方 Orbit O 标志和品牌渐变 `#2DD4BF → #6D8BF8 → #A855F7` 为唯一品牌，首页和管理端共用一套界面。这次变更把它落到 `packages/public-page` 和 `apps/admin`。

## What Changes

- 新增一套共享设计 token（颜色、字体、字号、圆角、玻璃面板、按钮、标签、开关、分段控件、动效），全部颜色从品牌渐变推出。待批准和危险两种功能色是唯一例外。admin 与 public-page 各放一份字节相同的 token 文件，由测试保证一致，不新建包。
- 官方 Orbit O 标志（`docs/images/logo.svg`）用于 favicon、首页、管理端侧栏和登录页。slogan 为 `One self. One context. Every AI.`。
- 自带 Geist 与 Geist Mono 的 woff2 字体和 OFL 许可证，不请求外部字体服务。中文用系统字体回退，不打包 CJK 字体。管理端静态路由补上 `.woff2` 的 `font/woff2` 类型。
- **BEHAVIOR CHANGE** 内置页（指针为 `public-page` 时的 `/`）改为固定首页，无论有没有公开页都一样：项目理念（One self / One context / Every AI，效率与隐私）、「公开」的含义（frontmatter `visibility: public` 后任何 AI 不用凭据就能读，改回 `private` 立即不可见）、安装产品 Skill（文档里的命令 `npx skills add https://<你的站点>`，`<你的站点>` 是标出的占位符）、之后怎样用 Agent（连接要你批准、上传和管理资料、生成展示页并由你批准上线，各附一句示例指令）、给 Agent 的唯一入口 `/.well-known/pcp`、GitHub 链接 `https://github.com/ptonlix/OneSelf`，以及打开管理端。首页不放任何服务端安装或部署命令（能看到首页说明服务已在运行）。首页是写在 `index.html` 里的静态内容，不调用公开 PCP，不列出、不渲染、不统计任何页、字段或原件，因此也不会透露有没有资料。
- **BEHAVIOR CHANGE** 删除内置页按 `type` 渲染资料的逻辑（`load.ts`、`render.ts` 和对应测试）、空状态和读取失败状态。`packages/public-page` 不再依赖 `@oneself/public-client`。原计划的公开页 v2 布局（Hero、经历、教育、原件区）、正文 Markdown 子集渲染和内置页搜索全部不做。
- 内置首页底部固定显示 `Powered by OneSelf`，不提供开关或配置；定制站的页脚由所属人和 Agent 自定。
- 产品文档随之改写：`docs/PRD.md` 第 8 节；`skills/oneself/references/public-page.md` 删掉「原始页面能展示的公开字段」一节的按 type 字段内容，改为只讲流程和约束：哪些数据是公开的、用哪些站点工具、预览和批准，并明确写出**不规定任何视觉规范**，不提供设计 token、样式文件或 `data-*` 钩子；`tests/acceptance/skills.test.ts` 的对应断言同步修改。
- 同一份 reference 新增「读取公开资料」：公开 HTTP 接口是契约；定制站可以用 `@oneself/public-client`，但它是未发布的 `private` 包，release 又只是上传的静态文件，所以必须在构建时打进产物（有仓库就复制 `packages/public-client/src/client.ts`），不能运行时安装或从 CDN 引入；拿不到仓库就直接 `fetch` 公开接口并带 `credentials: "omit"`。构建一步要求资源用相对路径，保证 `/_preview/{id}/` 能正确加载。仍不规定任何视觉规范。
- 内置页构建改用相对资源路径（`base: "./"`），修复定制站上线后 `/_preview/public-page/` 的脚本和样式从线上路径加载的问题。
- Orbit O 品牌和 token 只约束内置首页和管理端，不约束、也不校验定制站。
- 管理端改为侧栏加工作区。登录、强制改密、设备码批准、发起和批准 API Key、申请和批准站点上线全部换成新界面，路由、请求和文案约束不变。
- 管理端概览新增四个面板：目录（`sources_list` + `sources_status`，公开页数用匿名 `GET /pcp/v1/public/pages` 汇总），API Key 列表与作废（`list_api_keys`、`revoke_api_key`），站点指针与 release（`list_sites`，预览链接 `/_preview/{id}/`，内置页为 `/_preview/public-page/`），已批准设备（新增的 `GET /admin/oauth-grants` 列表 + 已有的 `POST /admin/oauth-grants/{id}/revoke` 作废，两步确认）。
- **ADDED API** `GET /admin/oauth-grants`：只认所属人会话，要求 `Accept: application/json`，返回 `{"oauth_grants":[{id, site_write, sources:[{id, read, write, visibility}], created_at, revoked_at}]}`，按 `created_at`、`id` 排序，含已作废的授权。只返回存储里真实存在的字段，绝不返回令牌、令牌哈希或刷新载荷；没有客户端名称、最近使用时间和过期时间，因为没有存。和已有的作废路由一样属于所属人路由，不进 PCP 操作表、MCP 和 `/openapi.json`。
- 动效只用 transform、opacity 和 stroke-dashoffset：入场、轨道光点、光晕呼吸、星点闪烁。`prefers-reduced-motion: reduce` 时全部停止，内容不依赖动效出现。
- **ADDED API（只增字段）** 发现文档 `/.well-known/pcp` 新增 `auth`（每种凭据接受的请求头格式）、`public`（`credentials: "omit"` 和全部匿名接口：`/pcp/v1/public/*` 四条与 `/media/{id}`，各带名称、方法、路径）、`uploads`（`file_upload`、`put_site` 的 multipart 字段名、对应的 MCP 参数、媒体类型、字节上限和站点文件数上限）。`/openapi.json` 为每个操作生成 `parameters` / `requestBody`（与 MCP 工具的输入 schema 同源；上传为 multipart）、`security` 和 `components.securitySchemes`，并列出匿名公开接口（`security: []`）。协议版本仍是 `1`，已有字段不变。上传限制改由 `packages/domain` 的常量统一提供，路由和发现文档读同一个值；匿名接口登记在 `packages/operations`。
- 产品 Skill 随之瘦身：`SKILL.md` 和两份 reference 不再写请求头格式、匿名接口清单、multipart 字段名和大小、数量限制，改为指向发现文档的 `auth`、`public`、`uploads` 和 OpenAPI；连接时的设备码与 API Key 批准、站点上线批准等流程保留。首页「接口细节」一句同步说明发现文档里有认证方式、公开接口和上传限制。
- 除 `GET /admin/oauth-grants` 外，不新增 HTTP 路由；不新增 PCP 操作、错误码、数据表、迁移或 npm 依赖。除上面一条的新增字段外，不改发现文档；不改站点指针 `public-page` 和 `public-page-source.zip` 的名字，不改站点服务逻辑（`apps/server/src/site-files/routes.ts`）。

### 对已有安装的影响

- 已经激活定制 release 的站点：`/` 由 release 提供，不受影响。
- 有公开页、但没有激活定制 release 的站点：升级后 `/` 不再显示这些资料，而是显示首页。公开页本身仍可经 `/pcp/v1/public/*` 被 AI 读取，没有任何数据变化。首页会说明如何让 Agent 生成展示页、预览并在 `/admin` 批准上线。
- 外部协议、公开 PCP 接口和数据都不变，所以不标 BREAKING；但这是可见行为变化，发布说明里要写明上面这一条。
- 定制站的起点仍是 `get_site` 下载的 `public-page-source.zip`，内容变为首页源码。Agent 需要按 `references/public-page.md` 自己调用公开接口读取资料，不能再沿用旧版的按 type 渲染代码。

## Capabilities

### New Capabilities

- `design-system`: Orbit O 品牌、共享 token、自带字体，以及带减少动效回退的动效规则。

### Modified Capabilities

- `protocol`: 新增「发现文档描述凭据、公开接口和上传」「OpenAPI 参数和安全要求与 MCP schema 同源」两条需求。与 `site` 一样，`protocol` 目前定义在尚未归档的 `oneself-mvp` 里，归档顺序相同。
- `site`: 修改「Original page behavior」——内置页始终显示固定首页，不再按 type 展示公开资料；新增首页内容、「不透露资料」、固定页脚、Skill 关于读取公开资料和打包 `@oneself/public-client` 的说明，以及资源在预览路径下可加载的需求。该需求目前定义在尚未归档的 `oneself-mvp` 变更里，`openspec/specs/site` 还不存在，所以必须先归档 `oneself-mvp`，再归档本变更。
- `access`: 新增管理端界面需求、所属人 OAuth 授权列表 `GET /admin/oauth-grants` 和「已批准设备」面板；内置页的预览链接定为 `/_preview/public-page/`。已有字段、路径和权限规则不变。
- `design-system` 同时写明品牌只约束内置界面，产品 Skill 不给定制站规定视觉规范。

## Impact

- `packages/public-page`：`index.html`（首页静态内容）、`styles.css`、`main.ts`（只引入样式、启动星空、复制按钮），新增 `brand.css`、`stars.ts`、字体、标志和首页测试；删除 `load.ts`、`render.ts`、`load.test.ts`、`render.test.ts`；`package.json` 去掉 `@oneself/public-client`。镜像里的 `public-page-source.zip` 内容随之变为首页源码。
- `packages/public-client`：保留，代码不改。内置页不再引用它；它仍是公开接口的类型化客户端，Skill 说明定制站可以用它，但必须打进站点构建产物。
- `packages/public-page/vite.config.js`：加 `base: "./"`，让内置页在 `/_preview/public-page/` 下也能加载资源。
- `apps/admin`：`index.html`、`main.ts`、`styles.css`、`views.ts`、`ui.ts`、`browser.ts`、`http.ts`、`types.ts`，新增 `brand.css`、字体、标志、`stars.ts`、`sky.ts`、`icons.ts`、`parts.ts`、`overview.ts`、四个概览面板、DELETE 请求、`listOauthGrants` / `revokeOauthGrant` 请求和对应测试；路由表 `routes.ts` 不变。
- `apps/server/src/owner/static.ts`：给管理端静态文件补 `.woff2` 的内容类型，`ADMIN_PAGES` 加 `oauth-grants`（浏览器打开时落到管理端页面）；在 `tests/smoke/fixes.test.ts` 覆盖。站点服务逻辑不改。
- `apps/server/src/app/runtime.ts`：新增 `listOauthGrants(actor)`，读内存里的授权记录；`apps/server/src/owner/routes.ts`：新增 `GET /admin/oauth-grants`。`packages/db`、`packages/adapters`、`packages/domain`、`packages/operations` 和数据库迁移都不改（`listOauthGrants` 存储方法已经存在）。测试加在 `tests/smoke/`。
- `docs/PRD.md` 第 8 节、`docs/ARCHITECTURE.md` 里「原始页面」一行、`skills/oneself/references/public-page.md`、`tests/acceptance/skills.test.ts`。
- `packages/operations`：新增 `publicEndpoints`（匿名接口的名称、方法、路径）及测试，仍零依赖。
- `packages/domain`：新增 `files.ts`（`FILE_MEDIA_TYPES`、`MAX_FILE_BYTES`、`isFileMediaType`），`runtime.ts` 的上传和站点 zip 检查改用 domain 常量，值不变。
- `apps/server/src/pcp/`：`discovery.ts` 增加 `auth`、`public`、`uploads`；新增 `openapi.ts` 从 `operationSchemas` 生成 OpenAPI；`routes.ts` 的 multipart 字段名改读 `uploads`。`apps/server/src/app/schemas.ts` 加匿名接口的输入 schema。`tests/smoke/protocol.test.ts` 新增发现文档字段、OpenAPI 与 `tools/list` 参数一致、每个操作都声明 `security` 三条测试，`tests/smoke/support.ts` 加 `mcpTools`。
- `skills/oneself/SKILL.md`、`references/context.md`、`references/public-page.md`、`tests/acceptance/skills.test.ts`；`README.md`、`README_EN.md`、`docs/ARCHITECTURE.md` 第 9 节和 `docs/PRD.md` 的发现文档一句。
- 字体文件是随仓库提交的静态资源和许可证，不是 npm 依赖。
- 设计稿、样式原型和截图在本变更的 `design/` 目录，只作为实现参照，不进镜像。

## 发布说明

仓库没有 CHANGELOG，发布时把下面这段放进 release 说明：

- 新外观：内置首页和管理端改用 OneSelf 的轨道标志、夜空配色和随包发布的 Geist 字体，不请求任何外部资源；系统开启「减少动态效果」时不播放动画。
- 管理端概览新增「已批准设备」面板：列出经 OAuth 设备码批准的每一条授权（缩短的 id、授权范围、`site:write`、批准时间），可以两步确认后单独作废，下一次请求即失效。对应新增所属人接口 `GET /admin/oauth-grants`（需所属人会话和 `Accept: application/json`，不进 PCP 操作表、MCP 和 OpenAPI）。概览同时显示目录、API Key（可作废）和站点 release 的预览链接。
- 行为变化：内置页（站点指针为 `public-page`）现在始终是固定的产品首页，不再读取或展示公开资料。已有公开页、但没有激活定制站的安装，升级后 `/` 显示首页而不是资料；资料仍可经公开 PCP 接口读取。要恢复个人展示页，按首页说明让 Agent 用 `get_site → put_site → preview_site → activate_site` 生成展示页，再在 `/admin` 批准上线。
