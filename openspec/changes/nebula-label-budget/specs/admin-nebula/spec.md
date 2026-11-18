# Spec Delta

## MODIFIED Requirements

### Requirement: Stars are pages

Each live directory MUST be one nebula and each of its live pages MUST be one star. Original files MUST NOT be stars. A directory with no live pages MUST still appear as a nebula. A page title MUST be shown beside its star when that title does not cover a directory name, a ghost label, or another page title. A title that does not fit MUST stay hidden until the pointer is over that star or that page is selected, and MUST then be shown even if it covers another label. Directory names and ghost labels MUST always be shown. While a directory is selected, titles from that directory MUST be preferred over titles from other directories when choosing which titles fit. When the sky cannot be drawn, the fallback list MUST show every page title without truncation.

#### Scenario: Page title is visible when it fits

- **WHEN** the owner views a directory that contains a page titled `现居上海` and that title does not cover another label
- **THEN** that title is shown beside its star

#### Scenario: Covered title appears on the star

- **WHEN** a page title is hidden because it would cover another label and the owner points at that star
- **THEN** that title is shown beside the star

#### Scenario: Attached file is not a star

- **WHEN** a page has an attached original
- **THEN** the original is not a separate star

## ADDED Requirements

### Requirement: Directories stay apart

A single directory MUST be placed at the origin. Two or more directories MUST be placed so that their page clouds do not contain each other's stars, and a small set of directories MUST keep at least the previous ring radius of 120. Directory names, glows, and click targets MUST follow the star cloud, not a linear page-count radius. A click on a page star MUST select that page even when another directory's glow covers the same screen area. Page stars MUST be placed on a cap facing the initial camera rather than on a full sphere. If that layout does not fit at the initial camera distance, the sky MUST start farther back, and the far end of the zoom slider MUST match that farther limit.

#### Scenario: One directory is centered

- **WHEN** the graph has one directory
- **THEN** that directory is placed at the origin

#### Scenario: Neighboring page clouds do not contain each other

- **WHEN** two directories each have enough pages to form a page cloud
- **THEN** no page star of one directory lies inside the other directory's page cloud

#### Scenario: A crowded directory name stays on its cloud

- **WHEN** a directory has many more pages than its neighbors
- **THEN** its name stays beside its own stars, its glow does not use a linear page-count radius, and a click on another directory's star selects that star rather than the crowded directory

### Requirement: Filaments dim until a page is selected

A filament MUST remain a dotted line whose ends stay on its stars. When no page is selected, every filament MUST be fainter than a filament that touches the selected page. Filaments that do not touch the selected page MUST be fainter than the idle filaments. Selecting a page MUST NOT move filament ends.

#### Scenario: Selecting a page brightens only its filaments

- **WHEN** the owner selects a page that has a wiki-link and other filaments are also drawn
- **THEN** the filament that touches the selected page is brighter than the others, and every filament still ends on its stars
