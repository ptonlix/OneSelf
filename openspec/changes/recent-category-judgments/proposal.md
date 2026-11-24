# Proposal

## Why

`self/recent` 的七个栏目标题现在只是图例，判断全堆在页尾的 `## Facts — 近期有效判断`。人按栏目读到的是空骨架；若在栏目下再抄一句，又和现行 Skill「不要在栏目下再抄一遍」冲突，下一个 Agent 会删掉提炼。所属人要求判断块上收到栏目下，并且每个有内容的栏目有一句提炼。

## What Changes

- 近期判断块写在对应栏目标题下，不再集中在 `## Facts — 近期有效判断`。模板和启动种子去掉这一节。
- 某一栏有当前判断时，标题下先写恰好一句提炼，再写该栏的判断块。提炼只压缩这些块已经写出的状态，不新增主张，也不是带 `id` 的另一条判断。
- 该栏判断增、改、到期或删除时，同一次修改必须重写或删掉这句提炼。栏内没有当前判断时标题下留空，不写「暂无足够证据」或其它占位。
- `domain` 仍是 `focus`、`work`、`mood`、`health`、`life`、`relationships`、`goals_challenges` 之一，且必须和所在栏目一致。`id`、日期、`valid_until`、证据规则不变。
- `Timeline — 近期重要变化` 仍在页尾，只记变化，不重复当前判断或提炼。
- 服务端仍不解析提炼，也不把双语标题当成系统 `## Facts` 围栏。已有正文不覆盖、不迁移。已安装实例上的旧页由 Agent 按新 Skill 改写，不在本变更里写入所属人的线上页。
- 不改 `self/soul` 的六节写法。

假设：一栏多条判断时仍只写一句提炼，不写成段。空栏留空，不写占位句。

## Capabilities

### New Capabilities

### Modified Capabilities

- `skill-discovery`：产品 Skill 改为要求 Recent 的判断块和一句提炼都写在栏目下，模板不再包含 `## Facts — 近期有效判断`。

未归档的 `standing-judgment` 仍要求种子和模板包含该节。它还不是 `openspec/specs/` 里的能力，本变更不另建同名规格；实现时改那份未归档增量，避免两套规格打架。种子继续等于 Skill 里的空模板。

## Impact

- `skills/oneself/references/self.md`，以及 `references/context.md` 里把近期判断指到 `## Facts — 近期有效判断` 的说明。
- 启动种子：`packages/domain/src/standing-judgment.ts`。已有页不改写。
- 验收测试 `tests/acceptance/skills.test.ts` 现在锁着「不要在栏目下再抄一遍」，必须改成新规则。
- 未归档 `openspec/changes/standing-judgment` 里 skill-discovery 与 standing-judgment 对 Recent 标题的要求。
- 不新增依赖，不改 PCP 路径、错误码或系统围栏解析。Skill 正文变化会改变 digest，更新提示沿用现有机制。
