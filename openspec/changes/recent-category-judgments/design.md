# Design

## Context

见 `proposal.md`。现行写法在 `skills/oneself/references/self.md`：七栏是图例，判断只在 `## Facts — 近期有效判断`。启动种子是同一份空模板，见 `packages/domain/src/standing-judgment.ts` 的 `recentSeed`。服务端只检查 `type` 与 `as_of`，不解析判断块。未归档的 `standing-judgment` 把「种子含 `Facts — 近期有效判断`」写成了规格。已有页不覆盖。

## Goals / Non-Goals

**Goals:**

- Skill、可复制模板和启动种子使用同一种 Recent 版式。
- 有判断的栏目先有一句提炼，判断块紧跟其后。空栏留空。
- 未归档 `standing-judgment` 里与此冲突的标题清单一并改掉。

**Non-Goals:**

- 不让服务端校验提炼、`domain` 与栏目标题是否一致，也不新增错误码。
- 不迁移已有 `self/recent`，不写所属人的线上页。
- 不改 Soul，不把提炼做成系统 Facts 围栏。

## Decisions

1. 判断块上收到栏目下，删掉页尾的 `## Facts — 近期有效判断`。备选是保留该节再加一句提炼。拒绝：两份正文会写岔，也正是现在要消除的冲突。
2. 提炼是栏目标题下的一句普通 Markdown，不是判断块。它不带 `id`、`domain` 或 `valid_until`。有效期仍只挂在判断块上。备选是给提炼单独的字段。拒绝：服务端不解析画像正文，多一套字段没有校验者。
3. 一栏多条判断仍只写一句。细节留在判断块。备选是每条判断再写一句。拒绝：那就是把 `statement` 再抄一遍。
4. 空栏不写占位句。备选是「暂无足够证据」。拒绝：占位看起来像已经判断过，也违反「读到空栏目就留空」。
5. `domain` 保留，且必须与所在栏一致。备选是删掉 `domain`，只靠位置。拒绝：块被挪错栏时，位置和类别会一起丢；保留字段让 Agent 能对照。不一致时不返回新错误码，由 Skill 要求同一次修改改对。
6. 种子顶部说明增加两句：有判断的栏目先写一句提炼，判断块写在该栏下；没有判断的栏目留空。不放入样例判断或样例提炼。种子仍不得出现精确的 `## Facts` 标题，避免被当成系统围栏。
7. `references/context.md` 不再把近期判断指到 `## Facts — 近期有效判断`。精确的 `## Facts` 仍是系统围栏，这句话留下。例子改成双语栏目标题不是围栏。
8. 实现时直接改未归档 `standing-judgment` 的两份增量，删掉对 `Facts — 近期有效判断` 的必须包含。不在本变更另建 `standing-judgment` 规格。备选是等那份变更归档后再改主规格。拒绝：中间归档会把旧标题清单写进主规格。

## Risks / Trade-offs

- [Skill 未发出前，栏目下的提炼会被按旧规范删掉] → 本变更落地前不要让 Agent 按新版式改线上页。
- [一句提炼压不住一栏里的多条判断] → 提炼只作导语，引用现状时以判断块的 `statement` 和 `valid_until` 为准。
- [旧页仍带着页尾 Facts 节] → 服务端接受。下次按新 Skill 编辑时一次挪走，不自动迁移。
- [两份未归档变更同时改 Skill 规格] → 本变更的任务显式改 `standing-judgment` 的标题清单，避免后归档的那份把旧句子加回去。

## Migration Plan

发出新 Skill 后，digest 变化走现有更新提示。回滚是还原 Skill 与种子；已经被 Agent 改写的旧页不会自动变回。所属人要求改自己的 `self/recent` 时，再按新规范编辑，并带当前哈希。

## Open Questions

无。空栏留空、一栏一句，已记在提案的假设里。
