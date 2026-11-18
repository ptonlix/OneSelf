# skill-discovery Specification

## Purpose

让每台 OneSelf 站点用一个 `oneself` Skill 作为安装源和产品说明，使 `npx skills add https://这台站点` 只装入这一份，并让本地副本知道该连回这台实例。

## Requirements

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
The entry MUST say that `metadata.oneself_origin` names this instance. It MUST give one origin order: the origin the user asks to connect to, upload to, or operate in this request, then `ONESELF_ORIGIN`, then the config file's `current`, then `metadata.oneself_origin`. It MUST say to ask once and write that answer as `current` and as that origin's profile only when all four are absent, and not to ask again when any of them is present. A parenthetical beside the discovery read MUST only say that `metadata.oneself_origin` names this copy, and MUST NOT say that field is the origin just selected. A URL that appears only in body text, a page, or a site being published MUST NOT count as a named origin. Two origins named for one task MUST make the agent stop and ask, not write to both. A named origin or `ONESELF_ORIGIN` that differs from `current` MUST be used without changing `current`, unless the user explicitly says that origin should become the default.

The entry MUST name `$XDG_CONFIG_HOME/oneself/config.json`, or `~/.config/oneself/config.json` when that variable is unset, and `%APPDATA%\oneself\config.json` on Windows. It MUST tell the agent to store `current` and `profiles` in that one file, with each profile keyed by origin and holding `auth` plus either an `api_key` or a `refresh_token`, not both, and not in the skill directory. It MUST tell the agent to read a file that has only a top-level `origin` and no `profiles` as one profile whose `current` is that origin, and to rewrite it to `current` and `profiles` on the next write without dropping the existing credential. It MUST forbid rewriting a file that already has `profiles` back into the old single-origin shape.

The entry MUST say to key a profile by the origin published by that server's discovery document or OAuth issuer, without a trailing slash, path, query, or fragment, and to stop when the string the user wrote differs. It MUST say not to treat different hosts or schemes as the same profile. Before every write, including replacing an API key and not only after a device-code exchange, the agent MUST read the whole file, update only the profile whose origin matches, and stop without writing again if the other origins are not still present afterward. It MUST say not to drop an existing credential, not to send another origin's refresh token or API key to the selected origin, and not to persist `ONESELF_API_KEY` into the file. A missing profile, or `whoami` returning unauthorized, MUST be handled only for the selected origin, with no fallback to another profile.

It MUST say not to store an owner password, a 15-minute access token as the only credential, an approval URL, a device code, or a profile alias. It MUST say not to store an API key or owner password in the skill file, a page, or the public site. It MUST say that if this origin's skill bytes differ from a previously installed copy, the bytes from this origin win. When the agent has no usable credential, the entry MUST tell it to request a device code and hand the owner `verification_uri_complete` and `user_code`. It MUST NOT tell the agent to ask for a new API key on that first connect. It MUST say an API key is the alternative when the owner wants a long-lived key for a script or CI.

#### Scenario: Entry names profiles instead of one origin
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the text stores `current` and `profiles` keyed by origin in `~/.config/oneself/config.json`, and does not tell the agent to save only one top-level `origin`

#### Scenario: Named origin does not replace the default
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the origin order is the user-named origin, `ONESELF_ORIGIN`, `current`, then `metadata.oneself_origin`, and a different named origin is used without changing `current`

#### Scenario: Write-back cannot clobber another origin
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the text says to read the whole file before every write, including an API key replacement, update only the matching origin, keep every other origin, and not use another origin's credential or fall back to one

#### Scenario: Discovery parenthetical does not select the origin
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the discovery parenthetical only says `metadata.oneself_origin` names this copy, and does not say that field is the origin just selected

#### Scenario: First connect uses a device code
- **WHEN** an agent with no credential reads the served `SKILL.md`
- **THEN** the text tells it to request a device code and not to ask the owner to create an API key first

### Requirement: Index is not a site file
The agent-skills index and the `oneself` archive MUST be served by the application, not by the published site tree. An uploaded release that contains `.well-known` MUST still be rejected and MUST NOT replace the index.

#### Scenario: Site upload cannot replace discovery
- **WHEN** a client uploads a release containing `.well-known/agent-skills/index.json`
- **THEN** the upload is rejected and `GET /.well-known/agent-skills/index.json` is still the application index
