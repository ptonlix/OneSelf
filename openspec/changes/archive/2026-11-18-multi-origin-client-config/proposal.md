# Proposal

## Why

一台设备上的 Agent 现在只能在 `config.json` 里保存一个 `origin` 和一套凭据。所属人点名另一台实例时，照现有句子要么写错站，要么用新换到的 refresh token 覆盖原来那台。refresh token 会轮换，覆盖就是作废。根数组不能表达默认实例，也不能防止写回时丢掉其他条目。

## What Changes

- 客户端仍只使用这一个配置文件。新形状是 `current` 加上以 origin 为键的 `profiles`。每个 profile 只有 `auth`，以及 `api_key` 或 `refresh_token` 其中之一。
- 选择顺序改为：用户这次要求连接的 origin，然后 `ONESELF_ORIGIN`，然后 `current`，最后 `metadata.oneself_origin`。四者都没有才问一次。点名或环境变量与 `current` 不同时，不改 `current`。
- 凭据只打向选中的 origin。对不上就停，不回落到另一台。写回前必须读到整个文件，只更新 origin 相同的 profile，并保留其他键。禁止退回只有顶层 `origin` 的旧形状。
- 旧文件只有顶层 `origin` 时，读作唯一 profile。下次写入再迁移，不得丢掉已有凭据。
- 不改服务端协议、发现文档字段或操作表。不新增环境变量，不拆配置文件，不给 profile 起别名。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `skill-discovery`：连接说明从单 origin 改为 `current` 与按 origin 分开的 profile，并规定点名另一台时不得写错站或覆盖其他凭据。该能力目前在未归档的 `host-skill-discovery`，设备码优先的句子在未归档的 `owner-continuity`。`openspec/specs/skill-discovery` 尚不存在。

## Impact

- `skills/oneself/SKILL.md` 的连接配置。reference 不写这份配置。
- `tests/acceptance/skills.test.ts` 锁定新的顺序和写回句子。
- 不改 `packages/operations`、发现文档或管理端。已运行的进程要重启后才会吐出新的入口字节。不在本变更里改写用户家目录中的配置文件。
