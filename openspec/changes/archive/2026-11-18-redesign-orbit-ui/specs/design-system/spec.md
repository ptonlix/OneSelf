# Spec Delta

## Purpose

让内置首页和管理端共用 Orbit O 品牌和一套设计 token，字体随应用发布，动效可以关闭。这套品牌只约束这两个内置界面，不约束所属人或 Agent 做的定制站。

## ADDED Requirements

### Requirement: Shared design tokens
`apps/admin` and `packages/public-page` MUST each ship a `src/brand.css` that is byte-for-byte identical. Every brand color in it MUST come from the gradient `#2DD4BF`, `#6D8BF8`, `#A855F7` or the night-sky neutrals. The only other hues MUST be one pending color and one danger color, used only for status labels, notices, and revoke or reject actions. No new workspace package MUST be created for the tokens.

#### Scenario: Token files drift
- **WHEN** one `brand.css` is edited without the other
- **THEN** the unit test comparing the two files fails

### Requirement: Official Orbit O mark
Both front ends MUST use `docs/images/logo.svg` as the favicon and as the mark in the built-in home page, the admin sidebar, and the admin login and password screens. Each `public/favicon.svg` MUST be byte-for-byte equal to `docs/images/logo.svg`. Inline copies MUST use unique gradient and mask ids so several marks on one page render correctly.

#### Scenario: Favicon is the official logo
- **WHEN** the admin or public-page build output is inspected
- **THEN** it contains `favicon.svg` with the same bytes as `docs/images/logo.svg` and `index.html` links it as the icon

### Requirement: Bundled fonts
Both front ends MUST bundle Geist and Geist Mono as woff2 files with their OFL license and MUST NOT request fonts, styles, or scripts from any third-party origin. Chinese text MUST fall back to system fonts. Admin static files ending in `.woff2` MUST be served with `Content-Type: font/woff2`.

#### Scenario: No external font request
- **WHEN** the built `index.html` and CSS of either front end are scanned
- **THEN** they reference no `http://` or `https://` resource

#### Scenario: Admin serves fonts with the right type
- **WHEN** a browser requests a `.woff2` file under `/admin/assets/`
- **THEN** the response status is 200 and `Content-Type` is `font/woff2`

### Requirement: Motion respects reduced motion
Animations MUST change only `transform`, `opacity`, or `stroke-dashoffset`. When `prefers-reduced-motion: reduce` matches, every animation and transition MUST stop, the starfield MUST be drawn once without an animation loop, and entrance-animated content MUST be visible in its final state. No content or control MUST depend on an animation to appear. Decorative SVG and canvas elements MUST be `aria-hidden`.

#### Scenario: Reduced motion shows everything at once
- **WHEN** a visitor with reduced motion enabled opens the built-in home page
- **THEN** all text is visible immediately and no animation frame loop is running

### Requirement: Readable text contrast
Body and secondary text tokens MUST have a contrast ratio of at least 4.5:1 against the page and panel backgrounds they are used on. Every focusable control MUST show a visible focus ring.

#### Scenario: Secondary text meets contrast
- **WHEN** the secondary text token is measured against the darkest and the panel background
- **THEN** both ratios are at least 4.5:1

### Requirement: Brand is limited to built-in surfaces
The tokens, fonts, mark usage, and motion rules MUST apply only to the built-in home page and the admin UI. Custom site releases MUST NOT be required or validated to use them. The product Skill (`skills/oneself/`) MUST NOT define a design system, design tokens, or `data-*` hooks for public pages, and MUST state that the owner or agent chooses the custom site's visual design freely.

#### Scenario: Skill imposes no visual spec
- **WHEN** `skills/oneself/references/public-page.md` is read
- **THEN** it mentions none of `brand.css`, `--teal`, `--orbit`, `data-field`, or `data-type`, and it says no visual specification is imposed

#### Scenario: Upload is not checked against the brand
- **WHEN** an agent uploads a release that uses none of the tokens or fonts
- **THEN** `put_site` accepts it under the existing archive rules alone
