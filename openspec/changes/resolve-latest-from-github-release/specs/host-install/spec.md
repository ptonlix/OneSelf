# Spec Delta

## MODIFIED Requirements

### Requirement: No silent downgrade

`install` and `update` in the CLI MUST share one bundle-sync path. Without a user-set `ONESELF_REF`, the CLI MUST compare the installed `.oneself-release` `ref=` with `ONESELF_BUNDLED_REF` and MUST NOT re-extract the bundle or re-pin `ONESELF_IMAGE` when the installed ref is newer. `ONESELF_BUNDLED_REF` MUST NOT be treated as a forced ref. A user-set `ONESELF_REF` MAY force a sync to any tag, including an older one. When neither is present, `install` MUST leave the installed ref alone. `update` MUST resolve GitHub's latest stable release from the `github.com` `/releases/latest` redirect and sync to it when that tag is newer than `.oneself-release`. If it is the same or older, `update` MUST NOT downgrade and MUST only refresh the already-pinned image. A lookup failure MUST stop `update` before `docker compose pull`. Resolving `latest` MUST NOT call the GitHub Releases REST API, including as a fallback.

Version comparison: `MAJ.MIN.PAT` numerically; a release is newer than any prerelease of the same version; two prereleases compare as plain strings; `latest` or malformed refs are not comparable.

#### Scenario: Old Release command on a newer install

- **WHEN** `.oneself-release` has `ref=v1.3.0` and the user runs the `v1.2.0` Release install command without setting `ONESELF_REF`
- **THEN** the CLI warns that the installed version is newer, leaves compose files and `ONESELF_IMAGE` unchanged, and keeps passwords

#### Scenario: Prerelease to release

- **WHEN** `.oneself-release` has `ref=v1.2.3-rc.1` and the user runs the `v1.2.3` Release command
- **THEN** the bundle syncs to `v1.2.3`

#### Scenario: No refs and a newer GitHub tag syncs

- **WHEN** neither `ONESELF_REF` nor `ONESELF_BUNDLED_REF` is set, `.oneself-release` is older than the tag redirected from `github.com` `/releases/latest`, and the user runs `oneself update`
- **THEN** install files sync to that tag and `ONESELF_IMAGE` is re-pinned

#### Scenario: Resolved tag same or older does not downgrade

- **WHEN** neither `ONESELF_REF` nor `ONESELF_BUNDLED_REF` is set and the tag redirected from `github.com` `/releases/latest` is the same as or older than `.oneself-release`
- **THEN** `oneself update` does not downgrade install files or `ONESELF_IMAGE`, and only refreshes the already-pinned image

#### Scenario: Lookup failure stops before pull

- **WHEN** `oneself update` cannot resolve the latest stable release from the `github.com` redirect
- **THEN** it stops before `docker compose pull` and does not call the GitHub Releases REST API

## ADDED Requirements

### Requirement: Latest ref comes from the github.com release redirect

Resolving `latest` MUST request `https://github.com/<ONESELF_REPO>/releases/latest` and MUST read the redirect to `/releases/tag/<tag>`. `ONESELF_REPO` is `owner/repo` and defaults to `ptonlix/OneSelf`. A different `ONESELF_REPO` MUST use that repository. A redirect to another repository MUST fail. The request MUST NOT use `api.github.com`.

#### Scenario: Redirect supplies the stable tag

- **WHEN** `ONESELF_REPO` is the default `ptonlix/OneSelf`, `https://github.com/ptonlix/OneSelf/releases/latest` redirects to `https://github.com/ptonlix/OneSelf/releases/tag/v1.2.3`, and the CLI resolves `latest`
- **THEN** the resolved ref is `v1.2.3` and no request is sent to `api.github.com`

#### Scenario: A different ONESELF_REPO uses that repository

- **WHEN** `ONESELF_REPO` is `example/oneself` and the CLI resolves `latest`
- **THEN** the lookup requests `https://github.com/example/oneself/releases/latest` and does not request `ptonlix/OneSelf`

#### Scenario: Same-repository Location is absolute or relative

- **WHEN** the `Location` for the configured `ONESELF_REPO` is either an absolute URL or a relative `/releases/tag/v1.2.3`
- **THEN** the resolved ref is `v1.2.3`

#### Scenario: Redirect to another repository fails

- **WHEN** the `/releases/latest` redirect for the configured `ONESELF_REPO` points at a different repository
- **THEN** the lookup fails and no request is sent to `api.github.com`

#### Scenario: Missing, other-host, or non-version Location fails

- **WHEN** the `Location` is missing, points at another host, or is not a version tag
- **THEN** the lookup fails and no request is sent to `api.github.com`

### Requirement: Concrete refs are not looked up

A concrete version ref MUST be used as given. Resolving it MUST NOT request `/releases/latest` and MUST NOT call the GitHub Releases REST API.

#### Scenario: Concrete ref skips the redirect lookup

- **WHEN** the CLI resolves `v1.2.3`
- **THEN** it does not request `/releases/latest` and does not call the GitHub Releases REST API

### Requirement: Known ref still downloads the checksummed compose bundle

After a ref is known, the compose bundle MUST still be downloaded from that ref's `github.com` Release asset URL and checksummed as before. That download MUST NOT use the GitHub Releases REST API. The application image MUST still be pulled from the configured image repository, not from GitHub.

#### Scenario: Bundle download is the asset URL

- **WHEN** the CLI has resolved ref `v1.2.3` and fetches the compose bundle
- **THEN** it downloads the bundle and checksum from that ref's `github.com` Release asset URL and does not call `api.github.com`
