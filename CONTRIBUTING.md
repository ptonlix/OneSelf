# 参与 OneSelf / Contributing

中文在前，英文在后。改代码前先读仓库根目录的 `AGENTS.md`，再读对应实现。

Chinese first, English after. Read `AGENTS.md` at the repository root before changing code, then read the implementation you are touching.

## 中文

### 事实来源

1. `docs/PRD.md` 决定做什么、不做什么。
2. `docs/ARCHITECTURE.md` 决定怎么分层、用什么依赖。
3. `openspec/specs/` 是已经生效的行为规格。`openspec/changes/` 里没归档的变更，只有被明确要求实现时才改代码。
4. `packages/operations` 是操作名、路径和错误码的唯一注册表。

文档和代码冲突时，先指出冲突。不要为了让测试通过去改规格。

影响对外行为、数据形状、发现文档或产品 Skill 的改动，先写 OpenSpec 变更，等明确要求后再实现。没有被要求时不要归档。

### 怎么改

- Node.js 24、pnpm。只用 `pnpm install` 和 `pnpm run <script>`。不要提交 `package-lock.json` 或 `yarn.lock`。
- 从当前 `main` 拉分支。
- 路由只做认证、解析和返回。领域规则不要直接查数据库或调用对象存储 SDK。
- 资料和站点操作只有一套。先改 `packages/operations`，再让 PCP 和 MCP 一起出现。`create_api_key`、`list_api_keys`、`revoke_api_key` 只走 HTTP，不进 MCP。
- 产品 Skill 只有 `skills/oneself/`。不要把它和 `.agents/skills/` 合成一套，也不要在 Skill 里写死某一台站点的 origin 或写入 API Key。
- 提交前运行 `pnpm check`。只改文档、且不动代码和 Skill 时，至少跑 `pnpm exec prettier --check` 覆盖你改过的文件。
- PR 里写明为什么、行为有没有变、你怎么验证的。

### 不要贴进 Issue、PR 或讨论

所属人密码、API Key 原文、OAuth 刷新令牌、对象存储密钥、带口令的 `DATABASE_URL`，以及 `data:export` 打出来的导出包。导出包里有口令哈希和密钥哈希。漏洞走 [SECURITY.md](SECURITY.md)。协作约定见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

### 可以先做的五件小事

下面每件都限制在已经写明的事实上，不新增产品能力。仓库里还没有对应的 Issue。维护者若要贴上 `good first issue`，用现成的这个标签即可（另外已有 `documentation`）。

1. **把中文 README 的「方式二：本地开发」补齐到和英文 README 同一层事实。** 英文已经写了：`pnpm dev` 会先构建管理端和内置公开页；进程在监听前应用迁移；缺少 `DATABASE_URL`、`OBJECT_STORAGE_*`、`apps/admin/dist` 或 `packages/public-page/dist` 时拒绝启动；还没有账号且没设 `OWNER_PASSWORD` 时也拒绝启动。中文这一节停在打开两个地址。只补这些已有事实，不要加新的启动条件。
2. **为 `docs/ARCHITECTURE.md` 加一页术语对照。** 建议 `docs/glossary.md`，只收文档里已经在用的词：所属人 / account owner、原件 / original、source、PCP、公开主页 / public homepage、批准 / approve、作废 / revoke。不要改 PRD，也不要发明新术语。然后在 `README_EN.md` 的架构那一行加上链接。
3. **用 `apps/cli/src/doctor.ts` 把 `bin/oneself doctor` 实际检查的项目写进两份 README。** 现在两份都只写「doctor 只检查」。读代码，列出它已经做的检查。不要给 doctor 加新检查。
4. **写一份 `docs/client-integration.md`，只整理现有的接入规则。** 读 `/.well-known/pcp`，在 API Key 和 OAuth 设备码里二选一，两种都要所属人批准；HTTP 与 MCP 同一组操作；错误体是 `{ error, message }`；公开页脚本使用 `credentials: omit`，不携带管理端 Cookie。不要把任何一个客户端产品写成已支持。可以链到「客户端接入」Issue 模板。
5. **让中文 README 的「项目结构」注释和英文 README 对齐。** 英文树写明了 `ports` 与 `adapters` 分开、`openspec/`，以及 Dockerfile 里有什么。中文树更短。只按仓库里真实的目录改注释，不要搬动代码。

效果 GIF 由维护者按 [docs/demo-gif-storyboard.md](docs/demo-gif-storyboard.md) 录。请不要提交含真实个人资料或密钥的录屏。

## English

### Sources of truth

1. `docs/PRD.md` decides what the product does and what it does not do.
2. `docs/ARCHITECTURE.md` decides layering, dependencies, and paths.
3. `openspec/specs/` is the behavior that is already in effect. An unarchived change under `openspec/changes/` is not something to implement unless someone explicitly asked for that change.
4. `packages/operations` is the only registry of operation names, paths, and error codes.

If docs and code disagree, stop and point at the conflict. Do not edit a spec so that a test goes green.

Changes to external behavior, data shape, discovery documents, or the product skill need an OpenSpec change first, and implementation waits until that change is explicitly requested. Do not archive a change unless asked.

### Making a change

- Node.js 24 and pnpm. Use `pnpm install` and `pnpm run <script>` only. Do not commit `package-lock.json` or `yarn.lock`.
- Branch from current `main`.
- Routes authenticate, parse, and respond. Domain rules do not query the database or call the object-storage SDK.
- Page and site operations exist once. Change `packages/operations` first, then expose the operation through both PCP and MCP. `create_api_key`, `list_api_keys`, and `revoke_api_key` are HTTP-only and must not become MCP tools.
- The only product skill is `skills/oneself/`. Do not merge it with `.agents/skills/`. Do not hard-code an instance origin into that skill, and do not put an API key in it.
- Run `pnpm check` before submitting. For a docs-only change that does not touch code or the skill, at least run `pnpm exec prettier --check` on the files you edited.
- In the pull request, say why, whether behavior changed, and how you checked.

### Never paste these into an issue, pull request, or discussion

Owner passwords, API key secrets, OAuth refresh tokens, object-storage secrets, a `DATABASE_URL` that contains a password, or an archive produced by `data:export`. That archive contains password hashes and key hashes. Vulnerabilities go through [SECURITY.md](SECURITY.md). The collaboration agreement is [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

### Five small issues to pick up

Each one stays inside facts the repo already states. None of them adds a product capability. There is no tracking issue for these yet. Maintainers can apply the existing `good first issue` and `documentation` labels.

1. **Bring the Chinese "方式二：本地开发" section up to the facts already in the English README.** The English page already says `pnpm dev` builds the admin UI and the built-in public page first, the process applies migrations before it listens, and it refuses to start when `DATABASE_URL`, `OBJECT_STORAGE_*`, `apps/admin/dist`, or `packages/public-page/dist` is missing, or when no account exists and `OWNER_PASSWORD` is unset. The Chinese section stops at opening the two URLs. Add those existing facts only. Do not invent new startup checks.
2. **Add a glossary beside `docs/ARCHITECTURE.md`.** Suggested path: `docs/glossary.md`. Include only terms the docs already use: 所属人 / account owner, 原件 / original, source, PCP, 公开主页 / public homepage, 批准 / approve, 作废 / revoke. Do not change the PRD and do not coin new terms. Link the glossary from the architecture line in `README_EN.md`.
3. **Document the checks `bin/oneself doctor` already performs, using `apps/cli/src/doctor.ts`.** Both READMEs only say that doctor checks. Read the command and list the checks it already runs. Do not add checks.
4. **Add `docs/client-integration.md` by restating the connection rules that already exist.** Read `/.well-known/pcp`, choose an API key or the OAuth device flow, and have the owner approve either one. HTTP and MCP share one operation table. Errors are `{ error, message }`. Public-page scripts use `credentials: omit` and do not send the admin cookie. Do not name any client product as supported. You can link the client-integration issue template.
5. **Align the Chinese "项目结构" comments with the English tree.** The English tree already separates `ports` and `adapters`, mentions `openspec/`, and says what the Dockerfile carries. The Chinese tree is shorter. Edit comments to match the directories that are actually in the repo. Do not move code.

The demo GIF is recorded by a maintainer from [docs/demo-gif-storyboard.md](docs/demo-gif-storyboard.md). Do not commit a recording that contains real personal context or secrets.
