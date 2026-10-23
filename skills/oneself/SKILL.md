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

按下面「连接配置」的顺序取到 origin 后（随站点下发的副本里就是 `metadata.oneself_origin`），第一次调用前先匿名 `GET {origin}/.well-known/pcp`。它给出：

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

没有可用凭据时，二选一，两种都要所属人在管理端确认：

- OAuth 设备码：从发现文档的 `oauth` 元数据取设备码端点并申请，把返回的 `verification_uri_complete`（在 `/admin/device` 下）和 `user_code` 交给所属人批准；按返回的间隔轮询换 token 的端点，拿到 `refresh_token` 后按下文保存。
- API Key：请所属人在 `{origin}/admin/api-keys/new` 发起并批准，原文只显示一次，由所属人交给你。Agent 不能自己创建或作废密钥。

请求头按发现文档 `auth` 写。权限相同时两种方式结果一致。调用 `whoami` 确认拿到的目录权限和 `site:write`。

## 连接配置

`metadata.oneself_origin` 标出这一台实例。凭据和站点地址不要写进这份 Skill，也不要写进 Skill 安装目录。`npx skills update` 会覆盖那个目录。统一读写用户配置目录里的这一个文件：

- 设置了 `XDG_CONFIG_HOME` 时：`$XDG_CONFIG_HOME/oneself/config.json`
- 否则：`~/.config/oneself/config.json`
- Windows：`%APPDATA%\oneself\config.json`

文件不存在就创建，权限设为仅当前用户可读。不要提交到仓库。保存 `origin`，以及 `api_key` 或 OAuth `refresh_token` 其中之一。`auth` 只能是 `api_key` 或 `oauth`。用设备码时不写 `api_key`，改为 `refresh_token`。

不要写所属人密码，不要只存 15 分钟的 access token，也不要存批准地址或设备码。

调用前按这个顺序取 origin：先 `ONESELF_ORIGIN`，再 `~/.config/oneself/config.json`（设置了 `XDG_CONFIG_HOME` 时为 `$XDG_CONFIG_HOME/oneself/config.json`，Windows 为 `%APPDATA%\oneself\config.json`），再 `metadata.oneself_origin`。三者都没有才问一次，并把答案写入该配置文件。已有其中任一来源时不要再问。用到 `metadata.oneself_origin` 且配置文件还没有 origin 时，把该值写入配置文件，这不改变上面的顺序，也不要再问。API Key 优先读 `ONESELF_API_KEY`，没有再读配置文件。凭据只放该配置文件或 `ONESELF_API_KEY`。设备码换到 refresh token 后立刻写入配置文件。下次先用这份配置，不要重新问所属人要已经发过的密钥。

不得把 API Key 或所属人密码写入 Skill 文件、页面或公开站点。

若本 origin 的 Skill 字节与已安装副本不同，以本 origin 的字节为准。
