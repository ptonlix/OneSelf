# Tasks

## 1. 产品 Skill

- [x] 1.1 改 `skills/oneself/references/self.md`。可复制的 Recent 模板去掉 `## Facts — 近期有效判断`，保留七个双语栏目和 `Timeline — 近期重要变化`。写明：判断块写在对应栏目下；有当前判断的栏目先写恰好一句提炼，只压缩这些块已有的主张，提炼不是带 `id` 的判断；判断增、改、到期或删除时同一次修改重写或删除这句；没有当前判断的栏目留空，不写占位句。`domain` 仍是现有七个值，且必须与所在栏一致。时间线不重复提炼或当前判断。
- [x] 1.2 改 `skills/oneself/references/context.md`，不再让近期判断写到 `## Facts — 近期有效判断`。精确的 `## Facts` 仍说明为系统围栏。
- [x] 1.3 更新 `tests/acceptance/skills.test.ts`：不再要求「不要在栏目下再抄一遍」，改为锁定新句子，并确认模板不含 `## Facts — 近期有效判断`。

## 2. 启动种子

- [x] 2.1 改 `packages/domain/src/standing-judgment.ts` 的 `recentSeed`，与新模板同一版式。顶部说明写清有判断才写一句提炼、空栏留空。不放样例判断或样例提炼。领域单测确认种子含 `01. Focus — 近期关注` 与时间线，不含 `## Facts — 近期有效判断`，写入仍不产生 Facts 投影。

## 3. 未归档规格对齐

- [x] 3.1 改 `openspec/changes/standing-judgment` 里 skill-discovery 与 standing-judgment 的 Recent 标题要求，不再必须包含 `Facts — 近期有效判断`。不改那份变更已经落地且与本版式无关的行为。

## 4. 检查

- [x] 4.1 跑 `pnpm exec vitest run packages/domain/src/standing-judgment.test.ts tests/acceptance/skills.test.ts`，再跑 `pnpm run typecheck`。不改所属人已有的 `self/recent`。
