# Spec Delta

## MODIFIED Requirements

### Requirement: Archive and entry bytes
The archive MUST contain `SKILL.md` at its root and `references/context.md`, `references/public-page.md`, `references/philosophy.md`, `references/cognition.md`, and `references/self.md`. It MUST NOT wrap those files in an extra directory. The `SKILL.md` inside the archive MUST be byte-for-byte equal to `GET /skills/oneself/SKILL.md` and `GET /pcp/v1/skills/oneself`. Those entry bytes MUST include the configured public origin in frontmatter `metadata.oneself_origin` and MUST NOT include an API key, owner password, or other secret. A spoofed `Host` MUST NOT change `oneself_origin`. `GET /skills/oneself/references/context.md`, `GET /skills/oneself/references/public-page.md`, `GET /skills/oneself/references/philosophy.md`, `GET /skills/oneself/references/cognition.md`, and `GET /skills/oneself/references/self.md` MUST return the reference files. Reference files MUST NOT be given a different origin from the entry.

#### Scenario: Entry routes match
- **WHEN** a client fetches `/skills/oneself/SKILL.md` and `/pcp/v1/skills/oneself`
- **THEN** the bodies are byte-for-byte equal and both contain `metadata.oneself_origin` set to the configured public origin

#### Scenario: Archive root is the skill directory
- **WHEN** a client unpacks the archive named by the index
- **THEN** `SKILL.md`, `references/context.md`, `references/public-page.md`, `references/philosophy.md`, `references/cognition.md`, and `references/self.md` are present at those relative paths

### Requirement: Entry tells the agent which reference to read
`SKILL.md` MUST tell the agent to read `references/context.md` before writing, editing, deleting, or attaching files, and to read `references/public-page.md` before customizing, uploading, previewing, or requesting launch of the public page. It MUST tell the agent to read `references/self.md`, then `self/soul` and `self/recent`, before judging who the person is or what their recent life is, and to skip that read when `whoami` cannot read `self`. It MUST say that the reference contains the two page templates. It MUST say that if those files are not beside the installed skill, fetch `{oneself_origin}/skills/oneself/references/context.md`, `{oneself_origin}/skills/oneself/references/public-page.md`, and `{oneself_origin}/skills/oneself/references/self.md`. The context reference MUST document frontmatter, visibility, the two fences, the `files` array, and `[[source/slug]]`, and MUST point at `references/self.md` from its write checklist. The public-page reference MUST state which public fields the built-in page can show, how to customize from the public-page source zip, add a real path, build, and avoid reserved paths. It MUST tell the agent to give the activation approval URL to the owner and MUST say not to claim the site has changed before approval. The next customization MUST start from that source zip rather than an uploaded dist. All three references MUST forbid putting secrets or private pages into source or build output, MUST require `credentials: omit` on public requests, and MUST NOT name the server framework.

#### Scenario: Entry points at both references
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the text names `references/context.md` and `references/public-page.md` and the corresponding absolute reference URLs

#### Scenario: Entry points at the standing-judgment reference
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the text names `references/self.md`, its absolute URL, and the pages `self/soul` and `self/recent`

## ADDED Requirements

### Requirement: Understanding references state the mission and the checkpoints
`references/philosophy.md` MUST say the aim is to understand the person with fewer, more accurate judgments, not to store more material. It MUST say the agent is an observer, not a clerk. `references/cognition.md` MUST name value, nature, time, relation, pattern, change, and where to keep the result as checkpoints, not required answers. It MUST distinguish what the person said, what the material shows, and what the agent infers. `SKILL.md` MUST name both files and their absolute URLs.

#### Scenario: Entry points at the understanding references
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the text names `references/philosophy.md` and `references/cognition.md`

### Requirement: New context reads the understanding references
`SKILL.md` MUST say to read `references/philosophy.md` and `references/cognition.md` whenever handling new personal context, not only when editing the portrait.

#### Scenario: Portrait edit is not the only time to read
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the text says to read those references for new personal context and not only when editing the portrait

### Requirement: Skill separates the current task from portrait writes
`SKILL.md` and `references/philosophy.md` MUST say to finish the owner's current task before writing long-term context. Analysis, translation, summary, or editing MUST NOT by themselves authorize saving material or updating a portrait. Unclear intent MUST NOT authorize archiving sensitive material.

#### Scenario: A one-off task is not a memory task
- **WHEN** an agent reads `SKILL.md`
- **THEN** the text says a file in hand is not permission to write personal context

### Requirement: Self reference contains the soul template
`references/self.md` MUST include a copyable `self/soul` template with `type: soul`, `title: 灵魂画像`, the six bilingual dimension headings, `Timeline — 认知演化`, and `Observations — 候选观察`. It MUST say the page is not a resume, a biography, or an agent instruction. It MUST say the six dimensions hold only confirmed traits, and the observations section holds unconfirmed patterns.

#### Scenario: Soul headings are bilingual
- **WHEN** an agent reads `references/self.md`
- **THEN** the text contains `01. Values — 价值观与信念`, `06. Strengths & Frictions — 优势与摩擦`, and `Observations — 候选观察`

### Requirement: Self reference contains the recent template
`references/self.md` MUST include a copyable `self/recent` template with `type: recent`, `as_of`, and the headings `01. Focus — 近期关注`, `02. Work — 工作与事业`, `03. Mood — 情绪与心理状态`, `04. Health — 身体与健康`, `05. Life — 生活状态`, `06. Relationships — 人际关系`, `07. Goals & Challenges — 目标与困扰`, `Facts — 近期有效判断`, and `Timeline — 近期重要变化`. It MUST say the page is a current-life portrait, not a log of uploads.

#### Scenario: Recent headings are bilingual
- **WHEN** an agent reads `references/self.md`
- **THEN** the text contains `01. Focus — 近期关注` and `07. Goals & Challenges — 目标与困扰`

### Requirement: Self reference shows the candidate block
`references/self.md` MUST show one candidate block whose keys are `observation_id`, `statement`, `source`, `evidence`, `first_seen`, `last_seen`, and `note`. `source` MUST be one of the three formal-judgment labels. It MUST say `evidence` uses `[[source/slug]]`. It MUST NOT require `confidence`, `status`, `evidence_type`, or `scope`.

#### Scenario: Candidate block stays small
- **WHEN** an agent reads `references/self.md`
- **THEN** the text contains `observation_id` and `last_seen`, and does not require a confidence score

### Requirement: Self reference shows the recent judgment block
`references/self.md` MUST show that a recent judgment has `id`, `domain`, `statement`, `observed_at`, `valid_until`, and `evidence`. It MUST say these blocks stay in the body and MUST say not to call `remember` or `add_timeline_entry` on these two pages.

#### Scenario: Recent judgment is not a system fact
- **WHEN** an agent reads `references/self.md`
- **THEN** the text contains `observed_at` and `valid_until` and names `remember` as forbidden on these pages

### Requirement: Self reference separates candidates from the portrait
`references/self.md` MUST say a one-off stays evidence unless it is a pattern worth watching again, a repeated but unclear pattern stays a candidate, and corroborated material may enter a dimension as observed behavior. An explicit confirmation may enter only as the person's own statement, not as verified behavior. It MUST say candidates are not confirmed traits and MUST NOT be stated to the user as such. It MUST say not to create `self/observations`.

#### Scenario: One occurrence does not promote
- **WHEN** an agent reads `references/self.md`
- **THEN** the text says one accidental occurrence does not enter the six dimensions

### Requirement: Self reference states the four maintenance actions
`references/self.md` MUST name four actions: observe new material, compare it with the portrait and the candidate section, add or update a candidate or promote one, and merge or remove stale candidates. It MUST say Recent has no candidate section and drops an item when `valid_until` has passed, without monthly archives.

#### Scenario: Recent does not keep expired items
- **WHEN** an agent reads `references/self.md`
- **THEN** the text says an expired recent item leaves the current sections and is not filed by calendar month

### Requirement: Self reference states how to revise portraits
`references/self.md` MUST say to read both pages before judging the person, to leave an upload in its own page unless it changes a long-term trait or current life, and to edit a portrait with `edit_page` and the current hash. It MUST say an expired `valid_until` is not current, not to invent another overview when `self` is unreadable, and not to store secrets. It MUST NOT name the server framework or a second product skill.

#### Scenario: Upload is not automatically a portrait entry
- **WHEN** an agent reads `references/self.md`
- **THEN** the text says an upload is not by itself a reason to write `self/soul` or `self/recent`
