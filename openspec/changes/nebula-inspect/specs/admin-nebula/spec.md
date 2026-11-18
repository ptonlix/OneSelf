# Spec Delta

## ADDED Requirements

### Requirement: The view can move to a cluster

The sky MUST keep a movable look-at point. Dragging the primary pointer and a two-finger scroll MUST still rotate the view around that point, with no polar stop. Shift-drag and right-button drag MUST pan the look-at point in the view plane and MUST NOT open the dock. A wheel event with the control key and a pinch MUST zoom toward the pointer, keeping the point under the pointer in place. The bottom-left slider MUST zoom toward the current look-at point, and moving it to the far end MUST return the look-at point to the map center. Selecting a directory or a page MUST move the view to frame that directory or page without hiding its neighbors. `prefers-reduced-motion: reduce` MUST jump instead of animating that move. A double-click on empty sky MUST return to the overview.

#### Scenario: Zoom keeps the point under the pointer

- **WHEN** the owner zooms with the control key while the pointer is over a cluster that is not at the map center
- **THEN** that cluster stays under the pointer as it grows

#### Scenario: Shift-drag pans and does not select

- **WHEN** the owner holds Shift and drags the sky
- **THEN** the view pans, the sky does not rotate from that drag, and the dock does not open

#### Scenario: Selecting a directory frames it

- **WHEN** the owner selects a directory
- **THEN** the view moves to that directory and the drawer still opens

#### Scenario: Empty double-click returns to the overview

- **WHEN** the owner double-clicks empty sky
- **THEN** the view returns to the map center

### Requirement: Sky gestures are explained on the map

The nebula MUST offer a gesture guide that is collapsed until the owner opens it. The guide MUST name how to turn, pan, zoom toward the pointer, frame a selection, and return to the overview. It MUST NOT cover the sky so that the sky cannot be turned.

#### Scenario: The guide starts closed

- **WHEN** the owner opens the nebula
- **THEN** the gesture guide is present and collapsed

## MODIFIED Requirements

### Requirement: The owner can turn the sky

Pressing and dragging the primary pointer anywhere on the sky except text inputs, the dock, and the sidebar MUST rotate the view in any direction, with no polar stop and no polar twist. Shift-drag and right-button drag are exceptions: they MUST pan the look-at point instead of rotating. A two-finger trackpad scroll MUST rotate the same way as a primary drag. A pinch and a wheel event with the control key MUST zoom toward the pointer instead of rotating. The bottom-left slider MUST zoom instead of rotating. Dragging the slider right MUST move closer. Dragging it left MUST move farther. A drag MUST NOT open the dock. A click without meaningful movement MUST select the star or nebula under the pointer.

#### Scenario: Drag rotates and does not select

- **WHEN** the owner presses on a page title and drags
- **THEN** the sky rotates and the dock does not open from that drag

#### Scenario: Trackpad scroll rotates

- **WHEN** the owner two-finger scrolls on the sky
- **THEN** the sky rotates and does not zoom
