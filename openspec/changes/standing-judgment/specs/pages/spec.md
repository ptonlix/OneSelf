# Spec Delta

## MODIFIED Requirements

### Requirement: Soft delete and history
`delete_page` MUST soft-delete. `delete_page` of `self/soul` or `self/recent` MUST instead return `invalid` and MUST NOT soft-delete. Ordinary reads MUST NOT return a soft-deleted page. `restore_page` MUST succeed only within 30 days. Each successful write MUST append a version containing the hash, object key, frontmatter, and write time, but not a second copy of the body, and MUST keep at most the latest 50 versions per page. An hourly pass in the same process MUST delete pages soft-deleted more than 30 days ago, together with their versions and projections. It MUST also delete objects that no page, version, or file references and that were written more than 7 days ago. It MUST NOT delete site releases. `revert_version` MUST write the retained version as a new current object.

#### Scenario: Deleted page is not readable
- **WHEN** a caller who could previously read a page reads it after soft delete
- **THEN** the response is `not_found`

#### Scenario: Restore after the window fails
- **WHEN** `restore_page` is called more than 30 days after deletion
- **THEN** the page stays deleted

#### Scenario: Expired page is removed by the hourly pass
- **WHEN** the hourly pass runs more than 30 days after a soft delete
- **THEN** that page, its versions, and its projections are gone, and site releases remain

#### Scenario: Reserved self page is not soft-deleted
- **WHEN** an owner session calls `delete_page` for `self/soul`
- **THEN** the response is `invalid` and the page remains readable

### Requirement: Source delete and restore
Only an owner session MUST be able to call `sources_delete` or `sources_restore`. API keys and OAuth grants MUST NOT, even with unrestricted data access. `sources_delete` of `self` MUST return `invalid` and MUST NOT set `deleted_at` or hide its pages, including for an owner session. Delete of any other source MUST set `sources.deleted_at` and MUST hide every page in that source. Pages that were already soft-deleted MUST stay individually deleted. Pages hidden by this delete MUST be marked so restore can tell them apart. Until restore or purge, the source MUST be absent from `sources_list`, and its pages, media, and search hits MUST be `not_found`, including for the owner. Markdown in other sources MUST NOT be rewritten. Grants MUST keep the source id. `sources_restore` within 30 days MUST clear the source deletion and bring back only the pages hidden by that deletion. After 30 days the hourly purge MUST remove the source and its page projections, detach their files without deleting the bytes, and the name MUST be usable with `sources_add` again.

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

#### Scenario: Owner cannot delete self
- **WHEN** an owner session calls `sources_delete` for `self`
- **THEN** the response is `invalid` and `self` remains listed
