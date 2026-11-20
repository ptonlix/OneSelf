# Design

## Context

已经按 `self/profile` 和 `self/now` 写过种子、发现文档和 Skill。那版合同作废。页仍是 Markdown。系统只把标题恰好为 `## Facts` 或 `## Timeline` 的节当成围栏，并且 Facts 只认 `id`、`entity`、`statement`、`confidence`、`valid_until`。

见 `proposal.md`。未归档前不改 `docs/PRD.md`。

## Goals / Non-Goals

**Goals:**

- 固定地址改成 `self/soul` 与 `self/recent`。
- 种子和 `references/self.md` 使用同一套中英标题模板。
- 判断块留在正文。候选与正式画像同页，系统不评分。

**Non-Goals:**

- 不扩展 Facts 字段，不新增围栏、操作或表。
- 不另建 `self/observations`。候选写在 `self/soul` 下半。
- 不自动从上传资料生成判断。

## Decisions

1. 发现文档字段改为 `self.soul` 与 `self.recent`。不再公布 `profile` 和 `now`。
2. 种子是没有样例判断的模板。`name` 为空。`as_of` 取保证当天的日期。样例判断只出现在 Skill，避免种子假装已经理解了这个人。
3. 中英标题不是系统围栏。`remember`、`forget`、`add_timeline_entry` 会重写恰好叫 `## Facts` 或 `## Timeline` 的节，所以这两页上直接 `invalid`。画像用 `edit_page` 改正文。
4. Soul 分成两截。六节只放已确认判断，每条写判断、来源、范围和 `[[source/slug]]`。`Observations — 候选观察` 只含 `observation_id`、`statement`、`source`、`evidence`、`first_seen`、`last_seen`、`note`。`source` 只能是用户自述、行为观察、Agent 推断。不设置信度、状态或证据性质字段。
5. 晋升只看三档。一次偶然不自动进入候选，只保留原始证据；值得以后再验证的长期线索才可以进入候选。反复出现但说不清，仍留在候选。多份独立资料对得上，可以作为行为观察写入对应的一节。本人确认只能作为用户自述进入，不能写成已被行为验证的事实。回答用户时不得把候选说成已确认特征。
6. 每次整理做四步：观察、对照、判断、清理。不规定出现次数，也不另跑审核流程。Recent 不设候选区。过期条退出栏目，不按自然月归档。`as_of` 不是每条的有效期。
7. 已有 `self/profile` 或 `self/now` 不覆盖、不迁移、不当成画像。批准界面仍只默认勾选 `self` 的读。

备选：单独的 `self/observations`。拒绝。Agent 要同时维护三页，候选和正式画像容易写岔。备选：置信度和状态机。拒绝。目前不需要人格推理引擎。

## Risks / Trade-offs

- [Agent 仍调用 `remember`] → 这两页返回 `invalid`，原文不变。Skill 写明改用 `edit_page`。
- [旧测试仍断言 `self.profile`] → 实现时一并改掉。规格以本版为准。
- [中英标题被人手改掉] → 系统不强制标题原文，只强制 `type` 和 `name` 或 `as_of`。Skill 要求沿用模板标题，方便 `edit_page` 定位。

## Migration Plan

1. 替换种子、发现文档和 Skill。不写数据迁移。
2. 已有旧页保留。新安装只得到 soul 和 recent。
3. 回滚代码后，已写出的 soul 页仍是普通 Markdown。

## Open Questions

无。
