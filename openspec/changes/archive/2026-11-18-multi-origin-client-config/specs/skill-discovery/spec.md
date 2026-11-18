# Spec Delta

## MODIFIED Requirements

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
