# Spec Delta

## Purpose

Lets the owner change one page between public and private from the nebula drawer, without a new protocol operation or a Markdown editor.

## ADDED Requirements

### Requirement: Drawer confirms visibility before writing
The page drawer MUST offer a control that switches that page between `public` and `private`. The first click MUST NOT send a request. The confirming click MUST send only that page's source, slug, and the chosen visibility. The drawer MUST NOT offer a Markdown editor or a control that changes a whole directory.

#### Scenario: First click does not send
- **WHEN** the owner clicks the control to make a private page public
- **THEN** no visibility request is sent and the control asks for confirmation

#### Scenario: Confirming sends one page
- **WHEN** the owner confirms making `notes/shanghai` public
- **THEN** the client sends `visibility: public` for that source and slug only

### Requirement: Visibility route is owner-only
`POST /admin/pages/{source}/{slug}/visibility` MUST accept only an owner session and a JSON body whose only visibility value is `public` or `private`. An API key or OAuth grant MUST receive `forbidden`. A missing or other visibility value MUST receive `invalid`. A missing, deleted, or source-hidden page MUST receive `not_found`. The route MUST NOT be a PCP operation, an MCP tool, or an OpenAPI path.

#### Scenario: Agent credential is forbidden
- **WHEN** an API key posts `visibility: public` for a live page
- **THEN** the response is `forbidden` and the page Markdown is unchanged

#### Scenario: Protocol surface is unchanged
- **WHEN** the operation registry and the MCP tool list are read
- **THEN** neither contains a visibility operation or `/admin/pages`

### Requirement: Only the visibility line changes
The server MUST persist the decision through the existing page write, using the current content hash. It MUST set frontmatter `visibility` to the requested value and MUST leave the body byte-for-byte unchanged. Other frontmatter keys, comments, and attached file ids MUST stay. An omitted `visibility` MUST be treated as `private` and MUST be written explicitly when the value changes.

#### Scenario: Omitted visibility becomes an explicit public line
- **WHEN** the owner confirms public for a page whose frontmatter omits `visibility`
- **THEN** the stored Markdown contains `visibility: public`, the body is unchanged, and an anonymous read returns that page

#### Scenario: Private hides the page and its attached original
- **WHEN** the owner confirms private for a public page that has an attached original
- **THEN** the next anonymous page read and media read do not return them, and the owner can still read both

### Requirement: An unchanged visibility does not write
If the page is already the requested visibility, the server MUST NOT append a version. A stale hash on the existing page write MUST still return `conflict` and MUST NOT overwrite.

#### Scenario: Same visibility does not add a version
- **WHEN** the owner confirms the visibility the page already has
- **THEN** the version count for that page does not increase

#### Scenario: Stale page write still conflicts
- **WHEN** the existing page write is given a hash that is not the current content hash
- **THEN** the response is `conflict` and the current Markdown is unchanged

### Requirement: Confirmation states what disclosure changes
Before the confirming click, making a page public MUST say that the page and its attached originals become anonymously readable immediately, that copies already stored in a site archive are not recalled, and that the site pointer does not move. Making a page private MUST say that the next public read omits the page and its attached originals, and that copies already stored in a site archive remain.

#### Scenario: Public confirmation names anonymous access
- **WHEN** the owner arms the control to make a page public
- **THEN** the confirmation text names anonymous access to the page and its attached originals and no request has been sent

#### Scenario: Private confirmation names the next public read
- **WHEN** the owner arms the control to make a page private
- **THEN** the confirmation text says the next public read omits the page and its attached originals

### Requirement: Drawer shows the new visibility
After a successful change, the drawer MUST show the new visibility and MUST still show the body with frontmatter removed. A failed change MUST leave the shown visibility unchanged and MUST NOT clear the nebula.

#### Scenario: Successful public write updates the drawer
- **WHEN** the owner confirms public and the write succeeds
- **THEN** the drawer shows public and still has no Markdown editor
