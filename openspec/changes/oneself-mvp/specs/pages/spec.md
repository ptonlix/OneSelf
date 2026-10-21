# Spec Delta

## Purpose

保存主人的 Markdown 原文，并用同一套页投影支持任意 `type`，不按资料种类建表。

## ADDED Requirements

### Requirement: Page identity
A page MUST be identified by `(source, slug)`. `source` MUST match `^[a-z][a-z0-9-]{0,62}$` and MUST be the primary key of a business directory. `slug` MUST match `^[a-z0-9][a-z0-9-]{0,79}$` and MUST NOT contain `/`. The system MUST NOT preload directories named `public`, `private`, or `agents`.

#### Scenario: Reject an illegal slug
- **WHEN** a caller writes a page whose slug contains a slash or starts with a hyphen
- **THEN** the write is rejected with `invalid` and no object or projection is stored

### Requirement: Markdown is the authority
The authoritative bytes MUST be the UTF-8 Markdown object at `pages/{source}/{slug}/{sha256}.md`. The content hash MUST be the hex SHA-256 of those bytes. A successful read MUST return the projection of that current object. Rebuilding projections MUST overwrite them from the object, not from the previous projection.

#### Scenario: Rebuild restores the page from the object
- **WHEN** the page projection is deleted and a rebuild runs while the object remains
- **THEN** the page, its chunks, links, tags, facts, and timeline entries match that object

#### Scenario: Rebuild leaves authority data alone
- **WHEN** a rebuild runs after grants, key hashes, the owner, and the site pointer already exist
- **THEN** those four are unchanged

### Requirement: Required frontmatter
A write MUST include frontmatter `type` and `title`. `title` MUST come from frontmatter, not from a heading. `type` MUST match the same pattern as `source`. `visibility` MUST be `public` or `private`; when omitted it MUST be stored as `private`. Any other visibility MUST be rejected as `invalid` and MUST NOT be coerced.

#### Scenario: New page defaults to private
- **WHEN** a caller with write permission creates a page and omits `visibility`
- **THEN** the stored page is `private` and an anonymous public read cannot see it

### Requirement: Conditional whole-page write
`put_page` MUST replace the page with the submitted Markdown. If a hash is supplied it MUST equal the current object hash, otherwise the call MUST fail with `conflict` and leave the object unchanged. Omitting the hash MUST overwrite. `put_pages` MUST write every listed page in one transaction; if any page is invalid, none are written.

#### Scenario: Stale hash does not overwrite
- **WHEN** `put_page` supplies a hash that is not the current object hash
- **THEN** the response is `conflict` and the stored Markdown is unchanged

#### Scenario: One bad page rejects the batch
- **WHEN** `put_pages` contains one illegal page and one legal page
- **THEN** neither page is written

### Requirement: Exact edit
`edit_page` MUST require the current hash. Each edit MUST be a search string that occurs exactly once in the current Markdown, applied in order. A hash mismatch MUST return `conflict`. A search that occurs zero or more than one time MUST return `invalid` and MUST NOT write an object.

#### Scenario: Ambiguous search writes nothing
- **WHEN** an edit search occurs twice in the current Markdown
- **THEN** the response is `invalid` and the object hash is unchanged

### Requirement: Visibility permission
Write permission MUST NOT change `visibility` from `private` to `public` or the reverse. Changing visibility MUST require visibility permission. A new page created as `public` MUST also require visibility permission.

#### Scenario: Writer cannot publish
- **WHEN** a credential with write but not visibility permission changes a private page to `public`
- **THEN** the response is `forbidden` and the page stays `private`

#### Scenario: Writer can still edit the body
- **WHEN** that same credential edits the Markdown and leaves `visibility` unchanged
- **THEN** the write succeeds and the body changes

### Requirement: Soft delete and history
`delete_page` MUST soft-delete. Ordinary reads MUST NOT return a soft-deleted page. `restore_page` MUST succeed only within 30 days. Each successful write MUST append a version containing the hash, object key, frontmatter, and write time, but not a second copy of the body, and MUST keep at most the latest 50 versions per page. An hourly pass in the same process MUST delete pages soft-deleted more than 30 days ago, together with their versions and projections. It MUST also delete objects that no page, version, or file references and that were written more than 7 days ago. It MUST NOT delete site releases. `revert_version` MUST write the retained version as a new current object.

#### Scenario: Deleted page is not readable
- **WHEN** a caller who could previously read a page reads it after soft delete
- **THEN** the response is `not_found`

#### Scenario: Restore after the window fails
- **WHEN** `restore_page` is called more than 30 days after deletion
- **THEN** the page stays deleted

#### Scenario: Expired page is removed by the hourly pass
- **WHEN** the hourly pass runs more than 30 days after a soft delete
- **THEN** that page, its versions, and its projections are gone, and site releases remain

### Requirement: Only two fences
The system MUST recognize only `## Facts` and `## Timeline` as structured fences. Fact items MUST include `id`, `entity`, and `statement`. Optional `confidence` MUST be a number from 0 to 1, and optional `valid_until` MUST be `YYYY-MM-DD`. Timeline lines MUST be `date | title | detail`, and detail MAY be empty. A fence that fails to parse MUST roll back the entire write, leaving no partial projection.

#### Scenario: Broken fence rolls back the page
- **WHEN** a write contains a Facts item without `statement`
- **THEN** the response is `invalid` and neither the object pointer nor the projection changes

### Requirement: Structure operations rewrite Markdown
`remember`, `forget`, `add_timeline_entry`, `add_tag`, `remove_tag`, `add_link`, and `remove_link` MUST change the Markdown or frontmatter and then follow the same write path as `put_page`. They MUST NOT update projection tables by themselves. Tags MUST be the `tags` string array in frontmatter. Links MUST be `[[source/slug]]` only and MUST NOT have a type. `remember` and `forget` MUST name the target page with `source` and `slug` because the fact id is not global.

#### Scenario: Remember changes the object
- **WHEN** `remember` adds a fact to an existing page
- **THEN** the stored Markdown contains that fact under `## Facts` and the returned hash is the new object hash

#### Scenario: Forget removes one fact
- **WHEN** `forget` names an existing fact id on a page
- **THEN** that id is absent from the current Markdown and from the current facts projection, while older version objects still contain it

### Requirement: Reads and directories
`get_page` MUST read the current projection, including a `private` page when the caller can read that source. `list_pages` MUST list only non-deleted pages and MUST filter by `source`, `type`, and slug prefix. `resolve_slugs` MUST answer each requested pair with `exists: false` when the caller cannot read it, and MUST NOT add another error for that pair. `sources_list` MUST list only directories the caller can read. `sources_status` MUST report the non-deleted page count and the latest write time of one directory. `sources_add` MUST succeed only for an owner session or an API key with unrestricted data access. Adding an id that is still soft-deleted MUST return `conflict` and MUST NOT create a second directory. A missing page, a soft-deleted page, a page in a soft-deleted source, and a page in a source the caller cannot read MUST all return the same `not_found`.

#### Scenario: Unreadable slug does not look forbidden
- **WHEN** `resolve_slugs` includes a page the caller cannot read
- **THEN** that pair is `exists: false` and the response is not `forbidden`

#### Scenario: Restricted key cannot add a directory
- **WHEN** an API key without unrestricted data access calls `sources_add`
- **THEN** the response is `forbidden` and no directory is created

### Requirement: Source delete and restore
Only an owner session MUST be able to call `sources_delete` or `sources_restore`. API keys and OAuth grants MUST NOT, even with unrestricted data access. Delete MUST set `sources.deleted_at` and MUST hide every page in that source. Pages that were already soft-deleted MUST stay individually deleted. Pages hidden by this delete MUST be marked so restore can tell them apart. Until restore or purge, the source MUST be absent from `sources_list`, and its pages, media, and search hits MUST be `not_found`, including for the owner. Markdown in other sources MUST NOT be rewritten. Grants MUST keep the source id. `sources_restore` within 30 days MUST clear the source deletion and bring back only the pages hidden by that deletion. After 30 days the hourly purge MUST remove the source and its page projections, detach their files without deleting the bytes, and the name MUST be usable with `sources_add` again.

#### Scenario: Deleting a directory hides its public pages
- **WHEN** the owner deletes a source that contains a public page
- **THEN** anonymous public read of that page is `not_found` and the live site pointer is unchanged

#### Scenario: Agent cannot delete a directory
- **WHEN** an API key with unrestricted data access calls `sources_delete`
- **THEN** the response is `forbidden` and the source remains readable

#### Scenario: Restore does not resurrect an older page delete
- **WHEN** a page was soft-deleted before its source was deleted, and the owner restores the source within 30 days
- **THEN** the source is readable, that older page is still `not_found`, and pages hidden only by the source delete are readable again

#### Scenario: Other pages keep their links
- **WHEN** another page contains `[[health/note]]` and the owner deletes `health`
- **THEN** the other page's Markdown is unchanged and resolving `health/note` returns `exists: false`

### Requirement: Structure reads
`get_tags` MUST return the current frontmatter tags. `get_links` and `get_backlinks` MUST return `(source, slug)` ends with no link type and no Markdown body. `get_timeline` MUST return the current timeline entries. These reads MUST follow the same visibility rules as `get_page`.

#### Scenario: Tags match frontmatter
- **WHEN** a caller who can read a page calls `get_tags`
- **THEN** the tags are exactly the current `tags` array

### Requirement: No per-type tables or DDL
The system MUST NOT create a business table per `type`. A caller using the public or authenticated API MUST NOT be able to execute `CREATE TABLE`. Adding a `type` MUST NOT require a migration.

#### Scenario: A new type does not add a table
- **WHEN** a caller writes a page whose `type` has never been stored
- **THEN** the write succeeds without a new table and a schema migration is not required
