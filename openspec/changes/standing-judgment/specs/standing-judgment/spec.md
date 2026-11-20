# Spec Delta

## Purpose

Keep a soul page and a recent page at fixed addresses so an agent can read a person's long-term portrait and current life without treating every upload as a fact about them.

## ADDED Requirements

### Requirement: Soul and recent are the standing pages
Unless `self` is soft-deleted, the system MUST ensure `self`, `self/soul`, and `self/recent` exist before serving. It MUST NOT preload `public`, `private`, or `agents`. It MUST NOT treat `self/profile` or `self/now` as standing pages. An existing current object MUST NOT be overwritten. A soft-deleted `self` MUST NOT be restored automatically.

#### Scenario: Owner sees soul and recent
- **WHEN** an owner session lists sources and reads `self/soul` and `self/recent` on a new installation
- **THEN** `self` is listed and both pages are readable

#### Scenario: Old profile page is left alone
- **WHEN** `self/profile` already has a current object and the system ensures standing pages
- **THEN** that object's hash is unchanged and `self/soul` is created only if missing

### Requirement: Seed pages are the empty templates
A seeded `self/soul` MUST be `private`, with `type` `soul`, a title, and string `name`. A seeded `self/recent` MUST be `private`, with `type` `recent`, a title, and `as_of` as `YYYY-MM-DD`. The seed body MUST be that empty template, including its explanatory lines, and MUST NOT contain a sample judgment or a fact projection. `as_of` MUST be the ensure date, not a sample date.

#### Scenario: Fresh recent has no current judgment
- **WHEN** a caller reads a just-seeded `self/recent`
- **THEN** `visibility` is `private`, the body has no `id: work-001`, and the fact projection is empty

### Requirement: Seed soul uses the bilingual headings
The soul seed MUST contain `01. Values — 价值观与信念`, `02. Thinking — 思维与认知`, `03. Operating — 做事与决策`, `04. Habits — 习惯与行为规律`, `05. Motivations — 内在动机`, `06. Strengths & Frictions — 优势与摩擦`, `Timeline — 认知演化`, and `Observations — 候选观察`.

#### Scenario: Soul seed names values and frictions
- **WHEN** a caller reads a just-seeded `self/soul`
- **THEN** the body contains `01. Values — 价值观与信念`, `06. Strengths & Frictions — 优势与摩擦`, and `Observations — 候选观察`

### Requirement: Seed recent uses the bilingual headings
The recent seed MUST contain `01. Focus — 近期关注`, `02. Work — 工作与事业`, `03. Mood — 情绪与心理状态`, `04. Health — 身体与健康`, `05. Life — 生活状态`, `06. Relationships — 人际关系`, `07. Goals & Challenges — 目标与困扰`, `Facts — 近期有效判断`, and `Timeline — 近期重要变化`.

#### Scenario: Recent seed names focus and goals
- **WHEN** a caller reads a just-seeded `self/recent`
- **THEN** the body contains `01. Focus — 近期关注` and `07. Goals & Challenges — 目标与困扰`

### Requirement: Standing writes keep the page contract
A write to `self/soul` MUST result in `type` `soul` and string `name`. A write to `self/recent` MUST result in `type` `recent` and `as_of` as `YYYY-MM-DD`. Empty `name` MUST be valid. These writes MUST NOT require `roles`, `traits`, or `stage`. A bilingual heading MUST NOT be parsed as the `## Facts` or `## Timeline` fence. A result that breaks this contract MUST be `invalid` and MUST NOT change the current object.

#### Scenario: Template write does not become system facts
- **WHEN** a caller writes `self/recent` with the recent template and no exact `## Facts` heading
- **THEN** the write succeeds and the fact projection is empty

#### Scenario: Wrong type does not replace soul
- **WHEN** a caller writes `self/soul` with `type` other than `soul`
- **THEN** the response is `invalid` and the previous hash remains current

### Requirement: Reserved addresses cannot be removed
`sources_delete` of `self` MUST return `invalid` and MUST NOT hide the directory, including for an owner session. `delete_page` of `self/soul` or `self/recent` MUST return `invalid` and MUST NOT soft-delete either page. `remember`, `forget`, and `add_timeline_entry` on either page MUST return `invalid` and MUST NOT rewrite the page.

#### Scenario: Owner cannot delete the soul page
- **WHEN** an owner session calls `delete_page` for `self/soul`
- **THEN** the response is `invalid` and a following read still returns the page

#### Scenario: Fence rewrite is rejected
- **WHEN** a caller calls `add_timeline_entry` on `self/recent`
- **THEN** the response is `invalid` and the current hash is unchanged

### Requirement: No separate portrait protocol
The system MUST NOT add an operation, path, table, or fence for these pages. Reading and writing them MUST use the existing page operations except the rejected fence rewrites above. An unreadable `self` MUST be `not_found`. A credential with unrestricted data access MUST see `self` in `whoami` with read, write, and visibility while the directory is not soft-deleted.

#### Scenario: Discovery does not add an operation
- **WHEN** a client reads the operation list in `/.well-known/pcp`
- **THEN** no operation name contains `soul` or `recent`
