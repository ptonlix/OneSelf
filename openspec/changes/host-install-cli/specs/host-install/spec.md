# host-install Specification

## Purpose

Define the public host install contract for OneSelf: Release assets, version pinning, checksums, terminal interaction, ingress exclusivity, and upgrade without overwriting secrets.

## Requirements

### Requirement: Public curl entry downloads a verified CLI binary

The GitHub Release asset `oneself.sh` (and `oneself.ps1` on Windows) MUST download the platform binary whose name appears in `SHA256SUMS` and MUST verify the SHA-256 digest before execution. The release workflow pins the script's own tag (`ONESELF_BOOTSTRAP_REF` / `$BootstrapRef`). The script MUST export that tag only as `ONESELF_BUNDLED_REF`. It MUST pass `ONESELF_REF` to the CLI only when the user had set a non-empty `ONESELF_REF` before running it, and MUST otherwise leave `ONESELF_REF` unset. A ref that is not `latest` or `vMAJ.MIN.PAT[-PRE]` MUST be rejected before any download.

When stderr (Unix) or the console (Windows) is interactive, the binary download MUST show a progress bar; otherwise it MUST stay silent. The `SHA256SUMS` download is always silent. Both scripts MUST retry transient download failures (network errors, 5xx) at least 3 times and MUST NOT retry other 4xx responses.

On Unix, when stdin is not a terminal but stdout or stderr is, the script MUST duplicate that already-open terminal descriptor onto the binary's stdin (`<&1`, otherwise `<&2`). It MUST NOT open `/dev/tty` for this handoff: a fresh open is still a TTY, but the Bun-compiled CLI on macOS does not receive keypresses on it, so arrow keys and Enter do nothing. When no standard stream is a terminal, the script MUST keep the original stdin.

On Windows the script runs inside the caller's session under `irm | iex`. It MUST NOT call `exit` (that closes the user's PowerShell window); it MUST report failure with `throw` and return normally on success. It MUST start the binary so that it inherits the console (`Start-Process -NoNewWindow -Wait`), not through a pipeline that hands it a non-TTY stdin. It MUST NOT leave its variables or the `ONESELF_*` env vars it set behind in the caller's session.

#### Scenario: Stable install via curl

- **WHEN** a user runs `curl -fsSL https://github.com/<owner>/OneSelf/releases/latest/download/oneself.sh | sh` for a stable tag
- **THEN** the script downloads `oneself-<os>-<arch>` (or `oneself-linux-<arch>-musl` on musl hosts), checks it against `SHA256SUMS`, and runs `install` with a real terminal for prompts, with `ONESELF_BUNDLED_REF=<tag>` and no `ONESELF_REF`

#### Scenario: Piped stdin reuses the shell terminal descriptor

- **WHEN** the bootstrap runs with stdin not a terminal and stdout a terminal
- **THEN** it executes the CLI with stdin duplicated from that stdout descriptor, and does not open `/dev/tty`

#### Scenario: Windows install via irm | iex

- **WHEN** a user runs `powershell -c "irm …/oneself.ps1 | iex"` from an interactive console
- **THEN** the CLI sees a TTY and prompts; on success the PowerShell session stays open; on a non-zero exit the script throws `oneself: <cmd> 失败（退出码 N）` and the session stays open

### Requirement: Compose bundle stays checksummed and pinned

Downloading `oneself-compose.tar.gz` MUST verify its digest from `SHA256SUMS`. After a successful extract, the installer MUST write `.oneself-release` with `ref=<tag>` and MUST set `ONESELF_IMAGE` to the matching `docker.io/<ns>/oneself:<version>` when the current value is empty or a managed `ptonlix/oneself` (or configured image repo) tag.

#### Scenario: Fresh layout fetch

- **WHEN** the install directory lacks compose files and the CLI fetches the Release bundle
- **THEN** a mismatched SHA-256 fails the install, and a match writes `.oneself-release` and pins `ONESELF_IMAGE`

### Requirement: The CLI is the only installer

Install, update, doctor, backup and restore MUST be implemented only in the CLI (`apps/cli`). The repository MUST NOT ship a second full shell or PowerShell installer. `oneself-compose.tar.gz` MUST contain only `compose.yaml`, `.env.example` and `deploy/Caddyfile`.

After a successful `install` or `update` with a CLI binary at `<root>/bin/oneself` (`bin\oneself.exe` on Windows), the CLI MUST write `<root>/oneself.sh` and `<root>/oneself.ps1` as thin launchers that only set `ONESELF_DIR` to their own directory and forward all arguments to that binary (no arguments means `install`). They MUST NOT contain install logic. The CLI MUST remove `deploy/oneself.sh` / `deploy/oneself.ps1` left in the install root by older bundles, and MUST NOT write launchers into a source checkout or when no binary is installed.

#### Scenario: Launcher forwards to the binary

- **WHEN** a user runs `./oneself.sh update` in the install directory
- **THEN** it runs `bin/oneself update` against that directory, regardless of the caller's working directory or `ONESELF_DIR`

#### Scenario: Re-run upgrade command

- **WHEN** a user re-runs a newer Release's install command (optionally with the `update` subcommand)
- **THEN** compose files sync to the newer bundled ref, existing passwords in `.env` are not overwritten, and at most one ingress profile container remains targeted

### Requirement: No silent downgrade

`install` and `update` in the CLI MUST share one bundle-sync path. Without a user-set `ONESELF_REF`, the CLI MUST compare the installed `.oneself-release` `ref=` with `ONESELF_BUNDLED_REF` and MUST NOT re-extract the bundle or re-pin `ONESELF_IMAGE` when the installed ref is newer. `ONESELF_BUNDLED_REF` MUST NOT be treated as a forced ref. A user-set `ONESELF_REF` MAY force a sync to any tag, including an older one. When neither is present (e.g. running `bin/oneself` or `./oneself.sh` directly), `update` MUST only refresh the already-pinned image; moving to a newer version requires re-running a newer Release's bootstrap.

Version comparison: `MAJ.MIN.PAT` numerically; a release is newer than any prerelease of the same version; two prereleases compare as plain strings; `latest` or malformed refs are not comparable.

#### Scenario: Old Release command on a newer install

- **WHEN** `.oneself-release` has `ref=v1.3.0` and the user runs the `v1.2.0` Release install command without setting `ONESELF_REF`
- **THEN** the CLI warns that the installed version is newer, leaves compose files and `ONESELF_IMAGE` unchanged, and keeps passwords

#### Scenario: Prerelease to release

- **WHEN** `.oneself-release` has `ref=v1.2.3-rc.1` and the user runs the `v1.2.3` Release command
- **THEN** the bundle syncs to `v1.2.3`

### Requirement: Non-interactive and ingress safety

Without a TTY, `install` MUST require `--yes` or `ONESELF_YES=1` and required values via environment variables, or fail fast. Values taken from the environment under `--yes` MUST pass the same validation as interactive input (`PUBLIC_ORIGIN` through `originOk`, `APP_DOMAIN` matching the origin host, passwords through `secretOk`); an invalid value MUST fail without being written. The interactive installer MUST offer exactly four ingress choices — `local` (this host / LAN, the default), `cloudflared`, `caddy`, `tailscale` — and write the choice to `COMPOSE_PROFILES`; under `--yes` it MUST keep a valid existing value, else use `COMPOSE_PROFILES` from the environment, else `local`. With `local`, only the `local` proxy service publishes `HOST_PORT` (default 3000) on the host; when that port is busy the installer MUST pick the next free port and say so, except that an explicitly set `HOST_PORT` under `--yes` MUST fail instead. `PUBLIC_ORIGIN` MUST be `http://<host>:<HOST_PORT>` (not `https`, port equal to `HOST_PORT`) and defaults to `http://<detected physical-interface IPv4>:<HOST_PORT>`, falling back to `127.0.0.1` with a warning rather than a virtual or container interface; a stale origin that does not match MUST be re-asked interactively and MUST fail under `--yes` when given in the environment. No tunnel token or domain is required. Before `up`, the installer MUST stop other ingress services (`local`, `cloudflared`, `caddy`, `tailscale`) not selected in `COMPOSE_PROFILES`. `.env` writes MUST result in mode `0600` on Unix.

#### Scenario: Piped stdin without yes

- **WHEN** `oneself install` runs with stdin not a TTY and without `--yes`
- **THEN** it exits with an error telling the user to use the public bootstrap (which attaches the controlling terminal) or pass `--yes`

### Requirement: Release workflow order and Action authenticity

The release job MUST build required platform binaries and upload Release assets (including flat-name `SHA256SUMS`) before pushing the multi-arch app image to Docker Hub. The Bun setup Action MUST be `oven-sh/setup-bun` and MUST NOT be any other similarly named Action.

#### Scenario: Binary build fails

- **WHEN** a required glibc/darwin/windows binary build fails
- **THEN** the workflow fails before any `docker buildx --push`

### Requirement: musl hosts

On Linux musl (including Alpine), the bootstrap MUST prefer `oneself-linux-<arch>-musl` when listed in `SHA256SUMS`. If that asset is absent, it MUST fail before running anything and tell the user to wait for a Release that ships the musl asset (or use a glibc host). There is no shell fallback.

#### Scenario: Alpine without musl asset

- **WHEN** the host is musl and `SHA256SUMS` has no matching `*-musl` line
- **THEN** bootstrap exits non-zero, names the missing asset, and does not point to any shell installer
