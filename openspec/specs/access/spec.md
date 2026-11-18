# access Specification

## Purpose

用一个所属人账号、批准后才生效的 API Key，以及 OAuth 设备码，决定谁可以读写哪些目录。所属人在同一套界面里完成登录、改密和三种批准，用已有接口查看和作废 API Key、查看目录和站点，并查看和作废已批准的 OAuth 设备授权。

## Requirements

### Requirement: Admin shell
Every signed-in admin screen MUST share one shell: a sidebar with the Orbit O, entries for overview, device approval, API key, site activation, password change, and logout, and a top bar linking to `/`. The current entry MUST have `aria-current="page"`. Before the required password change, only the password screen and logout MUST be reachable.

#### Scenario: Password gate hides navigation
- **WHEN** an owner who must change the password opens `/admin/`
- **THEN** the password screen is shown with a logout control and without the other sidebar entries

### Requirement: Approval screens keep their guarantees
The device and API key approval screens MUST show one row per source with native read, write, and visibility checkboxes, a summary of the selected grants, and the sentence `读权限包含该 source 的全部未删除私有页` before the `确认` button. The device screen MUST NOT show key material. The API key screen MUST show the raw `osk_` key only in the response to confirmation, with a copy control.

#### Scenario: Notice precedes confirmation
- **WHEN** the device approval screen is rendered
- **THEN** the read-grant sentence appears before the `确认` button and the markup contains no `osk_`

### Requirement: Site approval screen
The site approval screen MUST show the current pointer, the requested release, a preview link to `/_preview/{releaseId}/` (`/_preview/public-page/` for `public-page`, never `/`), the remaining time from `expires_at`, and approve and reject actions. Before them it MUST say `先预览再上线；上线要你批准，指针不会自动移动` and MUST NOT show the read-grant sentence. An expired or decided activation MUST NOT offer approve.

#### Scenario: Built-in page preview does not use the live path
- **WHEN** the owner opens an activation whose target is `public-page` while a custom release is live
- **THEN** the preview link is `/_preview/public-page/`

#### Scenario: Expired activation cannot be approved
- **WHEN** the owner opens an activation whose `expires_at` has passed
- **THEN** the screen shows it as expired and has no approve action

### Requirement: Overview uses existing operations
The admin overview MUST read `sources_list`, `sources_status`, `list_api_keys`, `list_sites`, anonymous `GET /pcp/v1/public/pages` with `credentials: omit` for per-source public counts, and `GET /admin/oauth-grants`. It MUST NOT show directory delete, deleted directories, or recent writes. Those belong on `/admin/records`. A failure in one panel MUST NOT hide the others. No new PCP operation or error code MUST be added. The overview MUST NOT edit page Markdown or show a page body.

#### Scenario: One source fails
- **WHEN** `sources_status` fails for one source
- **THEN** that row shows a read failure and the key, site, and device panels still render

### Requirement: API key list and revoke
The overview MUST list API keys with label, grant summary, `created_at`, `last_used_at`, and `revoked_at`, and MUST NOT show a raw key or hash. Revoking MUST need a second confirming click, then call `DELETE /pcp/v1/api-keys/{id}` and reload the list. A revoked key MUST show as revoked without a revoke action.

#### Scenario: Revoke needs confirmation
- **WHEN** the owner clicks revoke once on an active key
- **THEN** no request is sent until the owner clicks the confirming action

#### Scenario: Revoked key is final
- **WHEN** the list contains a key with `revoked_at` set
- **THEN** that row shows it as revoked and has no revoke action

### Requirement: Site panel
The overview MUST show the current site pointer and every release from `list_sites` with its `created_at` and a preview link to `/_preview/{id}/`; the built-in page links to `/_preview/public-page/`, never `/`. It MUST NOT offer to delete a release or to move the pointer without an activation request. It MUST show `先预览再上线；上线要你批准，指针不会自动移动` and MUST NOT show the read-grant sentence.

#### Scenario: Releases link to previews
- **WHEN** `list_sites` returns two releases
- **THEN** the panel shows both with links to their `/_preview/{id}/` paths and no delete action

#### Scenario: Site copy is about release, not read grants
- **WHEN** the site panel and the site approval screen are rendered
- **THEN** both contain the site sentence and neither contains `读权限包含该 source 的全部未删除私有页`, which still appears on the device and API key screens

### Requirement: Owner OAuth grant list
The server MUST provide `GET /admin/oauth-grants`. With `Accept: application/json` and an owner session it MUST return `200` and `{"oauth_grants": [...]}` ordered by `created_at`, then `id`, with one item per stored grant, revoked ones included. Each item MUST contain exactly `id`, `site_write`, `sources` (each `{id, read, write, visibility}`), `created_at`, and `revoked_at` (`null` while active). It MUST NOT contain a token, token hash, refresh payload, or rotated hash.

#### Scenario: Owner lists grants without secrets
- **WHEN** the owner approves a device code, the device exchanges it for tokens, and the owner calls `GET /admin/oauth-grants`
- **THEN** the response has one item with the approved `sources` and `site_write`, `revoked_at` is `null`, and the body contains neither the access token nor the refresh token nor any 64-character hash

#### Scenario: Revoked grant stays listed
- **WHEN** the owner revokes a grant through `POST /admin/oauth-grants/{id}/revoke` and lists again
- **THEN** that item has a non-null `revoked_at`

### Requirement: Grant list is owner-only
`GET /admin/oauth-grants` MUST accept only an owner session. A missing or expired session MUST get `unauthorized`, an API key or OAuth token MUST get `forbidden`, and an owner who must still change the password MUST get `password_change_required`, all with the existing error body. Like the existing `POST /admin/oauth-grants/{id}/revoke`, it MUST NOT be added to the PCP operation table, MCP, or `/openapi.json`.

#### Scenario: Agent cannot list grants
- **WHEN** an OAuth token or an API key calls `GET /admin/oauth-grants`
- **THEN** the response is `forbidden`

#### Scenario: Grant list is not published
- **WHEN** `/openapi.json` and MCP `tools/list` are read
- **THEN** neither mentions `oauth-grants`

### Requirement: Approved devices panel
The overview MUST list OAuth grants from `GET /admin/oauth-grants` with a shortened `id`, the grant summary, `site:write`, `created_at` as the approval time, and `revoked_at`. It MUST NOT show a client name, last-used time, or expiry, because none is stored. A revoked grant MUST show as revoked without a revoke action. The device approval screen MAY say that the grant can later be revoked from this panel.

#### Scenario: Revoked grant is final in the panel
- **WHEN** the list contains a grant with `revoked_at` set
- **THEN** that row shows it as revoked and has no revoke action

### Requirement: Grant revoke from the panel
Revoking a grant in the panel MUST need a second confirming click, then call `POST /admin/oauth-grants/{id}/revoke` with the owner session and reload the list. A `not_found` result MUST be shown and followed by a reload.

#### Scenario: Grant revoke needs confirmation
- **WHEN** the owner clicks revoke once on an active grant
- **THEN** no request is sent until the owner clicks the confirming action

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

### Requirement: Single owner bootstrap
On first start with no owner, the system MUST create one owner from `OWNER_LOGIN` and `OWNER_PASSWORD`, store only an Argon2id hash, and require a password change. Later starts MUST NOT use those variables to log in or reset an existing owner. `OWNER_RESET_PASSWORD`, when set, MUST replace the hash, require a password change again, and log without the password. The process MUST refuse to start when no owner exists and no initial password is configured. Startup MUST NOT create an API key.

#### Scenario: Missing initial password refuses startup
- **WHEN** the database has no owner and the initial password variables are unset
- **THEN** the process exits without serving requests

### Requirement: Password change gate
Before the required password change, the only successful owner operations MUST be logout and password change. Every other admin or PCP call MUST return `password_change_required`.

#### Scenario: Unchanged password cannot write
- **WHEN** a newly bootstrapped owner calls `put_page` before changing the password
- **THEN** the response is `password_change_required` and no page is written

### Requirement: One authorization check
After authentication, every operation MUST pass through one authorization decision for the credential, operation, and source. The owner session MUST be allowed every operation, including key management and site approval, and MUST be the only credential with `admin: true`. An API key or OAuth grant MUST carry the approved per-source read, write, and visibility flags plus optional `site:write`. Neither MUST be able to manage keys or approve activation. Read permission on a source MUST include every non-deleted private page in it, and the approval page MUST say so before the owner confirms. There MUST NOT be a separate public-only grant. An API key with unrestricted data access MUST include sources created after the key was approved. An API key and an OAuth grant with the same source flags and the same `site:write` flag MUST get the same result for the same operation. Revoking one key or one grant MUST NOT disable any other credential.

#### Scenario: OAuth cannot approve the site
- **WHEN** an OAuth token with `site:write` calls the site approval route
- **THEN** the response is `forbidden` and the pointer is unchanged

#### Scenario: Hidden source looks missing
- **WHEN** a credential without read permission reads a page in that source, and the same request is repeated for a missing slug and for a soft-deleted slug
- **THEN** all three responses are `not_found` and none contains the body

#### Scenario: Revoking one key leaves another working
- **WHEN** the owner revokes one API key while a second key and an OAuth grant remain
- **THEN** the revoked key fails on its next call and the other two still succeed within their grants

#### Scenario: Same grants match across credential types
- **WHEN** an API key and an OAuth grant have the same source flags and both read the same private page
- **THEN** both receive the same page

### Requirement: API key approval
`whoami` MUST return `{credential, admin, site_write, sources:[{id, read, write, visibility}]}`. `create_api_key` MUST accept a label, either unrestricted data access or an explicit source list, and optional `site:write`. The response MUST be a pending id and approval URL valid for 15 minutes, with no key. The raw key MUST be generated only when the owner opens the approval page and confirms, MUST be shown only in that response, MUST start with `osk_`, and MUST be stored only as a SHA-256 hash. Expiry, a second confirmation, or a missing owner session MUST NOT create a key. Callers MUST be able to send `Authorization: ApiKey <key>` or `X-Api-Key`. Revocation MUST take effect on the next request. An existing key MUST NOT have its permissions changed or its raw value shown again.

#### Scenario: Create does not return a usable key
- **WHEN** the owner calls `create_api_key`
- **THEN** the response has no key material and a request using that response cannot authenticate

#### Scenario: Confirm shows the key once
- **WHEN** the owner confirms a pending key request
- **THEN** the confirmation response contains the raw `osk_` key and a later list shows only metadata

### Requirement: Device-code OAuth
Production discovery MUST advertise only the device code flow. Authorization code with PKCE MUST be enabled only in test configuration and MUST NOT appear in discovery. Password and implicit grants MUST NOT be accepted. Access tokens MUST last 15 minutes. Refresh tokens MUST be stored only as hashes, rotated on use, and the previous token MUST fail immediately. Reuse of a rotated refresh token MUST revoke the whole grant. The verification page MUST be `/admin/device` and MUST require an owner session. A device flow MUST NOT mint an API key.

#### Scenario: Reused refresh token kills the grant
- **WHEN** a client uses a refresh token that was already rotated
- **THEN** that grant can no longer refresh or call protected operations

### Requirement: Owner session cookie
The owner cookie MUST be named `oneself_session`, with `Path=/`, `HttpOnly`, and `SameSite=Lax`. It MUST include `Secure` when the public origin is HTTPS. Admin write requests MUST reject an `Origin` that is not the public origin.

#### Scenario: Cross-origin admin write is rejected
- **WHEN** an owner session sends an admin write whose `Origin` is a different site
- **THEN** the write is rejected and no state changes

### Requirement: Error distinction
A call without a credential to a write, non-public query, activation request, or admin route MUST return `unauthorized`. A valid credential that is not allowed the operation MUST return `forbidden`. An unreadable resource MUST return `not_found`. Hash conflicts MUST return `conflict`. Illegal bodies, fences, slugs, or zips MUST return `invalid`. Oversized uploads MUST return `payload_too_large`. The error body MUST be `{error, message}` using only those codes plus `password_change_required`. The HTTP status MUST be 401 for `unauthorized`, 403 for `forbidden` and `password_change_required`, 404 for `not_found`, 409 for `conflict`, 400 for `invalid`, and 413 for `payload_too_large`. The owner cookie MUST authenticate calls to `/pcp/v1`. The process MUST NOT enable CORS.

#### Scenario: Missing credential on a write
- **WHEN** a caller without a credential calls `put_page`
- **THEN** the HTTP status is 401, `error` is `unauthorized`, and the body contains only `error` and `message`

### Requirement: Owner can see and restore a deleted directory
`GET /admin/deleted-sources` MUST require an owner session and MUST list directories soft-deleted within 30 days, with id and `deleted_at`, and without page bodies. API keys and OAuth grants MUST receive `forbidden`. Restore MUST need a second confirming click, then call `sources_restore`, and reload the current page. Delete from the records page MUST likewise need a second confirming click, then call `sources_delete`. Neither action MUST be offered to a non-owner.

#### Scenario: Deleted directory is listed for the owner
- **WHEN** the owner deleted a directory less than 30 days ago and opens `/admin/records`
- **THEN** that directory appears in the deleted-directory panel and is absent from the live directory list

### Requirement: Deleted directories are paginated
The 30 days are the retention window, not a row cap. Results MUST be ordered by `deleted_at` descending, then id. `limit` MUST default to 20 and MUST NOT exceed 50. `cursor` MUST be a page offset. A full page MUST be followable until a short page. A directory deleted more than 30 days ago MUST NOT appear on any page.

#### Scenario: Deleted directories continue past the first page
- **WHEN** more than 20 directories were soft-deleted within 30 days
- **THEN** the first page shows 20 and the next page shows the rest

#### Scenario: Restore needs confirmation
- **WHEN** the owner clicks restore once
- **THEN** no restore request is sent until the owner clicks the confirming action

#### Scenario: Agent credential cannot list deleted directories
- **WHEN** an API key calls `GET /admin/deleted-sources`
- **THEN** the response is `forbidden`

### Requirement: Recent writes are read-only
The records page MUST list recently updated pages from owner `query`, ordered by `updated_at` descending. The first page MUST use `limit` 20. When that page is full, the panel MUST request the next page with `cursor` until a short page. It MUST NOT treat 20 as the total number of writes. Each row MUST show source, slug, type, title, and `updated_at`. It MUST NOT show the Markdown body, a credential id, or an edit action.

#### Scenario: Latest write is first
- **WHEN** the owner has two readable pages and one was updated later
- **THEN** the recent-write panel lists the later page first and does not include its body

#### Scenario: Writes continue past the first page
- **WHEN** the owner has 21 readable pages
- **THEN** the first page shows 20 and the next page shows the remaining page

### Requirement: Empty admin shows the device-code path
When the owner has no active API key and no approved device grant, the overview MUST show `npx skills add <origin> -a <agent> -s oneself -y`, say the agent requests a device code, and name `/admin/device`. It MUST say an API key is for a script or a long-lived key, not the first conversational connect. Once a grant or an active key exists, this panel MUST NOT replace the grant and key panels.

#### Scenario: Fresh admin shows the command
- **WHEN** the owner opens the overview before any grant or API key exists and the configured origin is `http://127.0.0.1:3000`
- **THEN** the empty state shows `npx skills add http://127.0.0.1:3000 -a <agent> -s oneself -y` and names `/admin/device`

#### Scenario: Existing grant hides the empty state
- **WHEN** the owner already has an approved device grant
- **THEN** the grant panel is shown and the empty-state panel does not replace it

### Requirement: Connect command uses the configured origin
The origin in that command MUST come from `skills.oneself` in the discovery document. It MUST NOT come from the request `Host` or from `location.origin`.

#### Scenario: Spoofed host does not change the command
- **WHEN** the owner opened `/admin` through a host that is not the configured public origin
- **THEN** the command still uses the origin from the discovery document

### Requirement: Owner can delete an OAuth grant record
The server MUST provide `POST /admin/oauth-grants/{id}/delete` for an owner session, with the same origin check as revoke. Deletion MUST be soft: the row stays, with `deleted_at` set. An active grant MUST be revoked first. After deletion, the list MUST NOT include that id. A missing or already deleted id MUST be `not_found`. An API key or OAuth token MUST get `forbidden`. The route MUST NOT be published in OpenAPI or MCP.

#### Scenario: Deleting an active grant removes it and stops its token
- **WHEN** the owner deletes an active device grant and the previous access token calls the server
- **THEN** the grant is absent from the list and the token is not accepted

#### Scenario: Deleting a revoked grant removes the history row
- **WHEN** the owner deletes a grant that is already revoked and lists again
- **THEN** that id is not in the list

#### Scenario: Missing grant is not found
- **WHEN** the owner deletes an id that is not stored
- **THEN** the response is `not_found`

### Requirement: Approved devices panel can delete a row
The overview and the device approval list MUST offer delete for every grant, including revoked ones. Delete MUST need a second confirming click, then call `POST /admin/oauth-grants/{id}/delete` and reload the list. A revoked row MUST still show that it was revoked until it is deleted.

#### Scenario: Revoked row can be deleted after confirmation
- **WHEN** the owner clicks delete once on a revoked grant
- **THEN** no request is sent until the owner clicks the confirming action

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
