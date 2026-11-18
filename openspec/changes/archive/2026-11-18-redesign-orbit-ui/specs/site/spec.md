# Spec Delta

## Purpose

内置页不再预设任何资料版式：无论有没有公开页，`/` 在没有定制 release 时都只显示固定首页，讲 OneSelf 的理念、「公开」的含义和怎样让 Agent 生成并上线自己的展示页。个人展示页只由 Agent 在读过公开资料后生成，经所属人批准上线。

## MODIFIED Requirements

### Requirement: Original page behavior
The built-in public page MUST be one landing page, without a separate resume URL and without client-side routing. An unknown path MUST return 404 and MUST NOT fall back to `/`. The built-in page MUST always render the same fixed home page, whether or not public pages exist. It MUST NOT call the public PCP or public media, and MUST NOT list, render, or count pages, fields, or files; the home content MUST be present in the served `index.html` without running a script. Personalized display of public data MUST come only from a custom release built by an agent and activated by the owner. A later change to public data MUST appear on the next request of a custom release that reads the public PCP, without another activation. Changing a page to `private` MUST hide it and its media from later anonymous reads. Bytes already stored inside an uploaded zip MUST NOT be rewritten or deleted because of that change.

#### Scenario: Missing path is not the landing page
- **WHEN** a visitor requests a path the current release does not contain
- **THEN** the response is 404

#### Scenario: Making a page private needs no republish
- **WHEN** the owner changes a public experience page to `private` after the site is already active
- **THEN** the next public page read is `not_found` and `/` is still the same release

#### Scenario: Public pages do not change the built-in page
- **WHEN** the pointer is `public-page` and the owner has public `profile` and `experience` pages
- **THEN** `/` returns the fixed home page, contains no `article` element and none of those pages' titles, and the page sends no request to `/pcp/v1/public/` or `/media/`

## ADDED Requirements

### Requirement: Home page content
The home page MUST show the slogan `One self. One context. Every AI.` and the project philosophy, including the balance of efficiency and privacy. It MUST explain that a page becomes public by setting `visibility: public` in its frontmatter, that public pages are then readable by any AI without credentials, and that setting a page back to `private` hides it at once. It MUST NOT prescribe which page types or frontmatter fields a display page shows.

#### Scenario: Home explains what public means
- **WHEN** a visitor opens `/` while the pointer is `public-page`
- **THEN** the page shows the slogan, `visibility: public`, and who can read public and private pages

#### Scenario: No preset type layout
- **WHEN** the built `index.html` of the built-in page is inspected
- **THEN** it contains no field list for `profile`, `experience`, or `education` and no `data-type` or `data-field` attribute

### Requirement: Home page explains the display page workflow
The home page MUST tell the owner, in plain steps, to choose which pages are public, ask an agent with the `oneself` Skill to build a display page from them, check the preview, and approve it in the admin console before it replaces `/`. It MUST link to `/admin`. It MUST NOT name the site tools or their limits; the Skill and the discovery document own those.

#### Scenario: Fresh install explains how to publish
- **WHEN** a visitor opens `/` while the pointer is `public-page`
- **THEN** the page shows the steps from choosing public pages to preview and owner approval, and a link to `/admin`

### Requirement: Home page shows how to install the Skill
The home page MUST show the documented install command `npx skills add https://<你的站点>` in a copyable block, with `<你的站点>` visibly marked as a placeholder in the served HTML. It MUST NOT show any other install command or package name, and MUST NOT explain how the installer finds and downloads the Skill.

#### Scenario: Skill install command present
- **WHEN** the built `index.html` of the built-in page is inspected
- **THEN** it contains `npx skills add https://` followed by the marked placeholder, and no `agent-skills/index.json`, Skill archive, or `SKILL.md` path

### Requirement: Home hero has no buttons
The home hero, made of the slogan and the lead, MUST NOT contain call-to-action links or buttons. The navigation links to the sections.

#### Scenario: Hero has no buttons
- **WHEN** the built `index.html` of the built-in page is inspected
- **THEN** the hero contains no link or button, and there is no 「安装 Skill」 or 「生成我的展示页」 button

### Requirement: Home page shows the address being viewed
In the served HTML, the install command and the discovery address MUST carry a marker and a fallback: the placeholder or the origin-rooted path `/.well-known/pcp`. On an `http:` or `https:` page the script MUST show `location.origin` plus the path, hide the placeholder hint, and make copy buttons copy the filled value. It MUST use the origin and never the current path. On an origin of `null` (such as `file://`) or without a script, the fallback MUST stay.

#### Scenario: Command shows the address being viewed
- **WHEN** a visitor opens `http://127.0.0.1:3000/` or `http://127.0.0.1:3000/_preview/public-page/` with scripts enabled and copies the install command
- **THEN** the page shows `http://127.0.0.1:3000/.well-known/pcp` and the clipboard receives `npx skills add http://127.0.0.1:3000`

#### Scenario: No origin to show
- **WHEN** the page is opened from `file://` or with scripts disabled
- **THEN** the install command shows the marked placeholder and the discovery address starts with `/`

### Requirement: Home page explains using the Skill
After the install step, the home page MUST say briefly that the agent connects only after the owner approves a device code or gives it an API key, revocable at any time. It MUST give copyable prompts for asking the agent to upload and manage data, keeping it private by default, and to build the display page for owner approval. Admin paths and tool names MUST be left to the Skill.

#### Scenario: Home explains connecting and using the agent
- **WHEN** a visitor reads the install section
- **THEN** it covers owner approval of the connection, uploading data through the agent, and building the display page for approval, without `/admin/device`, `/admin/api-keys/new`, or site tool names

### Requirement: Home page links to GitHub and has no deploy command
The home page MUST link to `https://github.com/ptonlix/OneSelf`. Because anyone seeing the page already has a running server, it MUST NOT show a server install or deploy command, including `docker`, `docker compose`, `git clone`, or `pnpm install`.

#### Scenario: GitHub link present
- **WHEN** the built `index.html` of the built-in page is inspected
- **THEN** it contains a link whose `href` is `https://github.com/ptonlix/OneSelf`

#### Scenario: No install or deploy command
- **WHEN** the built `index.html` of the built-in page is inspected
- **THEN** it contains none of `docker`, `compose up`, `git clone`, or `pnpm install`

### Requirement: Home page reveals nothing about data
The home page MUST be static copy and MUST be byte-for-byte the same response whatever pages, files, or visibility the owner has. It MUST NOT say or imply whether any public or private data exists, MUST NOT contain the text `私有页`, and the served HTML MUST NOT embed an absolute site origin; it MUST use a marked placeholder or a path. It MUST NOT add a path: unknown paths MUST still return 404.

#### Scenario: Same home page with or without data
- **WHEN** a visitor opens `/` on an empty install and again after the owner has added private and public pages
- **THEN** both responses have identical bodies

### Requirement: Fixed home page footer
The built-in home page MUST end with a footer that contains `Powered by OneSelf`. There MUST NOT be a setting, environment variable, or operation that hides or changes it. Custom site releases MAY have any footer or none.

#### Scenario: Footer cannot be turned off
- **WHEN** the built `index.html` of the built-in page is inspected
- **THEN** its footer contains `Powered by OneSelf` and the page reads no configuration to decide whether to show it

### Requirement: One section teaches the agent
Installing the Skill and agent access MUST be one home section, with one navigation entry. The Skill owns the workflows and the PCP discovery document `/.well-known/pcp` owns the interface details, so the page MUST show `/.well-known/pcp`, copyable, as the single entry point for an agent and MUST NOT list other endpoints (OpenAPI, MCP, OAuth metadata, public or media paths), auth headers, upload limits, or the server stack.

#### Scenario: No separate agent section
- **WHEN** the built `index.html` of the built-in page is inspected
- **THEN** the install section contains the install command, the three workflow cards, and the copyable `/.well-known/pcp`, there is no separate `#agents` section or navigation entry, and no `/openapi.json`, `/mcp`, `/pcp/v1/`, or `/media/` path

### Requirement: Skill reads the discovery document first
`skills/oneself/SKILL.md` MUST tell the agent to read `{origin}/.well-known/pcp` before its first call, with the origin taken as for every call (`metadata.oneself_origin` in the served copy), and to take operations, headers, public endpoints, and upload limits from it and parameters from the OpenAPI or MCP schemas. The Skill and its references MUST describe workflows, including owner approvals, and MUST NOT repeat paths, header formats, upload fields, or limits.

#### Scenario: Skill defers to discovery
- **WHEN** the Skill files are read
- **THEN** `SKILL.md` has a section on reading `{origin}/.well-known/pcp` before the other steps, and no file contains a `/pcp/v1/` path, an `Authorization` header example, a multipart field name, or a size limit

### Requirement: Skill names the public API as the contract
`skills/oneself/references/public-page.md` MUST state that the anonymous public HTTP endpoints are the contract for custom sites, MUST give plain `fetch` with `credentials: "omit"` as a complete way to read them, and MUST NOT impose any visual specification.

#### Scenario: Reference works without the repository
- **WHEN** `references/public-page.md` is read
- **THEN** it points to the discovery `public` endpoints and `uploads.put_site`, mentions `credentials: omit`, and says no visual specification is imposed

### Requirement: Skill requires bundling the public client
The reference MUST say a custom site MAY use `@oneself/public-client`. Because that package is private, unpublished, and not served, and a release is only uploaded static files, the reference MUST require bundling the client into the build output, for example by copying `packages/public-client/src/client.ts`, and MUST forbid a runtime install or a CDN import.

#### Scenario: Reference explains bundling
- **WHEN** `references/public-page.md` is read
- **THEN** it mentions `@oneself/public-client`, `packages/public-client/src/client.ts`, and bundling into the build output, and it contains none of `npm install @oneself/public-client`, `esm.sh`, `unpkg`, or `jsdelivr`

#### Scenario: Bundled client works from a release
- **WHEN** a release built with the client bundled in calls `listPages()` from `/` or from `/_preview/{id}/`
- **THEN** the same-origin request to `/pcp/v1/public/pages` succeeds without credentials and the release has no bare import of `@oneself/public-client`

### Requirement: Site assets load under the preview path
The built-in page MUST reference its scripts, styles, fonts, and images with relative paths, so that it loads the same at `/` and at `/_preview/public-page/`. The Skill reference MUST tell agents to build custom sites with relative asset paths for the same reason.

#### Scenario: Built-in page previews while a custom release is live
- **WHEN** a custom release is live and the owner opens `/_preview/public-page/`
- **THEN** every script and style the page references resolves under `/_preview/public-page/` and returns `200`, and none resolves to `/assets/` of the live site
