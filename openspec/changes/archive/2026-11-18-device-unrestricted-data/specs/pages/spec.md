# Spec Delta

## ADDED Requirements

### Requirement: Unrestricted OAuth can add a directory
`sources_add` MUST succeed for an owner session, an API key with unrestricted data access, or an OAuth grant with unrestricted data access. An OAuth grant or API key without that flag MUST receive `forbidden` and MUST NOT create a directory. A source created after an unrestricted grant was approved MUST be readable, writable, and visibility-changeable by that grant. `sources_delete` and `sources_restore` MUST remain owner-only, including for an unrestricted OAuth grant.

#### Scenario: Device grant adds the first directory
- **WHEN** an OAuth token with unrestricted data access calls `sources_add` on an empty installation
- **THEN** the directory is created and a later `sources_list` by that token includes it

#### Scenario: Restricted device grant cannot add a directory
- **WHEN** an OAuth token without unrestricted data access calls `sources_add`
- **THEN** the response is `forbidden` and no directory is created

#### Scenario: Unrestricted device grant cannot delete a directory
- **WHEN** an OAuth token with unrestricted data access calls `sources_delete`
- **THEN** the response is `forbidden` and the directory remains
