# Design

## Context

见 `proposal.md`。安装器对非 Git 主机的 `https://` 地址会请求 `/.well-known/agent-skills/index.json`，按 `type` 下载单个 `SKILL.md` 或压缩包，并校验 `sha256:` 摘要。带 `references/` 的 Skill 必须用 archive，否则安装器只拿走入口。对外源来自配置的 public origin，不看请求 `Host`。`.well-known` 已是站点保留路径。

## Goals / Non-Goals

**Goals:**

- `npx skills add https://这台站点` 只出现一个 `oneself`。
- 写页和改公开页仍分文件，避免每次都把另一半规则读进上下文。
- 本地副本带有这台实例的 origin；更新时摘要能发现 archive 变化。

**Non-Goals:**

- 不创建 skills.sh Pack。
- 不在 Skill、索引或发现文档里放 API Key、所属人密码或私有页。
- 不改 PCP 操作表、`original` 指针或 `original-page-source.zip`。
- 不在站点 zip 里托管安装索引或 Skill archive。
- 不保留 `context-management` 与 `public-page` 作为 `get_skill` 名字或发现文档字段。

## Decisions

1. **一个安装单元，两份 reference。** 仓库是 `skills/oneself/SKILL.md`、`references/context.md`、`references/public-page.md`。入口只写连接、配置路径，以及动手前必须读哪一份 reference。必写句子留在 reference，不把两份正文拼进入口。备选是继续装两个 Skill；安装器会让用户勾选，而且配置文件只有一份，没有好处。

2. **索引用 archive，不用 skill-md。** 索引只有 `oneself`，`type` 为 `archive`。压缩包用 `.tar.gz`，根目录就是上述三个相对路径，不再套一层目录。`url` 为 `{origin}/skills/oneself.tar.gz`。摘要是这次发出的压缩包字节，不是仓库里的静态文件。备选是只发 `SKILL.md`；那样 `npx skills add` 不会带上 reference。

3. **origin 只写进入口的发出字节。** 仓库里的 `SKILL.md` 不写死 origin。服务 `SKILL.md` 和打进 archive 之前，在 frontmatter `metadata` 写入 `oneself_origin`。archive 里的 `SKILL.md` 必须和 `GET /skills/oneself/SKILL.md`、`GET /pcp/v1/skills/oneself` 相同。reference 不插入 origin。

4. **HTTP 上的 reference 用绝对地址补齐。** 入口写明：旁边有 `references/` 就读本地文件；没有就取 `{oneself_origin}/skills/oneself/references/context.md` 和 `public-page.md`。这样只下载了入口的 Agent 仍能按需读取。

5. **发现文档只留一个字段。** `skills.oneself` 指向 `SKILL.md`，不指向 archive。安装器走 agent-skills 索引，已接入的 Agent 走 PCP。旧字段 `context_management` 和 `public_page` 删除，不保留别名。

6. **客户端配置不进 Skill 目录。** 入口指定 `$XDG_CONFIG_HOME/oneself/config.json`，未设置时为 `~/.config/oneself/config.json`；Windows 为 `%APPDATA%\oneself\config.json`。保存 `origin`，以及 `api_key` 或 `refresh_token` 其中之一。origin 读取顺序是 `ONESELF_ORIGIN`、该文件、`oneself_origin`。API Key 先看 `ONESELF_API_KEY`。

7. **索引、入口和 archive 都 `no-store`。** 缓存旧索引会让摘要和压缩包对不上，安装器会静默跳过。

## Risks / Trade-offs

- [安装器过旧，不认 archive 或这份索引] → 文档要求使用会读 `/.well-known/agent-skills/index.json` 的 CLI。不为此再做 Pack。
- [入口没写强制阅读 reference，Agent 仍按入口猜测] → 入口用动手前的步骤指向 reference，而不是“详见参考”。
- [插入 frontmatter 破坏 YAML] → 只在 `metadata` 增加一个字符串。发出前确认 `name` 仍是 `oneself`，`description` 仍覆盖写页和改公开页。
- [用户从别人的站点执行 add] → 装到的是那台站点的 origin。密钥不会被带上。
- [旧客户端仍请求两个旧名字] → 明确返回 `not_found`，不在服务器里做别名。

## Migration Plan

先把仓库收成 `skills/oneself/`，应用改为只读这一份，并同时改发现文档、`get_skill` 和测试。再生成带 origin 的入口字节和 archive，最后挂上索引。回滚时恢复两个平铺文件和旧发现字段；已安装的 `oneself` 副本仍可用配置文件指向站点。

## Open Questions

无。产品 Skill 的名字、archive 而非两个 skill-md、以及删除旧发现字段，都已定死。
