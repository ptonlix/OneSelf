# skill-update-notice Specification

## Purpose

所属人已有可用凭证时，若这台站点的 oneself Skill 与已确认的副本不一致，管理端提示更新。oneself update 在摘要里说明如何升级，且不得把首次安装或读不到索引当成更新失败。

## Requirements

### Requirement: Admin prompts to update the product skill
When the owner already has an active API key or an approved device grant, a missing or different `oneself` digest MUST mark the Skill menu with a red dot and MUST NOT put the upgrade notice on the star map. The Skill page MUST show the current skill text, both copyable commands, and a line diff against the last acknowledged copy when that copy exists.

#### Scenario: Changed digest shows a copyable update command
- **WHEN** the owner has an approved grant and the index digest differs from the digest acknowledged for this origin
- **THEN** the Skill menu shows a red dot, the star map does not show the upgrade notice, and the Skill page shows the current text, both commands, and the diff when a previous copy exists

### Requirement: Acknowledging the skill notice hides it
Acknowledging the notice MUST store the current digest for that origin and hide the notice until the digest changes. The server MUST NOT rewrite the client config or run the update command.

#### Scenario: Acknowledgement hides the same digest
- **WHEN** the owner acknowledges the notice
- **THEN** the notice is hidden and the same digest does not show it again

### Requirement: Update command reports a skill change
When `oneself update` can read the agent-skills index before and after restart, and the `oneself` digest differs, the terminal summary MUST show `发现 oneself skill 有更新，请升级 skill`, the fresh install command with that public origin, and `npx skills update oneself`. An unchanged digest, a dry run, or a missing before-or-after digest MUST NOT show that notice.

#### Scenario: Digest change is explained in the terminal
- **WHEN** the index digest after `oneself update` differs from the digest read before restart
- **THEN** the update summary shows both the install command and `npx skills update oneself`

### Requirement: Restarted index read does not block the update
After restart, `oneself update` MUST retry the index read briefly within a bounded time. If that read never succeeds, the command MUST omit the skill notice and MUST NOT fail or block the update.

#### Scenario: Unreadable index after restart does not block the update
- **WHEN** the index still cannot be read after the brief retry following restart
- **THEN** the update finishes and does not show the skill notice

### Requirement: Install origin drops one trailing slash
The origin used to fetch the index and to print the install command MUST be `PUBLIC_ORIGIN` with one trailing slash removed and no other rewrite.

#### Scenario: One trailing slash is not part of the printed origin
- **WHEN** `PUBLIC_ORIGIN` ends with one slash and the digest changes
- **THEN** the index request and the install command use that origin without the slash

### Requirement: First install is not a skill update
When the owner has neither an active API key nor an approved grant, the admin home MUST NOT show the skill update notice. It MUST keep the existing install command and store the current digest without asking the owner to update. A failure to read the index MUST NOT block the rest of the home.

#### Scenario: No agent keeps the install command
- **WHEN** the owner has no active API key and no approved grant
- **THEN** the home shows the install command and does not show the skill update notice
