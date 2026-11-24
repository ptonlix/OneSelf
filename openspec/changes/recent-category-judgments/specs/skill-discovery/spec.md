# Spec Delta

## ADDED Requirements

### Requirement: Recent judgments live under category headings
`references/self.md` MUST say each current recent judgment is written under its matching category heading, not in a separate `## Facts — 近期有效判断` section. The copyable `self/recent` template MUST contain the seven bilingual category headings and `Timeline — 近期重要变化`, and MUST NOT contain `## Facts — 近期有效判断`.

#### Scenario: Template has no separate facts section
- **WHEN** an agent reads the copyable recent template in `references/self.md`
- **THEN** the template contains `01. Focus — 近期关注` and `Timeline — 近期重要变化`, and does not contain `## Facts — 近期有效判断`

### Requirement: A filled category starts with one distillation
`references/self.md` MUST say a category with at least one current judgment starts with exactly one distillation sentence, then that category's judgment blocks. The sentence MUST only compress claims already in those blocks. It MUST NOT be a judgment block and MUST NOT have its own `id` or `valid_until`.

#### Scenario: Distillation does not add a claim
- **WHEN** an agent reads how to write a filled recent category
- **THEN** the text requires exactly one lead sentence before the judgment blocks and says that sentence must not add a claim absent from those blocks

### Requirement: Empty recent categories stay empty
`references/self.md` MUST say a category with no current judgment stays empty. It MUST NOT tell the agent to write a placeholder such as insufficient evidence.

#### Scenario: Empty mood stays blank
- **WHEN** an agent reads how to treat a recent category that has no current judgment
- **THEN** the text says to leave that heading empty and not to fill it with a placeholder

### Requirement: Distillation changes with the category
`references/self.md` MUST say that adding, changing, expiring, or removing a judgment in a category rewrites or removes that category's distillation in the same edit. When the last current judgment leaves a category, the distillation MUST be removed.

#### Scenario: Last expiry removes the lead sentence
- **WHEN** an agent reads how to expire the last current judgment in a category
- **THEN** the text says the distillation is removed in that same edit

### Requirement: Recent domain matches the heading
`references/self.md` MUST say `domain` is one of `focus`, `work`, `mood`, `health`, `life`, `relationships`, and `goals_challenges`, and MUST match the heading the block sits under. It MUST still require `id`, `statement`, `observed_at`, `valid_until`, and `evidence` on each judgment block.

#### Scenario: Domain stays a closed list
- **WHEN** an agent reads the recent judgment block
- **THEN** the text lists `goals_challenges` and says `domain` must match the heading

### Requirement: Recent timeline does not repeat the current portrait
`references/self.md` MUST say `Timeline — 近期重要变化` stays after the seven categories and records changes only. It MUST say not to copy the distillation or a current judgment into the timeline.

#### Scenario: Timeline is not a second copy
- **WHEN** an agent reads the recent timeline rule
- **THEN** the text says the timeline does not repeat the current distillation or the current judgments

### Requirement: Context reference does not park recent judgments in a facts section
`references/context.md` MUST NOT tell the agent to write recent judgments under `## Facts — 近期有效判断`. It MAY still say an exact `## Facts` heading is the system fence.

#### Scenario: Context no longer names that section as the recent store
- **WHEN** an agent reads `references/context.md` for where recent judgments go
- **THEN** the text does not instruct writing them under `## Facts — 近期有效判断`
