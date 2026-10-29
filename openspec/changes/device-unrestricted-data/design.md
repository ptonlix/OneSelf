# Design

## Context

见 `proposal.md`。现在全部数据权限只存在于 API Key：`Credential` 的 `oauth` 没有这个字段，`canAddSource` 只放行所属人和 `api_key.unrestrictedData`，`POST /admin/device` 见到 `unrestricted_data` 就拒绝。`oauth_grants` 没有对应列。`whoami` 对无限制 API Key 会列出当前未删除目录，但不返回这个标志，Agent 无法从响应判断自己能不能 `sources_add`。

## Goals / Non-Goals

**Goals:**

- 设备码批准与 API Key 使用同一档全部数据权限。
- 已有授权升级后保持原范围。

**Non-Goals:**

- 不让每条设备码授权默认都能建目录。
- 不让 OAuth 删除或恢复目录，也不从设备码签发 API Key。
- 不改 API Key 的创建和批准流程。

## Decisions

1. 在 `oauth_grants` 追加 `unrestricted_data boolean not null default false`。只追加新迁移，不改已有 SQL。已有行靠默认值保持受限。
2. OAuth 凭据增加与 API Key 相同的 `unrestrictedData`。`sourceFlags` 和 `canAddSource` 对两种凭据用同一判断。删除和恢复目录仍只看所属人。
3. 批准时 `unrestricted_data: true` 则忽略请求里的 `sources` 并存空数组，与 `create_api_key` 一致。缺字段仍是 `invalid`，避免旧页面漏发时被当成受限批准。
4. `whoami` 增加 `unrestricted_data`。所属人为 true；无限制的 API Key 和 OAuth 为 true；其余为 false。无限制凭据的 `sources` 仍是当前未删除目录的全开三档，这样 Agent 既能判断能不能建目录，又能看到现在有哪些目录。
5. 管理端设备码页复用 API Key 的全部数据权限开关。勾选后不提交 source 勾选。概览的已批准设备显示这个标志。
6. 产品 Skill 的 `sources_add` 句子改为所属人会话，或带全部数据权限的 API Key / 设备码授权。不在 Skill 里写服务端框架名。

备选是让任意设备码授权都能 `sources_add`。这会让只批准了单个目录的 Agent 也能新建目录，超出所属人在批准页上勾选的范围，所以不采用。

## Risks / Trade-offs

- [批准页和接口同时要求新字段，旧的管理端 dist 会批准失败] → 同一版本发布页面和接口。失败是 `invalid`，不会把设备批成受限授权。
- [`whoami` 多一个字段，严格比对键集合的测试和客户端会失败] → 同步改这些断言。不删除现有字段。
- [授权列表多一个字段] → 管理端解析改为接受 `unrestricted_data`，仍拒绝令牌和哈希字段。

## Migration Plan

1. 先跑新迁移，再启动新进程。旧进程不读这一列，可以在迁移之后、新进程之前继续服务；新进程不能跑在未迁移的库上。
2. 回滚进程时，新列可以留着。旧进程不读它。不要把已批成全部数据权限的授权理解成旧页面上的空 source 列表。

## Open Questions

无。
