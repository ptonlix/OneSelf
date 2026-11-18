# Tasks

按节顺序做。每条做完先跑括号里的测试，再勾选。设计参照本变更的 `design/`，与 `design.md` 冲突时以 `design.md` 为准。

## 1. 品牌与 token

- [x] 1.1 新建 `packages/public-page/src/brand.css`，按 `design/assets/brand.css` 写入颜色、字体、字号、圆角、通用组件和动效类，把 `--fg-3` 改为 `#7a7e9c`，并加 `prefers-reduced-motion: reduce` 下取消动画和过渡的规则。复制为 `apps/admin/src/brand.css`。新增 `apps/admin/src/brand.test.ts` 断言两份字节相同，并断言文件里没有 `http://` 或 `https://` 资源地址。（`pnpm exec vitest run apps/admin/src/brand.test.ts`）
- [x] 1.2 取 Geist 与 Geist Mono 的可变字体 woff2 和 `OFL.txt`，放进 `packages/public-page/src/fonts/` 与 `apps/admin/src/fonts/`，各附一份 `README.md` 写明来源和版本。`brand.css` 用相对路径 `@font-face` 引用，`font-display: swap`，中文回退按 `design.md` 决定 7。`brand.test.ts` 补断言：两边字体文件字节相同，且都有 `OFL.txt`。（同上）
- [x] 1.3 把 `docs/images/logo.svg` 复制为 `packages/public-page/public/favicon.svg` 和 `apps/admin/public/favicon.svg`，两个 `index.html` 加 `<link rel="icon" type="image/svg+xml">`。`brand.test.ts` 断言两份与 `docs/images/logo.svg` 字节相同。（同上）
- [x] 1.4 `apps/server/src/owner/static.ts` 的 `adminContentType` 加 `.woff2 → font/woff2`。在 `tests/smoke/fixes.test.ts` 的假管理端产物里放一个 `assets/x.woff2`，断言响应类型是 `font/woff2`。（`pnpm exec vitest run tests/smoke/fixes.test.ts`）
- [x] 1.5 两个包各跑一次生产构建，确认产物里有带哈希的 woff2、`favicon.svg`，HTML 和 CSS 里没有外部字体或脚本地址。`packages/public-page/src/build.test.ts` 补断言：产物 HTML 仍只有 `index.html`，且没有 `fonts.googleapis.com` 或 `https://` 资源。（`pnpm exec vitest run packages/public-page/src/build.test.ts`）

## 2. 内置页改为固定首页

- [x] 2.1 按 `design/home.html` 把首页写进 `packages/public-page/index.html`（不依赖脚本）：导航与标志、slogan、中文主张、理念、效率与隐私、「公开」的含义（`visibility: public`、`/pcp/v1/public/*` 匿名可读、改回 `private` 即不可见）、「安装 Skill」一节（可复制的 `npx skills add https://<你的站点>`，占位符明显标出，脚本运行时换成 `location.origin`；说明安装器读 `/.well-known/agent-skills/index.json`，备选是直接读 `/skills/oneself/SKILL.md`；三张卡：用 OAuth 设备码在 `/admin/device` 或 API Key 在 `/admin/api-keys/new` 连接，让 Agent 上传和管理资料，让 Agent 定制展示页，见 `design.md` 决定 16）、GitHub 链接 `https://github.com/ptonlix/OneSelf`（导航、收尾卡、页脚）、让 Agent 生成展示页的四步和 `get_site → put_site → preview_site → activate_site → 在 /admin 批准`、Agent 接入路径 `/.well-known/pcp`、`/mcp`、`/openapi.json`、`/skills/oneself/SKILL.md`、`/admin` 入口，以及固定页脚 `Powered by OneSelf`（不读任何配置，见 `design.md` 决定 13）。不列任何 type 或字段清单，不显示公开页数，不放任何服务端安装或部署命令。`src/main.ts` 只引入 `brand.css`、`styles.css`，启动星空，并给复制按钮接上 `navigator.clipboard.writeText`。
- [x] 2.1a 按所属人要求：去掉 Hero 下的「安装 Skill」「生成我的展示页」两个按钮，调整轨道主视觉的间距（1440 与 390 下核对）；安装命令和接入路径 `/.well-known/pcp`、`/mcp`、`/openapi.json`、`/skills/oneself/SKILL.md`、`/.well-known/agent-skills/index.json`、`/admin/device`、`/admin/api-keys/new` 等加 `data-origin`，`main.ts` 在 `http:`/`https:` 页面上用 `location.origin` 填入并让复制按钮复制填好的值，origin 为 `"null"` 或无脚本时保留占位符和路径（决定 4、16）。`main.test.ts` 断言填入值、复制值、`file://` 回退；`home.test.ts` 断言没有 Hero 按钮、每个标记都有回退文本、HTML 不含绝对地址。（`pnpm exec vitest run packages/public-page`）
- [x] 2.1b 按所属人要求把「Agent 接入」并进「安装 Skill」一节：导航去掉 `#agents`；三张流程卡下加「接口细节」块（可复制的 `/.well-known/pcp`，`/openapi.json`、`POST /mcp`、OAuth 元数据，边界一句），收尾卡移到展示页一节末尾。`SKILL.md` 加「先读发现文档」「连接并由所属人批准」，references 去掉发现文档已给出的操作路径。`home.test.ts` 断言只有一节且含安装命令、三卡和发现文档；`tests/acceptance/skills.test.ts` 断言先读发现文档、认证请求头、除公开接口外不写 `/pcp/v1/` 路径。（`pnpm exec vitest run packages/public-page tests/acceptance`）
- [x] 2.2 删除 `packages/public-page/src/load.ts`、`render.ts`、`load.test.ts`、`render.test.ts`，`package.json` 去掉 `@oneself/public-client` 并更新 `pnpm-lock.yaml`。`main.test.ts` 改为断言：源码不引用 `@oneself/public-client`、`fetch`、`/pcp/v1/public/`、`/media/`、`packages/domain`、`packages/db` 或 `/resume`。（`pnpm exec vitest run packages/public-page/src/main.test.ts`）
- [x] 2.3 新增 `packages/public-page/src/home.test.ts`，读 `index.html` 断言：含 `One self. One context. Every AI.`、`visibility: public`、`/pcp/v1/public/`、`get_site`、`put_site`、`preview_site`、`activate_site`、`/.well-known/pcp`、`/mcp`、`/openapi.json`、`/skills/oneself/SKILL.md`、`href="/admin"`、`Powered by OneSelf`、`npx skills add https://` 紧跟占位符 `&lt;你的站点&gt;`、`/.well-known/agent-skills/index.json`、`/admin/device`、`/admin/api-keys/new`、`href="https://github.com/ptonlix/OneSelf"`；不含 `<article`、`data-type`、`data-field`、`私有页`、`/resume`、`experience`、`education`、`docker`、`compose up`、`git clone`、`pnpm install`，也不含 `ptonlix/OneSelf` 形式的 `npx skills add` 命令；除 GitHub 链接和带占位符的安装命令外，不含任何 `http://` 或 `https://` 地址（站点地址只由脚本在浏览器里填入）。（`pnpm exec vitest run packages/public-page/src/home.test.ts`）
- [x] 2.4 `build.test.ts` 把对 `id="app"` 的断言改为对 slogan 的断言，保留「产物只有 `index.html`、`/resume`、`/missing`、`/blog` 返回 404」。（`pnpm exec vitest run packages/public-page/src/build.test.ts`）
- [x] 2.5 `src/stars.ts` 按 `design.md` 决定 11 画星空（固定种子、`aria-hidden`、页面隐藏时停止、减少动效时只画一帧）。在 `main.test.ts` 用 `matchMedia` 假实现断言减少动效时不启动动画循环。（`pnpm exec vitest run packages/public-page/src/main.test.ts`）
- [x] 2.6 `tests/smoke/site.test.ts` 补一条：所属人写入一页公开 `profile` 前后，指针为 `public-page` 时 `/` 的响应体相同，且不含该页标题。（`pnpm exec vitest run tests/smoke/site.test.ts`）
- [x] 2.7 改写 `skills/oneself/references/public-page.md`：「原始页面能展示的公开字段」一节改为「内置页只是介绍」，写明内置页不读取、不展示资料，展示页由 Agent 按公开资料生成；删掉按 type 列字段（`name`、`title`、`org`、`start`、`end` 等）的内容；「怎么定制」里「没有公开页时，内置页只显示空状态」和「只是换皮时保留运行时读取」两句按新行为改写。整份文件只讲流程和约束：哪些数据是公开的（`visibility: public` 的页及其引用的原件，其他都读不到）、用哪些站点工具（`get_site`、`put_site`、`preview_site`、`activate_site`、`list_sites`）、先 `/_preview/{id}/` 预览再由所属人在 `/admin` 批准。明确写一句「不规定任何视觉规范」：不提供设计 token、品牌样式表、配色、字体要求或 `data-*` 钩子（文件里不写 `brand.css` 字样，验收测试断言它不出现），样式和版式由所属人与 Agent 自定。保留接口清单、公开单页返回字段、`credentials: omit`、`/media/{id}`、真实路径和保留路径规则。同步修改 `tests/acceptance/skills.test.ts`：去掉对「原始页面能展示的公开字段」和 `name`、`org`、`start`、`end` 的断言，改为断言新标题、接口清单、四个站点工具和「不规定任何视觉规范」都在，且文件不含 `brand.css`、`--teal`、`--orbit`、`data-field`、`data-type`。
  同一文件新增「读取公开资料」一节（`design.md` 决定 14）：公开 HTTP 接口是契约；可以用 `@oneself/public-client`，它是未发布的 `private` 包、服务器不提供、release 只是静态文件，所以必须在构建时打进产物，有仓库就复制 `packages/public-client/src/client.ts`；不能在运行时安装、不能从 CDN 引入；拿不到仓库就用 `fetch` 加 `credentials: "omit"` 直接调接口；上传前确认产物里没有对 `@oneself/public-client` 的裸 import。「怎么定制」的构建一步加一句：资源用相对路径（Vite 为 `base: "./"`），否则 `/_preview/{id}/` 会加载线上路径的文件。验收测试再断言：文件含 `@oneself/public-client`、`packages/public-client/src/client.ts`、「打进」构建产物的说明、`credentials: omit` 和相对路径的说明；不含 `npm install @oneself/public-client`、`esm.sh`、`unpkg`、`jsdelivr`。（`pnpm exec vitest run tests/acceptance/skills.test.ts tests/smoke/protocol.test.ts`）
- [x] 2.8 改写 `docs/PRD.md` 第 8 节「没有公开页时……其他 `type`」一段和 `docs/ARCHITECTURE.md` 的「原始页面」一行：内置页是固定首页，个人展示页由 Agent 生成、所属人批准上线。
- [x] 2.9 `packages/public-page/vite.config.js` 加 `base: "./"`（保留 `appType: "mpa"`）。`build.test.ts` 断言产物 `index.html` 里的 `src` 和 `href` 都不以 `/assets/` 开头、引用的脚本和样式都在 `./assets/` 下，CSS 里的字体地址也是相对地址。6.1 时在激活了定制 release 的实例上打开 `/_preview/public-page/`，确认样式、字体和星空都加载。（`pnpm exec vitest run packages/public-page/src/build.test.ts`）

## 3. 管理端外壳与现有界面

- [x] 3.1 `apps/admin/src/styles.css` 改为只写布局，`main.ts` 先引入 `brand.css`。`views.ts` 的 `Shell` 改为侧栏（标志、分组导航、当前项、登出）加顶栏（面包屑、查看公开主页 `/`）。导航项与 `routes.ts` 的路由一致。`views.test.ts` 断言侧栏含六个入口且当前路由有 `aria-current="page"`。（`pnpm exec vitest run apps/admin/src/views.test.ts`）
- [x] 3.2 `LoginView` 与 `PasswordView` 按 `design/admin-login.html`、`admin-password.html` 改版，字段名、`autoComplete` 和提交逻辑不变。`views.test.ts` 断言登录页提到 `OWNER_RESET_PASSWORD`、改密页有登出按钮。（同上）
- [x] 3.3 新增分段权限控件：每个 source 一行，读、写、改可见性三个原生 `checkbox` 包在 `label` 里，状态仍走 `forms.ts` 的 `toggleDraft`。`DeviceApprovalView`、`ApiKeyCreateView` 改用它，并加右侧授权摘要。`views.test.ts` 现有用例保持通过：提示句在「确认」按钮之前、设备码页不出现密钥。（同上，外加 `apps/admin/src/forms.test.ts`）
- [x] 3.4 `ApiKeyCreateView` 加请求体预览，内容就是 `createApiKeyBody` 的结果。`views.test.ts` 断言预览里 `unrestricted_data` 为真时 `sources` 为空数组。（`pnpm exec vitest run apps/admin/src/views.test.ts`）
- [x] 3.5 `ApiKeyApprovalView` 改为一次性密钥卡：复制按钮、HTTP 两种请求头示例、申请详情，状态显示为中文标签。`views.test.ts` 断言原文只出现在确认后的视图里，确认前的视图不含 `osk_`。（同上）
- [x] 3.6 `SiteCreateView` 与 `SiteApprovalView` 按 `design/admin-site.html` 改版：当前指针对目标 release、`/_preview/{id}/` 链接（`public-page` 时链接 `/_preview/public-page/`，不用 `/`）、按 `expires_at` 计算的剩余时间、确认与拒绝。`views.test.ts` 断言预览链接和两个按钮存在、目标为 `public-page` 时链接是 `/_preview/public-page/`，过期申请不显示确认按钮。（同上）

## 4. 概览新面板

- [x] 4.1 `http.ts` 的 `HttpRequest.method` 加 `DELETE`，新增 `listApiKeys`、`revokeApiKey`、`sourceStatus`、`listSites`、`listPublicPages` 及解析器，`types.ts` 加对应类型。`listPublicPages` 用 `credentials: "omit"`。`http.test.ts` 覆盖：路径和方法、`listPublicPages` 不带 Cookie、响应里出现 `key` 字段时抛 `ParseError`、未知形状抛 `ParseError`。（`pnpm exec vitest run apps/admin/src/http.test.ts`）
- [x] 4.2 `HomeView` 改为概览：目录轨道图和四个数字、三张快捷卡、API Key 列表、站点面板。数据在 `ui.ts` 里并发拉取，单个面板失败只在该面板显示错误。`views.test.ts` 用固定数据断言：作废过的 Key 显示 `revoked` 且没有作废按钮、列表不出现 `osk_`、release 行有 `/_preview/` 链接、提示句出现在站点面板。（`pnpm exec vitest run apps/admin/src/views.test.ts`）
- [x] 4.3 作废流程：第一次点击变为「确认作废」，第二次才调用 `revokeApiKey`，成功或 `conflict`、`not_found` 后都重新拉取列表。`views.test.ts` 断言两步状态；`http.test.ts` 断言 `DELETE /pcp/v1/api-keys/{id}`。（`pnpm exec vitest run apps/admin/src/views.test.ts apps/admin/src/http.test.ts`）
- [x] 4.4 站点面板里指针为 `public-page` 时的预览链接是 `/_preview/public-page/`，release 行是 `/_preview/{id}/`，都不链接 `/`。`views.test.ts` 断言。（`pnpm exec vitest run apps/admin/src/views.test.ts`）

## 5. 已批准设备（OAuth 授权列表）

- [x] 5.1 `apps/server/src/app/runtime.ts` 新增 `listOauthGrants(actor)`：放在 `this.exclusive` 里，经 `#ownerActor` 鉴权，从 `#grants` 按 `created_at`、`id` 排序，逐条只拷贝 `id`、`site_write`、`sources`（`id`、`read`、`write`、`visibility`）、`created_at`、`revoked_at`（未作废为 `null`），返回 `ok({ oauth_grants })`。不改 `packages/db`、`packages/adapters`、`packages/domain`、`packages/operations` 和迁移。
- [x] 5.2 `apps/server/src/owner/routes.ts` 的 `mountOwner` 注册 `GET /admin/oauth-grants`：`Accept` 不含 `application/json` 时交给后面的管理端页面；否则调用 `runtime.listOauthGrants`，失败用 `sendError`，成功用 `sendJson`。作废沿用已有的 `POST /admin/oauth-grants/:id/revoke`，不改。
- [x] 5.3 在 `tests/smoke/fixes.test.ts`（与「lets the owner revoke one oauth grant」放在一起）补冒烟测试：所属人批准设备码并换到令牌后，`GET /admin/oauth-grants` 返回一条，`sources`、`site_write` 与批准时一致，`revoked_at` 为 `null`，每条的键正好是五个字段；响应体不含访问令牌、刷新令牌、`refresh`、`token`、`hash` 字样和任何 64 位十六进制串；作废后再列，该条 `revoked_at` 非空且仍在列表里；没有 Cookie 为 `unauthorized`，API Key 和 OAuth 令牌为 `forbidden`，未改密的所属人为 `password_change_required`；不带 `Accept: application/json` 时返回管理端页面而不是 JSON；`/openapi.json` 和 `tools/list` 里没有 `oauth-grants`。（`pnpm exec vitest run tests/smoke/fixes.test.ts`）
- [x] 5.4 `apps/admin/src/http.ts` 新增 `listOauthGrants`（`GET /admin/oauth-grants`，`Accept: application/json`）和 `revokeOauthGrant`（`POST /admin/oauth-grants/{id}/revoke`），`types.ts` 加 `OauthGrant` 类型。解析器只接受上面五个字段的形状，字段名含 `token`、`refresh` 或 `hash` 时抛 `ParseError`。`http.test.ts` 覆盖路径、方法、带 Cookie、令牌类字段被拒、未知形状被拒。（`pnpm exec vitest run apps/admin/src/http.test.ts`）
- [x] 5.5 概览加「已批准设备」面板（按 `design/admin-overview.html`）：每行缩短的 id、授权摘要、`site:write`、批准时间；已作废的显示 `revoked` 和作废时间，没有按钮；不显示名称、最近使用时间或过期时间。作废两步确认，第二次点击才调 `revokeOauthGrant`，成功或 `not_found` 后都重新拉取；本面板失败不影响其他面板。设备码批准页授权摘要下加一句「之后可在概览的「已批准设备」里单独作废这条授权，下一次请求即失效」。`views.test.ts` 断言两步状态、已作废行没有按钮、面板里不出现令牌，以及设备码页的提示句。（`pnpm exec vitest run apps/admin/src/views.test.ts`）

## 6. 收尾

- [x] 6.1 在 1440 宽和 390 宽下分别打开首页和每个管理端界面，与 `design/shots/` 对照；再打开系统的减少动效设置检查一遍。把与稿件不一致、且 `design.md` 没写明的地方记进本节。
  对照结果（无头 Chromium，1440×900 与 390×844，另开 `prefers-reduced-motion: reduce` 各看一遍；减少动效时 `.rise` 的 `animation-name` 为 `none`，星空只画一帧）：首页、登录、概览、批准设备码、发起与批准 API Key、站点上线与稿件一致或只差文案。与稿件不同、`design.md` 原先没写的地方已补进决定 17：站点批准页不嵌预览、改密页没有强度条、权限行不显示页数、确认按钮文字保持「确认」。另外：设备码保留可编辑的单个输入框，不拆成逐字方格；登录页页脚文案写全为「Argon2id 密码哈希 · HttpOnly 会话 · 每个 IP 每分钟最多 10 次登录」；390 宽下侧栏折成顶部横向导航。2.9 的检查在激活了定制 release 的实例上做过：`/_preview/public-page/` 的样式、两款字体和星空画布都加载，没有 4xx 资源。
- [x] 6.2 运行 `pnpm run typecheck`、`pnpm run boundaries`，再运行 `pnpm run check`。`packages/public-client` 保留、代码不改，确认 `pnpm run knip` 对它没有报错，`tests/acceptance/skills.test.ts` 只改了 2.7 那几条断言。HTTP 路由只多了 `GET /admin/oauth-grants`；PCP 操作表、错误码、数据库迁移、`public-page` 指针名、`public-page-source.zip` 文件名和 `site-files/routes.ts` 未变。
- [x] 6.3 发布说明写明新增的「已批准设备」面板和 `GET /admin/oauth-grants`，以及：有公开页但没有激活定制站的安装，升级后 `/` 显示首页而不是资料；按首页说明让 Agent 生成展示页并在 `/admin` 批准即可恢复展示。

## 7. 接口细节进发现文档和 OpenAPI，Skill 只讲流程

- [x] 7.1 `packages/operations` 新增 `publicEndpoints`（`public_sources`、`public_pages`、`public_page`、`public_search`、`media`），`registry.test.ts` 锁住清单。`packages/domain` 新增 `files.ts`（`FILE_MEDIA_TYPES`、`MAX_FILE_BYTES`、`isFileMediaType`），`runtime.ts` 改用 domain 常量（值不变）。（`pnpm exec vitest run packages/operations`）
- [x] 7.2 `apps/server/src/pcp/discovery.ts` 增加 `auth.headers`、`public`、`uploads`，版本仍为 `1`、原有字段不变；`routes.ts` 的 multipart 字段名改读 `uploads.*.field`。（`pnpm exec vitest run tests/smoke/protocol.test.ts`）
- [x] 7.3 新增 `apps/server/src/pcp/openapi.ts`：从 `operationSchemas`（及 `schemas.ts` 新增的 `publicSchemas`）生成路径参数、GET 查询参数或 JSON `requestBody`，上传为 multipart（字段、限制、`x-oneself-upload`）；每个操作声明 `security`，`components.securitySchemes` 列 `apiKey`、`apiKeyHeader`、`oauthBearer`、`ownerSession`；匿名接口 `security: []`。
- [x] 7.4 `tests/smoke/protocol.test.ts` 新增：发现文档的 `auth`、`public`、`uploads` 精确等于预期且来自 domain 常量、每条匿名接口都有路由；OpenAPI 参数与 `tools/list` 的输入 schema 逐个操作一致（上传比 MCP 参数和 multipart 字段）；每个操作都有 `security`。手动给一个操作 schema 加字段时，参数一致性测试会失败。（同上）
- [x] 7.5 `SKILL.md`（版本 4）、`references/context.md`、`references/public-page.md` 去掉请求头、匿名接口清单、multipart 字段名、大小和数量限制与参数正则，改指发现文档 `auth`、`public`、`uploads` 和 OpenAPI；保留设备码、API Key 和站点上线的批准流程与 origin 规则。`tests/acceptance/skills.test.ts` 断言这些细节不出现、批准流程仍在。（`pnpm exec vitest run tests/acceptance/skills.test.ts`）
- [x] 7.6 `README.md`、`README_EN.md`、`docs/ARCHITECTURE.md` 第 9 节和 `docs/PRD.md` 发现文档一句补上新字段；首页「接口细节」一句改为提到认证方式、公开接口和上传限制。
- [x] 7.7 `design/home.html` 按实现更新（导航无「Agent 接入」、Hero 无按钮、「接口细节」并入安装 Skill 一节、地址按 `http://127.0.0.1:3000` 填好），重拍 `design/shots/home.jpg`、`home-fold.jpg`。
- [x] 7.8 `pnpm run check` 通过；`openspec validate redesign-orbit-ui --strict` 通过。

## 8. 首页文案去冗余

- [x] 8.1 `packages/public-page/index.html` 按 `design.md` 决定 19 精简文案：删去安装器细节、接口清单、「上线流程」卡、实现栈和重复说法，端点只留 `/.well-known/pcp`；`data-origin` 只剩安装命令和发现地址；`src/styles.css` 删掉不再使用的样式。2.1、2.1a、2.1b、2.3、7.6 里提到的 `/pcp/v1/public/`、`get_site` 链、四个接入路径、`SKILL.md` 备选和「接口细节」列表以本条为准。（`pnpm exec vitest run packages/public-page`）
- [x] 8.2 `src/home.test.ts` 新增断言：首页不含 `agent-skills`、`oneself.tar.gz`、`SKILL.md`、`/openapi.json`、`/mcp`、`/pcp/v1/`、`/media/`、`/admin/device`、`/admin/api-keys/new`、站点工具名、`credentials: omit`、`site:write` 和实现栈；`data-origin` 只有 `""` 和 `/.well-known/pcp`。（同上）
- [x] 8.3 `specs/site/spec.md` 首页各条按新文案改写；`design/home.html` 同步，重拍 `design/shots/home.jpg`、`home-fold.jpg`。
- [x] 8.4 `pnpm run check` 通过；`openspec validate redesign-orbit-ui --strict` 通过。

## 9. 首页大标志动效

- [x] 9.1 `packages/public-page/index.html` 的 Hero 和理念两个大标志改成可动结构（卫星与遮罩洞同组旋转，核心与光晕同组缩放，圆环单独慢转），`src/styles.css` 加动画，仅在 `prefers-reduced-motion: no-preference` 下生效；`design/home.html` 同步。几何与 `docs/images/logo.svg` 一致（`design.md` 决定 20）。
- [x] 9.2 无头 Chromium 下截 0、3、8 秒三帧确认卫星位置不同、缺口跟随；`prefers-reduced-motion: reduce` 下各帧相同且与原静态标志一致。`pnpm run check` 通过；`openspec validate redesign-orbit-ui --strict` 通过。

## 10. 标志周围的轨道和行星动效

- [x] 10.1 `packages/public-page/index.html` 的 Hero 和理念两处：三条轨道包进「倾角摆动 + 短轴呼吸」两层组，六颗行星放进同样嵌套的组并加 X/Y 两层平移，坐标改为轨道局部坐标；两圈同心圆分别加 `orb-dash`、`orb-fade`。`src/styles.css` 加对应动画（每颗行星的关键帧按轨道参数生成），仅在 `prefers-reduced-motion: no-preference` 下生效；`design/home.html` 同步（`design.md` 决定 21）。
- [x] 10.2 无头 Chromium 截 0、4、10 秒三帧和理念一节一帧，录约 8 秒的 Hero 视频，确认行星沿轨道运行、轨道摆动；减少动效时两帧逐像素相同。`pnpm run check` 通过；`openspec validate redesign-orbit-ui --strict` 通过。

## 11. 管理端动效、登录页页脚与找回提示

- [x] 11.1 `apps/admin/src/icons.ts`：`OrbitMark` 加 `animated`，大标志用与首页相同的结构（卫星、缺口、环、核心分组）；`LoginOrbit` 的三条轨道包进摆动和呼吸两层，四颗行星改为轨道局部坐标并加 X/Y 平移，两圈同心圆加 `orb-dash`、`orb-fade`；`SourceOrbit` 的中心标志动、内圈虚线流动。`styles.css` 加对应动画，只在 `prefers-reduced-motion: no-preference` 下生效；`brand.css` 不变（`design.md` 决定 22）。
- [x] 11.2 `views.ts`：`AuthFrame` 删掉页脚；登录页删掉找回说明，在「密码」标签旁加 `InfoTip`（`parts.ts`），悬停、聚焦、点按显示，Esc 收起。`views.test.ts` 改为断言提示文字和 `aria-describedby`，并断言删掉的文案不再出现、登录轨道图带动效类而顶栏小标志不带。
- [x] 11.3 稿件 `design/admin-login.html`、`admin-password.html` 改文案并重拍截图。无头 Chromium 截登录页（含提示与不含提示、390 宽）、约 6 秒登录页视频和概览轨道图两帧；减少动效时两帧逐像素相同。`pnpm run check` 通过；`openspec validate redesign-orbit-ui --strict` 通过。

## 12. 代码审查修正

- [x] 12.1 `apps/server/src/pcp/openapi.ts`：上传字段改为 `format: binary` 加 `contentMediaType`（多类型用 `anyOf`），类型取自 `uploads`；认证方案由 `authHeaders` 推出（`apiKeyHeader` 用 `X-Api-Key`，`oauthBearer` 用 `http bearer`，`ApiKey <key>` 只写进说明）；同状态码的错误码合并为一个带 `enum` 的响应。`tests/smoke/protocol.test.ts` 新增上传类型、按方案构造请求头和 403 响应三项测试（`design.md` 决定 23）。
- [x] 12.2 管理端：站点面板和站点上线页改用站点说明，读权限那句只留在凭据页，`views.test.ts` 断言两边；`OauthGrantView` 贯穿运行时、路由、管理端客户端和测试。
- [x] 12.3 两份 `stars.ts`：`stop()` 清理监听和 `ResizeObserver`，按尺寸和像素比重排重画，尺寸为 0 不画；`packages/public-page/src/main.test.ts` 补测试。新增 `apps/admin/src/logo.test.ts` 比对三处标志几何；`knip.json` 收窄忽略范围；决定 18 补充 PRD 说明。
- [x] 12.4 `pnpm run check` 通过；冒烟测试文件通过类型检查；`openspec validate redesign-orbit-ui --strict` 通过。
