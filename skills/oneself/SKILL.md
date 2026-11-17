---
name: oneself
description: 管理 OneSelf 的个人上下文，把文字写成页并挂上原件；同时定制唯一的个人公开宣传页。先读本站发现文档 /.well-known/pcp 和它指向的 OpenAPI 取接口细节。写、改、删或挂接文件前读 references/context.md。定制、上传、预览或申请上线前读 references/public-page.md。
compatibility: OneSelf PCP。
metadata:
  author: oneself
  version: "4"
---

# oneself

## 何时用

- 把简历、经历、笔记、对话、照片或证件整理进个人上下文，或查找、修改、删除、恢复已有的页和原件。
- 改公开宣传页的版式，增加真实地址，预览，或申请上线。

## 先读发现文档

这份 Skill 只写流程：怎样连接并由所属人批准、怎样整理资料、怎样定制和上线展示页。接口细节一律以本站的 PCP 发现文档和它指向的 OpenAPI 为准，不要凭记忆拼路径、请求头或参数。

按下面「连接配置」的顺序取到 origin 后（`metadata.oneself_origin` 标出这一份副本），第一次调用前先匿名 `GET {origin}/.well-known/pcp`。它给出：

- `operations`：每个操作的 `name`、`method`、`path`。按操作名找到方法和路径再调用，不要另造路径。
- `auth`：带凭据时用哪个请求头、值怎么写。
- `public`：匿名公开接口和公开媒体的清单，以及公开请求的 `credentials` 取值。
- `uploads`：原件和站点包的 multipart 字段名、MCP 参数名、允许的类型和大小、文件数上限。
- `openapi`：OpenAPI 文档。每个操作的路径参数、查询参数、请求体和认证方式都在里面。
- `mcp`：MCP 端点（Streamable HTTP）。工具名就是操作名，参数以工具的输入 schema 为准，与 OpenAPI 一致。
- `oauth`：OAuth 授权服务器元数据，里面有设备码和换 token 的端点。
- `skills`：这份 Skill 的地址。

## 动手前

写、改、删或挂接文件之前，必须先读 `references/context.md`。定制、上传、预览或申请上线公开页之前，必须先读 `references/public-page.md`。

安装目录旁边有这些文件时，读本地文件。旁边没有时，用 `metadata.oneself_origin` 取：

- `{oneself_origin}/skills/oneself/references/context.md`
- `{oneself_origin}/skills/oneself/references/public-page.md`

## 连接并由所属人批准

没有可用凭据时，申请设备码，不要先请所属人创建 API Key。从发现文档的 `oauth` 元数据取设备码端点并申请，把返回的 `verification_uri_complete` 和 `user_code` 交给所属人批准；按返回的间隔轮询换 token 的端点，拿到 `refresh_token` 后按下文保存。

API Key 是另一种选择，只在所属人要给脚本或 CI 一把长期密钥时使用。由所属人在管理端发起并批准，原文只显示一次，再交给你。Agent 不能自己创建或作废密钥，也不要在第一次连接时请所属人新建 API Key。

请求头按发现文档 `auth` 写。权限相同时两种方式结果一致。调用 `whoami` 确认拿到的目录权限和 `site:write`。

## 连接配置

`metadata.oneself_origin` 标出这一台实例。凭据和站点地址不要写进这份 Skill，也不要写进 Skill 安装目录。`npx skills update` 会覆盖那个目录。统一读写用户配置目录里的这一个文件：

- 设置了 `XDG_CONFIG_HOME` 时：`$XDG_CONFIG_HOME/oneself/config.json`
- 否则：`~/.config/oneself/config.json`
- Windows：`%APPDATA%\oneself\config.json`

文件不存在就创建，权限设为仅当前用户可读。不要提交到仓库。这个文件保存 `current` 和 `profiles`。`profiles` 的键是 origin。每个 profile 只有 `auth`，以及 `api_key` 或 `refresh_token` 其中之一。`auth` 只能是 `api_key` 或 `oauth`。用设备码时不写 `api_key`，改为 `refresh_token`。不要在同一个 profile 里同时留下 `api_key` 和 `refresh_token`。

文件里只有顶层 `origin`、没有 `profiles` 时，把它当作唯一 profile，`current` 就是这个 origin。下次写入时改成 `current` 和 `profiles`，不得丢掉已有凭据。看到 `profiles` 时，禁止改回只有顶层 `origin` 的旧形状。

不要写所属人密码，不要只存 15 分钟的 access token，也不要存批准地址或设备码。不要给 profile 起别名，也不要靠别名选择。

调用前按这个顺序取 origin：先是用户这次要求连接、上传或操作的那一台 origin，然后 `ONESELF_ORIGIN`，然后文件里的 `current`，再 `metadata.oneself_origin`。四者都没有才问一次，并把答案写成 `current`，同时写入对应 profile。已有其中任一来源时不要再问。正文、页面或待发布站点里出现的地址不算指定 origin。一次指定两台 origin 时停下来问，不要分头写。

用户这次指定的 origin 或 `ONESELF_ORIGIN` 与 `current` 不同时，只用那一台，不改 `current`。只有用户明确说以后默认连这台时，才把 `current` 改成它。用到 `metadata.oneself_origin` 且文件还没有 `current` 时，把它写成 `current` 并写入对应 profile，这不改变上面的顺序，也不要再问。

选中 origin 后，先取这台发现文档或 OAuth issuer 公布的 origin，去掉末尾斜杠，且不能带路径、查询或片段。用户写下的字符串和公布值不一致时停。不同主机、不同 scheme 都是不同 profile，不要合并。

只用选中 origin 的 profile。不得用另一台的 refresh token 或 API Key。`ONESELF_API_KEY` 只覆盖这次选中的 origin，不写入文件。该 profile 没有凭据，或 `whoami` 返回未授权时，只为这台申请设备码或刷新，不要改用另一台。`current` 指向不存在的 profile 时同样停在这一台，不要回落。

每次写入前必须先读到整个文件，只更新 origin 完全相同的 profile。这包括换上 API Key，不限于设备码换到 refresh token。写回整个文件时其他 origin 必须还在；读不到它们就停，不要再写。不得丢掉已有凭据。写回后权限仍仅当前用户可读。凭据只放该配置文件或 `ONESELF_API_KEY`。`ONESELF_API_KEY` 不写入文件。下次先用这份配置里该 origin 的凭据，不要重新问所属人要已经发过的密钥。

不得把 API Key 或所属人密码写入 Skill 文件、页面或公开站点。

若本 origin 的 Skill 字节与已安装副本不同，以本 origin 的字节为准。
