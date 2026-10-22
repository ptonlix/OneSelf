# Spec Delta

## Purpose

让每台 OneSelf 站点用一个 `oneself` Skill 作为安装源和产品说明，使 `npx skills add https://这台站点` 只装入这一份，并让本地副本知道该连回这台实例。

## ADDED Requirements

### Requirement: One product skill
The only product skill name MUST be `oneself`. `list_skills` and `get_skill` MUST accept that name and MUST NOT accept `context-management` or `public-page`. `GET /.well-known/pcp` MUST list only `skills.oneself`, an absolute URL for `/skills/oneself/SKILL.md` on the configured public origin. `GET /skills/context-management.md` and `GET /skills/public-page.md` MUST NOT be served. A spoofed `Host` MUST NOT change `skills.oneself`.

#### Scenario: Discovery lists one skill
- **WHEN** a client fetches `/.well-known/pcp`
- **THEN** `skills` contains `oneself` and does not contain `context_management` or `public_page`

#### Scenario: Old skill names are gone
- **WHEN** a client calls `get_skill` with `context-management` or requests `/skills/context-management.md`
- **THEN** the result is `not_found`

### Requirement: Agent skills index
`GET /.well-known/agent-skills/index.json` MUST be anonymous and MUST return JSON with `$schema` equal to `https://schemas.agentskills.io/discovery/0.2.0/schema.json`. The `skills` array MUST contain exactly one entry, `oneself`, with `type` `archive`, a non-empty `description` of at most 1024 characters that covers both writing context and customizing the public page, a `url` on the configured public origin, and a `digest` of `sha256:` plus 64 lowercase hexadecimal characters. The digest MUST be the SHA-256 of the raw archive bytes returned by that `url`. A spoofed `Host` MUST NOT change the index. The response `Content-Type` MUST be `application/json`, and `Cache-Control` MUST be `no-store`.

#### Scenario: Installer discovers one archive
- **WHEN** a client fetches `/.well-known/agent-skills/index.json`
- **THEN** the only skill is `oneself` with `type` `archive`, and its `url` uses the configured public origin

#### Scenario: Digest matches the archive
- **WHEN** a client downloads the archive `url` and hashes the raw body
- **THEN** the hash equals the entry's `digest` without the `sha256:` prefix

### Requirement: Archive and entry bytes
The archive MUST contain `SKILL.md` at its root and `references/context.md` and `references/public-page.md`. It MUST NOT wrap those files in an extra directory. The `SKILL.md` inside the archive MUST be byte-for-byte equal to `GET /skills/oneself/SKILL.md` and `GET /pcp/v1/skills/oneself`. Those entry bytes MUST include the configured public origin in frontmatter `metadata.oneself_origin` and MUST NOT include an API key, owner password, or other secret. A spoofed `Host` MUST NOT change `oneself_origin`. `GET /skills/oneself/references/context.md` and `GET /skills/oneself/references/public-page.md` MUST return the reference files. Reference files MUST NOT be given a different origin from the entry.

#### Scenario: Entry routes match
- **WHEN** a client fetches `/skills/oneself/SKILL.md` and `/pcp/v1/skills/oneself`
- **THEN** the bodies are byte-for-byte equal and both contain `metadata.oneself_origin` set to the configured public origin

#### Scenario: Archive root is the skill directory
- **WHEN** a client unpacks the archive named by the index
- **THEN** `SKILL.md`, `references/context.md`, and `references/public-page.md` are present at those relative paths

### Requirement: Entry tells the agent which reference to read
`SKILL.md` MUST tell the agent to read `references/context.md` before writing, editing, deleting, or attaching files, and to read `references/public-page.md` before customizing, uploading, previewing, or requesting launch of the public page. It MUST say that if those files are not beside the installed skill, fetch `{oneself_origin}/skills/oneself/references/context.md` and `{oneself_origin}/skills/oneself/references/public-page.md`. The context reference MUST document frontmatter, visibility, the two fences, the `files` array, and `[[source/slug]]`. The public-page reference MUST state which public fields the built-in page can show, how to customize from the public-page source zip, add a real path, build, and avoid reserved paths. It MUST tell the agent to give the activation approval URL to the owner and MUST say not to claim the site has changed before approval. The next customization MUST start from that source zip rather than an uploaded dist. Both references MUST forbid putting secrets or private pages into source or build output, MUST require `credentials: omit` on public requests, and MUST NOT name the server framework.

#### Scenario: Entry points at both references
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the text names `references/context.md` and `references/public-page.md` and the corresponding absolute reference URLs

### Requirement: Connection instructions
The entry MUST say that `metadata.oneself_origin` names this instance. It MUST give one origin order: `ONESELF_ORIGIN`, then the client config file, then `metadata.oneself_origin`. It MUST say to ask once and write the answer to that file only when all three are absent, and not to ask again when any of them is present. It MUST name `$XDG_CONFIG_HOME/oneself/config.json`, or `~/.config/oneself/config.json` when that variable is unset, and `%APPDATA%\oneself\config.json` on Windows. The agent MUST be told to store `origin` and either an `api_key` or an OAuth `refresh_token` there, and not in the skill directory. It MUST say not to store an owner password, a 15-minute access token as the only credential, an approval URL, or a device code. It MUST say not to store an API key or owner password in the skill file, a page, or the public site. It MUST say that if this origin's skill bytes differ from a previously installed copy, the bytes from this origin win.

#### Scenario: Entry names the client config file
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the text says `metadata.oneself_origin` names this instance, gives the origin order `ONESELF_ORIGIN`, the config file, then `metadata.oneself_origin`, names `~/.config/oneself/config.json` as the client store, and forbids writing secrets into the skill, a page, or the public site

### Requirement: Index is not a site file
The agent-skills index and the `oneself` archive MUST be served by the application, not by the published site tree. An uploaded release that contains `.well-known` MUST still be rejected and MUST NOT replace the index.

#### Scenario: Site upload cannot replace discovery
- **WHEN** a client uploads a release containing `.well-known/agent-skills/index.json`
- **THEN** the upload is rejected and `GET /.well-known/agent-skills/index.json` is still the application index
