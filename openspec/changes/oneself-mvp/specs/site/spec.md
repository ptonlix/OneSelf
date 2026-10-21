# Spec Delta

## Purpose

用一个静态文件指针发布唯一的公开落地页，并让页面自己向公开 PCP 读取会变化的资料。

## ADDED Requirements

### Requirement: One site pointer
The system MUST keep a single site pointer. With no custom release it MUST point at `original`, served from the application image. `list_sites` MUST describe that one pointer and the existing releases. It MUST NOT imply multiple sites. Serving a site path MUST NOT query the pages projection.

#### Scenario: Fresh install serves the built-in page
- **WHEN** a visitor opens `/` before any activation
- **THEN** the response is the built-in original page

### Requirement: Original page behavior
The original page MUST be one landing page, without a separate resume URL and without client-side routing. An unknown path MUST return 404 and MUST NOT fall back to `/`. With no public pages it MUST show an empty state. With public pages it MUST show every public `profile`, plus public `experience` and `education`, and for any other public type the title, type, and body. List data MUST contain only `source`, `slug`, `type`, and `title`. The page MUST NOT call facts, timeline, tags, or links. Body text MUST be loaded from the public single-page read. A later change to public data MUST appear on the next request without another activation. Changing a page to `private` MUST hide it and its media from later anonymous reads. Bytes already stored inside an uploaded zip MUST NOT be rewritten or deleted because of that change.

#### Scenario: Missing path is not the landing page
- **WHEN** a visitor requests a path the current release does not contain
- **THEN** the response is 404

#### Scenario: Making a page private needs no republish
- **WHEN** the owner changes a public experience page to `private` after the site is already active
- **THEN** the next public page read is `not_found` and `/` is still the same release

### Requirement: Public read surface
Anonymous clients MUST be able to call only `GET /pcp/v1/public/sources`, `GET /pcp/v1/public/pages`, `GET /pcp/v1/public/pages/{source}/{slug}`, and `POST /pcp/v1/public/search`, plus public media. A public page read MUST return `{source, slug, type, title, visibility, frontmatter, markdown, hash}` with `visibility` equal to `public`. Site scripts MUST send `credentials: omit`. Site responses MUST NOT set a cookie.

#### Scenario: Private page is invisible to the public page
- **WHEN** the only profile is `private`
- **THEN** the public page list does not include it and the public single-page read is `not_found`

### Requirement: Upload is not activation
`get_site` MUST download the original-page source zip from the image, never an uploaded dist. `put_site` MUST accept a zip of at most 20 MiB and 200 files whose root contains `index.html`. A zip with path traversal, a symlink, an absolute path, or a reserved path (`pcp`, `oauth`, `.well-known`, `admin`, `skills`, `media`, `_preview`) MUST be rejected entirely and MUST NOT create a release. Preview MUST be anonymous at `/_preview/{releaseId}/` and MUST NOT move the pointer. The release id MUST be `rel_` plus 32 hexadecimal characters. The system MUST NOT provide an endpoint that deletes a release.

#### Scenario: Preview leaves the live path unchanged
- **WHEN** an anonymous visitor opens a preview URL after an upload
- **THEN** `/` still returns the previous pointer and the preview URL returns the uploaded files

### Requirement: Activation needs the owner
`activate_site` MUST create a pending activation for `rel_...` or `original`, valid for 15 minutes, and MUST return an approval URL. The response MUST NOT move the pointer. Only an owner session approving that activation MUST move the pointer. Rejection, expiry, or no decision MUST leave the live path unchanged. Returning to an older release MUST be another activation and approval. An agent MUST NOT be able to call the approval route.

#### Scenario: Agent approval cannot publish
- **WHEN** a credential with `site:write` calls `activate_site` and then calls the owner approval route
- **THEN** the pointer is unchanged and the approval call is `forbidden`

#### Scenario: Owner approval publishes
- **WHEN** the owner approves a pending activation
- **THEN** `/` serves that release and other paths present in the release are served with it
