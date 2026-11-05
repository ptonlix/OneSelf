# Spec Delta

## MODIFIED Requirements

### Requirement: Authorized search
`search` MUST match `type`, title, body, and string values in frontmatter on `pages` by contiguous substring. A match MUST NOT depend on `to_tsvector('simple')` tokenization. A contiguous CJK sequence that appears in a readable title or body MUST be a hit. It MUST NOT use `chunks` as the document being searched. Chunks MUST be split on blank lines, MUST be at most 1000 characters, and MUST be rebuildable from `pages`. Each hit MUST be `{source, slug, type, title, snippet}` and MUST NOT include the full Markdown. `snippet` MUST be at most 140 characters. `limit` MUST default to 20 and MUST NOT exceed 50.

#### Scenario: Search does not return the body
- **WHEN** an authorized caller searches for a word that appears in a readable page
- **THEN** the hit identifies the page and contains a snippet no longer than 140 characters

#### Scenario: Type is searchable
- **WHEN** the caller searches for a page `type` that does not appear in the body
- **THEN** that page is still a hit

#### Scenario: Contiguous Chinese text matches
- **WHEN** an authorized caller searches for `上海` and that sequence appears in a readable page title or body
- **THEN** that page is a hit

#### Scenario: Text only in a chunk is not a hit
- **WHEN** a query string appears only in a chunk row and not in `type`, title, body, or frontmatter strings
- **THEN** search returns no hit for it
