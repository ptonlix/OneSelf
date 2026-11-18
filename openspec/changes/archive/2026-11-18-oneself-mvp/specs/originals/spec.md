# Spec Delta

## Purpose

保存图片和 PDF 原件，并只通过本站地址按页的可见性把字节交给调用方。

## ADDED Requirements

### Requirement: Accepted originals
An upload MUST accept only JPEG, PNG, WebP, GIF, and PDF, and MUST reject a file larger than 20 MiB with `payload_too_large`. The bytes MUST go to object storage. The response MUST return an id and a same-origin media URL. The caller MUST NOT receive a disk path or bucket address.

#### Scenario: Unsupported type is rejected
- **WHEN** a caller uploads a file that is not one of the accepted media types
- **THEN** the response is `invalid` and no file id is created

### Requirement: Upload does not attach
`file_upload` MUST store the file with no page. `put_page` MUST attach ids listed in frontmatter `files` only when that write commits. If an id already belongs to another page, the whole page write MUST fail and MUST NOT move the file. Removing an id from frontmatter MUST detach it and leave the bytes stored as private.

#### Scenario: File stays unattached until the page write
- **WHEN** a file is uploaded and no later page lists it
- **THEN** `file_list` for a page does not include it, and an anonymous media read returns `not_found`

#### Scenario: File owned by another page rejects the write
- **WHEN** `put_page` lists a file id already attached to a different page
- **THEN** the page write fails and the file remains attached to the original page

### Requirement: Media visibility
`GET /media/{id}` MUST return the bytes when the owning page is `public` and not deleted. When the file has no page, the page is deleted, or the page is `private`, only a credential that can read that source MUST receive the bytes. Every other caller MUST receive `not_found`, the same as a missing id. `file_url` MUST return `{id, url, media_type, byte_size, sha256}` where `url` is the absolute same-origin `/media/{id}` URL, and MUST NOT return the bytes itself. `file_list` with `source` and `slug` MUST list that page's files. Only the owner MAY omit the page, and then the list MUST contain only unattached files. Development and production MUST store bytes in RustFS through the object port. Neither configuration offers a local-directory adapter. The system MUST NOT use one in development or production. An in-memory fake is allowed only in unit tests.

#### Scenario: Private media looks missing
- **WHEN** an anonymous caller requests media for a file whose page is `private`
- **THEN** the response is `not_found`

#### Scenario: Public media is readable
- **WHEN** an anonymous caller requests media for a file whose page is `public` and not deleted
- **THEN** the response is the stored bytes and media type

#### Scenario: Owner lists only unattached files
- **WHEN** the owner calls `file_list` without a page
- **THEN** every returned file has no page, and a file attached to a page is absent
