# Spec Delta

## Purpose

Gives the owner a full-screen map of live directories and pages on the admin home, including their wiki-links, without exposing page bodies or adding an agent tool.

## ADDED Requirements

### Requirement: Admin home is the nebula
`/admin` MUST render the nebula in the existing admin shell and MUST NOT render the previous overview cards on that route. The nebula MUST be the first sidebar entry. The sidebar MUST be collapsible into a left rail, and collapsing it MUST let the nebula fill the remaining viewport. The rail MUST stay visible and MUST reopen from an icon, not from text. Device approval, API keys, site activation, password change, and `/admin/records` MUST remain in that sidebar. Other admin routes MUST keep the same shell.

#### Scenario: Opening admin shows the sky beside the menu
- **WHEN** the owner opens `/admin`
- **THEN** the nebula fills the area beside the existing sidebar and the previous overview cards are not shown

#### Scenario: Other admin work stays reachable
- **WHEN** the owner looks at the sidebar
- **THEN** the nebula is the first entry, and the existing device, API key, site, password, and records routes are still offered

#### Scenario: Collapsing the sidebar fills the screen
- **WHEN** the owner collapses the sidebar on `/admin`
- **THEN** the sidebar remains as a left rail, the nebula fills the rest of the viewport, and the rail can be opened again

### Requirement: Owner-only graph read
`GET /admin/graph` MUST require an owner session. API keys and OAuth grants MUST receive `forbidden`. The response MUST include live directories, their live pages, and wiki-links, and MUST NOT include Markdown bodies, credentials, or file bytes. It MUST NOT be a PCP operation, an MCP tool, or an OpenAPI path.

#### Scenario: Agent credential cannot read the graph
- **WHEN** an API key calls `GET /admin/graph`
- **THEN** the response is `forbidden`

#### Scenario: Graph omits hidden pages
- **WHEN** a page is soft-deleted or hidden because its directory was deleted
- **THEN** that page is absent from the graph and its directory is absent if the directory itself is deleted

### Requirement: Stars are pages
Each live directory MUST be one nebula and each of its live pages MUST be one star. The star MUST show that page's title. Original files MUST NOT be stars. A directory with no live pages MUST still appear as a nebula.

#### Scenario: Page title is visible
- **WHEN** the owner views a directory that contains a page titled `现居上海`
- **THEN** that title is shown beside its star

#### Scenario: Attached file is not a star
- **WHEN** a page has an attached original
- **THEN** the original is not a separate star

### Requirement: Filaments join the two stars
A wiki-link MUST be drawn as a dotted filament whose ends coincide with the two stars, including after the sky is rotated. A link whose target is missing or hidden MUST still be drawn, ending at a ghost labeled with that `source/slug`. The filament MUST NOT be a solid stroke.

#### Scenario: Link ends on both pages
- **WHEN** `profile/about` links to `career/acme` and the owner rotates the sky
- **THEN** the filament still ends on those two stars

#### Scenario: Missing target stays visible
- **WHEN** a page links to `work/old-role` and that page does not exist
- **THEN** the filament ends at a ghost labeled `work/old-role`

### Requirement: The owner can turn the sky
Pressing and dragging the primary pointer anywhere on the sky except text inputs, the dock, and the sidebar MUST rotate the view in any direction with no polar stop. A two-finger trackpad scroll MUST rotate the same way. A pinch, a wheel event with the control key, or the bottom-left slider MUST zoom instead of rotate. Dragging the slider right MUST move closer. Dragging it left MUST move farther. A drag MUST NOT open the dock. A click without meaningful movement MUST select the star or nebula under the pointer.

#### Scenario: Drag rotates and does not select
- **WHEN** the owner presses on a page title and drags
- **THEN** the sky rotates and the dock does not open from that drag

#### Scenario: Trackpad scroll rotates
- **WHEN** the owner two-finger scrolls on the sky
- **THEN** the sky rotates and does not zoom

### Requirement: Idle turn is gentle and yields
While the owner is not turning the sky, it MUST turn slowly at the same order of speed as the previous overview auto-rotation, about one turn in three minutes. The turn MUST stop as soon as the owner drags or scrolls, and MUST resume about one second after they stop. `prefers-reduced-motion: reduce` MUST disable the idle turn and MUST still allow drag and trackpad rotation.

#### Scenario: Manual turn pauses idle turn
- **WHEN** the owner drags the sky
- **THEN** the idle turn stops until about one second after the drag ends

#### Scenario: Reduced motion does not auto-turn
- **WHEN** the owner has requested reduced motion and opens `/admin`
- **THEN** the sky does not turn by itself and still rotates when dragged

### Requirement: A right drawer reads the page
Selecting a nebula or a star MUST open a drawer on the right, not a small corner card. A directory action MUST require a second confirming click before `sources_delete`. A page action MUST require a second confirming click before `delete_page`. The page drawer MUST show the title, path, visibility, outgoing links, incoming links, original media types, and the page body with frontmatter removed. It MUST NOT offer an edit action.

#### Scenario: First delete click does not send
- **WHEN** the owner clicks delete once on a directory or a page
- **THEN** no delete request is sent until the confirming click

#### Scenario: Drawer shows the body
- **WHEN** the owner selects a page whose body contains employment dates or project notes
- **THEN** the right drawer shows that body and does not show the frontmatter fence

### Requirement: Displaced overview information remains available
The device-code connect command MUST still appear when the owner has no active API key and no approved device grant, and MUST NOT cover the sky so that it cannot be turned. The approved-device list and its revoke action MUST be available on `/admin/device`. `/admin/records` MUST keep directory delete, 30-day restore, and recent writes as already specified.

#### Scenario: Fresh admin still shows the connect command
- **WHEN** the owner opens `/admin` before any grant or API key exists
- **THEN** the connect command is visible and the sky can still be turned

#### Scenario: Grants are listed on the device page
- **WHEN** the owner opens `/admin/device` after approving a grant
- **THEN** that grant is listed and can be revoked with the existing confirmation

### Requirement: Incomplete graph is labeled
The graph response MUST include every live page and link until a stated cap. If the cap is exceeded, the response MUST say it is truncated and the sky MUST say it is incomplete. A truncated sky MUST NOT be presented as the full map.

#### Scenario: Truncation is visible
- **WHEN** the live graph exceeds the cap
- **THEN** the response is marked truncated and the sky says it is not complete
