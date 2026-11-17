# Spec Delta

## Purpose

Lets the owner read a nebula page's Markdown and, when opened, preview that page's attached originals in the same frame, without a new protocol operation or a public copy of the file.

## ADDED Requirements

### Requirement: Original preview stays closed until opened
Selecting a page MUST show that page's body, with frontmatter removed, and MUST NOT show an original preview until the owner opens it. When the page has an attached original, the dialog MUST offer an icon that opens the original. Closing the preview MUST leave the body visible. The dialog MUST NOT offer a Markdown editor. Originals MUST NOT become stars.

#### Scenario: Selecting a page does not open the original
- **WHEN** the owner selects a page whose file list contains one PDF
- **THEN** the dialog shows the body without frontmatter and does not show a preview of that PDF

#### Scenario: Closing the preview leaves the body
- **WHEN** the owner opens the original preview and then closes it
- **THEN** the body remains and the preview is gone

#### Scenario: An attached file is still not a star
- **WHEN** a page has an attached original and the owner opens its dialog
- **THEN** the sky does not add a star labeled with that file id

### Requirement: Opened originals share one frame
Opening an original MUST place the body and the original in one shared frame that fills the nebula area, not in two separate windows. The header MUST span both columns, with visibility on the left and close on the right. A hairline MUST separate the columns. The preview column MUST be wider than the notes column. The open, collapse, and new-tab controls MUST be icons, not text buttons labeled 原件, 收起, or 新标签.

#### Scenario: The preview opens inside one frame
- **WHEN** the owner opens the original preview
- **THEN** the body and the original appear in one shared frame whose header spans both columns and a hairline separates the columns

### Requirement: Preview uses the admin host media path
The preview and its new-tab control MUST request `/media/{id}` on the same host as the admin session. They MUST NOT use the absolute URL returned by the file list. The dialog MUST NOT copy the original into the public site.

#### Scenario: Private PDF stays on the admin host
- **WHEN** the file list returns an absolute URL whose host differs from the admin session and an id `file_0123456789abcdef0123456789abcdef`
- **THEN** the preview address is `/media/file_0123456789abcdef0123456789abcdef` and the new-tab control uses that same path

### Requirement: Preview follows the original media type
An attached JPEG, PNG, WebP, or GIF MUST be shown as an image. An attached PDF MUST be shown in an embedded browser preview. Image and PDF previews MUST fill the original pane. Each listed original MUST show its media type and its size in KB or MB, not raw bytes.

#### Scenario: PDF is embedded and can open in a new tab
- **WHEN** the owner opens the preview for a page whose file list contains one `application/pdf` original
- **THEN** the shared frame embeds that file, shows its type and size in KB or MB, and offers an icon that opens the same path in a new tab

### Requirement: Only one original is embedded
When a page has several originals, the dialog MUST preview the first returned original and MUST replace that preview when the owner chooses another. It MUST NOT embed every original at once. An original that is neither an image nor a PDF MUST show its type and size and MUST NOT be embedded.

#### Scenario: Choosing another original replaces the preview
- **WHEN** the owner has opened the preview, the file list returns a PNG and then a PDF, and the owner chooses the PDF
- **THEN** the preview shows the PDF and no longer embeds the PNG

#### Scenario: A non-image, non-PDF original is listed and not embedded
- **WHEN** the owner opens the preview for an original whose media type is neither an image nor a PDF
- **THEN** the dialog shows that type and its size in KB or MB and does not embed an image or an iframe

### Requirement: Missing originals do not invent a preview
A page whose file list is empty MUST keep the single-column dialog and MUST NOT show an original preview. If the graph already reports originals for that page and the file list request fails, the dialog MUST still show the body and MUST say the originals were not read. It MUST NOT present that failure as a page with no originals.

#### Scenario: A page with no files stays a single column
- **WHEN** the owner selects a page and the file list returns no files
- **THEN** the dialog shows the body and does not show an original preview

#### Scenario: A failed list is not an empty page
- **WHEN** the graph says the selected page has originals and the file list request fails
- **THEN** the dialog still shows the body and says the originals were not read
