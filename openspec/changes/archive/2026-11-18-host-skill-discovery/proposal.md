# Proposal

## Why

两份产品 Skill 会让 `npx skills add` 装出两个要勾选的 Skill，但它们共用一个站点、一套凭据和同一个配置文件。产品身份应是一个 `oneself`。当前站点也没有安装器要的 `/.well-known/agent-skills/index.json`，装到本地的副本不知道该连哪一台实例。

## What Changes

- **BREAKING** 产品 Skill 只保留一个名字 `oneself`。`get_skill` 不再接受 `context-management` 或 `public-page`。`/.well-known/pcp` 的 `skills` 只保留 `oneself`，指向这台站点的 `SKILL.md`。`/skills/context-management.md` 与 `/skills/public-page.md` 不再提供。
- 仓库布局改为 `skills/oneself/SKILL.md` 加 `references/context.md`、`references/public-page.md`。入口只写连接和该读哪一份 reference。写页规则与公开页规则分别留在两份 reference 里，不拼进入口。
- 应用提供 `GET /.well-known/agent-skills/index.json`。索引只有一条 `oneself`，`type` 为 `archive`，因为安装必须带上 `references/`。`url` 指向由应用生成的压缩包，`digest` 是该压缩包原始字节的 SHA-256。
- 压缩包根目录是插入了 `metadata.oneself_origin` 的 `SKILL.md`，以及两份 reference。单独的 `GET /skills/oneself/SKILL.md` 与 `GET /pcp/v1/skills/oneself` 是同一份入口字节。reference 也可按 `/skills/oneself/references/<file>` 单独读取。请求的 `Host` 不能改写 origin。
- 入口指定客户端配置文件：`$XDG_CONFIG_HOME/oneself/config.json`，否则 `~/.config/oneself/config.json`；Windows 为 `%APPDATA%\oneself\config.json`。其中保存 origin，以及 API Key 或 refresh token。密钥不写入 Skill 文件、Skill 安装目录、页面或公开站。
- 不创建 skills.sh Pack，不把安装索引放进站点 zip。不改 PCP 操作表、站点指针 `public-page` 或源码包名 `public-page-source.zip`。

## Capabilities

### New Capabilities

- `skill-discovery`: 站点作为唯一产品 Skill 的安装源。包括 well-known 索引、archive、实例 origin、reference 的读取地址，以及客户端配置文件。

### Modified Capabilities

- 无。`openspec/specs/` 里还没有已归档能力。本变更取代 `oneself-mvp` 里两份 Skill 的名字和路径；既有必写句子改由两份 reference 承担，且正文仍不出现服务端框架名。

## Impact

- `apps/server` 改为只登记 `oneself`，生成 archive 和索引，并在发出入口前写入 origin。
- `skills/` 从两个平铺 Markdown 收成一个目录。发现文档、`get_skill`、验收测试、架构路径表和 README 一起改。
- 已按旧名字接入的客户端必须改读 `oneself`。没有已发布的稳定客户端依赖这两份旧名字。
