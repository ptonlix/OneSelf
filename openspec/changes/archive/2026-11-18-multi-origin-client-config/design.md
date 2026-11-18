# Design

## Context

产品 Skill 入口规定 Agent 只读写一个客户端配置文件，里面一个 `origin`，再加 `api_key` 或 `refresh_token` 其中之一。选取顺序是 `ONESELF_ORIGIN`、该文件、`metadata.oneself_origin`。有其中任何一个就不要再问。设备码换到 refresh token 后立刻写回这个文件。

这个文件不由服务端解析。约束只存在于入口句子和验收测试。入口还禁止出现 `http://` 与 `https://`，所以不能在 Skill 里放带 scheme 的示例地址。

服务端会轮换 refresh token。同一 origin 上两个 Agent 同时刷新会互踢，这次不解决。

## Goals / Non-Goals

**Goals:**

- 一台设备可以记住多台实例的凭据，默认仍然只有一个 `current`。
- 用户这次点名的 origin 优先，且不会自动变成默认。
- 不用 A 的凭据调用 B，也不用 B 的 token 替换 A。
- 旧的单 origin 文件在第一次按新句子写回时迁移，不丢凭据。

**Non-Goals:**

- 不把根改成数组，不按 `local` / `prod` 起名，不拆成多个配置文件。
- 不新增 `ONESELF_REFRESH_TOKEN`，不把 `ONESELF_API_KEY` 写进文件。
- 不在设备之间同步配置，不做同一 origin 的并发刷新锁。
- 不改 PCP、OAuth、发现文档或管理端。不在本变更里迁移用户家目录里的现有文件。

## Decisions

1. **一个文件，`current` 加 `profiles`。** 键是 origin，不是别名。数组没有默认项，也会在写回时被收成一条。目录多文件更容易漏掉权限。备选的根数组和分文件都拒绝。

2. **选择顺序固定，点名不改默认。** 用户这次要求连接、上传或操作的那一台 origin，然后 `ONESELF_ORIGIN`，然后 `current`，然后 `metadata.oneself_origin`。四者都没有才问一次，问到的地址写成 `current` 并写入 profile。正文、页面或待发布站点里的地址不算点名。一次点名两台就停下。点名或 `ONESELF_ORIGIN` 与 `current` 不同时不改 `current`，除非用户明确说以后默认连这台。

3. **键用服务器公布的 origin。** 先取发现文档或 OAuth issuer 公布的 origin，去掉末尾斜杠，且不能带路径、查询或片段。用户写下的字符串和公布值不一致时停。不合并 `localhost` 与 `127.0.0.1`，也不合并不同 scheme。不增删默认端口。

4. **写回只改匹配的一格，失败即停。** 写入前必须读到整个文件。只更新 origin 完全相同的 profile。写回后其他 origin 必须还在；读不到就停，禁止再写。看到 `profiles` 时禁止改回只有顶层 `origin` 的旧形状。`whoami` 未授权，或选中的 profile 不存在时，只为这台刷新或申请设备码，不回落。`ONESELF_API_KEY` 只覆盖这次选中的 origin，不写入文件。

5. **旧文件按读规则迁移。** 只有顶层 `origin`、没有 `profiles` 时，把它当作唯一 profile，`current` 就是这个 origin。下次写入改成新形状，原凭据必须还在。没有配置代码可改，所以这条规则写进入口，由下一次按新句子行动的 Agent 执行。

## Risks / Trade-offs

- [旧入口仍会把文件写成单对象] → 新句子要求看到 `profiles` 就禁止退回旧形状。在调用方改用新入口之前，不要提前改家目录里的文件。
- [模型写回时丢掉其他键] → 写前必须读到整个文件；写回后其他 origin 不在就停。不靠数组位置保持身份。
- [点名规则被正文里的链接触发] → 只有用户要求连接、上传或操作那一台才算。一次两台就问，不分头写。
- [入口变长] → 连接配置仍只放入口。不把这份规则写进 reference，也不写给作者看的格式说明。

## Migration Plan

先改入口和验收句子。已运行的进程重启后，`GET /skills/oneself/SKILL.md` 才带上新字节。家目录里的旧文件保持不动，直到一个遵循新句子的 Agent 在写入时迁移。回滚时恢复入口的单 origin 句子；已经写成 `profiles` 的文件不要由旧句子覆盖，应先手工保留各 origin 的凭据。

## Open Questions

无。不使用根数组、不自动切换 `current`、不回落到另一台凭据，都已定死。
