# Spec Delta

## ADDED Requirements

### Requirement: Device approval requires an owner label
`POST /admin/device` MUST require `label` in addition to its existing fields. The server MUST trim surrounding whitespace. After trimming, an empty label or a label longer than 80 characters MUST be `invalid` and MUST NOT approve the device. A valid label MUST be stored on that grant and MUST NOT be changeable by an agent. The device flow MUST NOT mint an API key. An authorization-code grant created only in the test configuration MAY have no label.

#### Scenario: Approval stores the trimmed label
- **WHEN** an owner session approves a device code with a label that has surrounding whitespace and is otherwise within 80 characters
- **THEN** the device is approved and the stored label is the trimmed text

#### Scenario: Missing or blank label does not approve
- **WHEN** an owner session posts a device approval without `label`, or with a label that is empty after trimming
- **THEN** the response is `invalid` and the device remains unapproved

#### Scenario: Overlong label does not approve
- **WHEN** an owner session posts a device approval whose trimmed label is longer than 80 characters
- **THEN** the response is `invalid` and the device remains unapproved

### Requirement: Owner grant list identifies each approval
`GET /admin/oauth-grants` MUST keep its existing owner-only rules and MUST add `label`, `last_used_at`, and `expires_at` to each item. `label` MUST be `null` when none was stored. The response MUST NOT contain a token, token hash, refresh payload, or rotated hash, and no field name MAY contain `token`, `refresh`, or `hash`.

#### Scenario: Fresh approval has no use and no expiry
- **WHEN** the owner approves a labeled device code and lists grants before the device exchanges the code
- **THEN** that item has the stored label, `last_used_at` is `null`, and `expires_at` is `null`

#### Scenario: Unlabeled grant remains revocable
- **WHEN** a grant stored before labels existed is listed
- **THEN** its `label` is `null` and the owner can still revoke it by id

### Requirement: Grant use and refresh expiry stay distinct
`last_used_at` MUST stay `null` until that grant's access token is used to call the server, and MUST remain after revoke. `expires_at` MUST be the current refresh token's expiry. It MUST be `null` when no refresh token has been issued and when the grant is revoked. Refreshing MUST move `expires_at` forward and MUST NOT change `last_used_at`.

#### Scenario: Token exchange sets expiry but not last use
- **WHEN** the device exchanges an approved code for tokens and the owner lists grants before any access-token call
- **THEN** `expires_at` is a timestamp and `last_used_at` is still `null`

#### Scenario: An access-token call records last use
- **WHEN** a caller uses that grant's access token to call the server and the owner lists grants
- **THEN** `last_used_at` is a timestamp

#### Scenario: Refresh extends expiry without counting as use
- **WHEN** the client refreshes the grant and has not called the server with an access token since the previous list
- **THEN** `expires_at` moves forward and `last_used_at` is unchanged

#### Scenario: Revoke keeps last use and clears expiry
- **WHEN** the owner revokes a grant that has been used and lists again
- **THEN** `revoked_at` is set, `last_used_at` is unchanged, and `expires_at` is `null`

### Requirement: Approved devices panel shows the label
The overview MUST title each grant with its label, or with a shortened id when `label` is `null`. An active row MUST show last use, approval time, and refresh expiry, naming the unused and not-yet-issued states when those values are `null`. A revoked row MUST show last use and revoke time, MUST NOT show expiry, and MUST NOT offer revoke. The panel MUST NOT show a raw token or hash.

#### Scenario: Labeled grant is titled by the label
- **WHEN** the list contains an active grant with a label, no last use, and no expiry
- **THEN** the row title is that label and the row states that it has not been used and has not yet received a refresh token

#### Scenario: Unlabeled grant falls back to the shortened id
- **WHEN** the list contains an active grant whose label is `null`
- **THEN** the row title is the shortened id and revoke remains available

#### Scenario: Revoked row keeps last use
- **WHEN** the list contains a revoked grant with a last-use time
- **THEN** the row shows that time and the revoke time, shows no expiry, and has no revoke action
