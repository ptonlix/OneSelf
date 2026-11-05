# Spec Delta

## MODIFIED Requirements

### Requirement: Connection instructions
The entry MUST say that `metadata.oneself_origin` names this instance. It MUST give one origin order: `ONESELF_ORIGIN`, then the client config file, then `metadata.oneself_origin`. It MUST say to ask once and write the answer to that file only when all three are absent, and not to ask again when any of them is present. It MUST name `$XDG_CONFIG_HOME/oneself/config.json`, or `~/.config/oneself/config.json` when that variable is unset, and `%APPDATA%\oneself\config.json` on Windows. The agent MUST be told to store `origin` and either an `api_key` or an OAuth `refresh_token` there, and not in the skill directory. It MUST say not to store an owner password, a 15-minute access token as the only credential, an approval URL, or a device code. It MUST say not to store an API key or owner password in the skill file, a page, or the public site. It MUST say that if this origin's skill bytes differ from a previously installed copy, the bytes from this origin win. When the agent has no usable credential, the entry MUST tell it to request a device code and hand the owner `verification_uri_complete` and `user_code`. It MUST NOT tell the agent to ask for a new API key on that first connect. It MUST say an API key is the alternative when the owner wants a long-lived key for a script or CI.

#### Scenario: Entry names the client config file
- **WHEN** an agent reads the served `SKILL.md`
- **THEN** the text says `metadata.oneself_origin` names this instance, gives the origin order `ONESELF_ORIGIN`, the config file, then `metadata.oneself_origin`, names `~/.config/oneself/config.json` as the client store, and forbids writing secrets into the skill, a page, or the public site

#### Scenario: First connect uses a device code
- **WHEN** an agent with no credential reads the served `SKILL.md`
- **THEN** the text tells it to request a device code and not to ask the owner to create an API key first
