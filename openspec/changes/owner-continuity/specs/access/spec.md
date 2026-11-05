# Spec Delta

## MODIFIED Requirements

### Requirement: Overview uses existing operations
The admin overview MUST read `sources_list`, `sources_status`, `list_api_keys`, `list_sites`, anonymous `GET /pcp/v1/public/pages` with `credentials: omit` for per-source public counts, and `GET /admin/oauth-grants`. It MUST NOT show directory delete, deleted directories, or recent writes. Those belong on `/admin/records`. A failure in one panel MUST NOT hide the others. No new PCP operation or error code MUST be added. The overview MUST NOT edit page Markdown or show a page body.

#### Scenario: One source fails
- **WHEN** `sources_status` fails for one source
- **THEN** that row shows a read failure and the key, site, and device panels still render

## ADDED Requirements

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
