# Spec Delta

## ADDED Requirements

### Requirement: Device approval can grant unrestricted data
The device approval page MUST let the owner grant unrestricted data access, with the same meaning as an API key: the grant includes every current and future source, with read, write, and visibility. `site:write` MUST remain a separate choice. The page MUST say, before confirm, that read permission includes every non-deleted private page in those sources. Confirm MUST send `unrestricted_data`. When it is true, `sources` MUST be ignored and stored empty. When it is false, only the sources checked on that page MUST be stored. A body without `unrestricted_data` MUST be `invalid` and MUST NOT approve the device. An already approved grant that has no such flag MUST remain restricted to its stored sources. The device flow MUST NOT mint an API key.

#### Scenario: Unrestricted device approval ignores the source list
- **WHEN** the owner approves a device code with unrestricted data access and a non-empty source list
- **THEN** the grant is approved, its stored source list is empty, and `unrestricted_data` is true

#### Scenario: Missing flag does not approve
- **WHEN** an owner session posts a device approval without `unrestricted_data`
- **THEN** the response is `invalid` and the device remains unapproved

#### Scenario: Existing grant stays restricted
- **WHEN** a grant approved before this flag existed is used after upgrade
- **THEN** it can access only its stored sources and cannot add a directory

### Requirement: Callers can see unrestricted data access
`whoami` MUST include `unrestricted_data` in addition to its existing fields. It MUST be true for the owner session, true for an API key or OAuth grant approved with unrestricted data access, and false otherwise. For an unrestricted API key or OAuth grant, `sources` MUST list every current non-deleted source with read, write, and visibility. `GET /admin/oauth-grants` MUST include `unrestricted_data` on each grant and MUST still omit tokens, hashes, and refresh payloads.

#### Scenario: Agent sees that a device grant can add directories
- **WHEN** an OAuth token from an unrestricted device approval calls `whoami`
- **THEN** `credential` is `oauth`, `admin` is false, and `unrestricted_data` is true

#### Scenario: Grant list shows the flag without token material
- **WHEN** the owner lists OAuth grants after approving one with unrestricted data access
- **THEN** that grant has `unrestricted_data` true and the response contains no token or hash
