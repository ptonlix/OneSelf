# Spec Delta

## Purpose

让调用方在自己读得到的页里按标题、正文和 frontmatter 查找，并让公开站点只命中公开页。

## ADDED Requirements

### Requirement: Authorized search
`search` MUST match `type`, title, body, and string values in frontmatter on `pages`. It MUST NOT use `chunks` as the document being searched. Chunks MUST be split on blank lines, MUST be at most 1000 characters, and MUST be rebuildable from `pages`. Each hit MUST be `{source, slug, type, title, snippet}` and MUST NOT include the full Markdown. `snippet` MUST be at most 140 characters. `limit` MUST default to 20 and MUST NOT exceed 50.

#### Scenario: Search does not return the body
- **WHEN** an authorized caller searches for a word that appears in a readable page
- **THEN** the hit identifies the page and contains a snippet no longer than 140 characters

#### Scenario: Type is searchable
- **WHEN** the caller searches for a page `type` that does not appear in the body
- **THEN** that page is still a hit

### Requirement: Public search hides private pages
Anonymous public search MUST consider only `visibility: public` pages that are not deleted. A private page MUST NOT affect the hits or the count. There MUST be no anonymous `query`.

#### Scenario: Private text is not a public hit
- **WHEN** the only page containing a query string is `private`
- **THEN** anonymous public search returns no hit for it

### Requirement: Filtered query
`query` MUST filter by source, type, tag, and update time without a public projection. Each row MUST be `{source, slug, type, title, updated_at}`. `limit` MUST default to 20 and MUST NOT exceed 50. A caller without a credential MUST receive `unauthorized`.

#### Scenario: Anonymous query is rejected
- **WHEN** a caller without a credential calls `query`
- **THEN** the response is `unauthorized`

### Requirement: Recall reads current facts
`recall` MUST search the current facts projection by entity or statement and MUST NOT create a table. It MUST NOT return facts that belong only to an older version.

#### Scenario: Forgotten fact is not recalled
- **WHEN** a fact was removed from the current page and the caller recalls its statement
- **THEN** that fact is absent from the result
