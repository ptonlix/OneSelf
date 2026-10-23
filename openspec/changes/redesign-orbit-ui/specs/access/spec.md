# Spec Delta

## Purpose

让所属人在同一套界面里完成登录、改密和三种批准，用已有接口查看和作废 API Key、查看目录和站点，并通过新增的只读路由查看和作废已批准的 OAuth 设备授权。

## ADDED Requirements

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
The admin overview MUST read only `sources_list`, `sources_status`, `list_api_keys`, `list_sites`, anonymous `GET /pcp/v1/public/pages` with `credentials: omit` for per-source public counts, and `GET /admin/oauth-grants`. A failure in one panel MUST NOT hide the others. `GET /admin/oauth-grants` MUST be the only new route; no new PCP operation or error code MUST be added.

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
