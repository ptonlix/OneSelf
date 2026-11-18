# Spec Delta

## ADDED Requirements

### Requirement: Installed backup does not need a checkout
An installed CLI MUST run `backup` and `restore` in the install directory without a git checkout, host Node.js, host `pg_dump`, or `ONESELF_REPO_ROOT`. It MUST use bundle format 1 and that directory's compose file. It MUST NOT invent a second bundle format. The repository export and import commands MUST keep working.

#### Scenario: Install directory has no transfer script
- **WHEN** the owner runs backup in an install directory that does not contain `scripts/transfer-cli.ts`
- **THEN** the command writes a format-1 archive and does not ask the owner to clone the repository

### Requirement: Transfer waits until the app is stopped
Backup and restore MUST refuse while the `app` service is running. An interactive CLI MAY stop only `app`, run the transfer, and start `app` again, and MUST ask before stopping it. A non-interactive run MUST require `--stopped` and MUST NOT stop services itself. Postgres and object storage MUST stay up. The transfer MUST NOT publish database ports.

#### Scenario: Non-interactive refuses a running app
- **WHEN** backup runs without a terminal and without `--stopped` while `app` is running
- **THEN** it exits non-zero and does not write an archive

#### Scenario: Interactive stop is limited to the app
- **WHEN** an interactive backup is confirmed
- **THEN** only the `app` service is stopped for the transfer and it is started again afterward

### Requirement: Bundle includes recoverable state
The archive MUST include the existing data tables and object keys under `pages/`, `files/`, and `sites/`. Those tables include the owner password hash, API key hashes, and OAuth grant hashes.

#### Scenario: Password hash is in the archive
- **WHEN** backup completes for an install that has an owner
- **THEN** the archive contains the owner table and does not omit it as a secret

### Requirement: Bundle excludes deployment secrets
The archive MUST NOT include `.env`, `PUBLIC_ORIGIN`, object-storage credentials, owner session cookies, or unapproved device codes. On Unix the archive file MUST be mode `0600`. The summary MUST say sessions, device codes, `PUBLIC_ORIGIN`, and storage credentials were not exported.

#### Scenario: Environment file stays out
- **WHEN** backup completes
- **THEN** the archive contains no `.env` and the summary names those excluded items

### Requirement: Restore does not rewrite deployment config
Restore MUST NOT rewrite `.env` or `PUBLIC_ORIGIN`. `--replace` MUST stay explicit and MUST be the only mode that truncates data tables before import. A migration journal mismatch MUST fail before data is written.

#### Scenario: Replace is not the default
- **WHEN** restore runs without `--replace`
- **THEN** it does not truncate the data tables before import

#### Scenario: Mismatched migrations do not write
- **WHEN** the archive journal does not match the database migrations
- **THEN** restore fails before changing tables or objects

### Requirement: Install summary gives one connect order
After a successful install, the summary MUST show success, the home origin, then `npx skills add <origin> -a <agent> -s oneself -y` using the configured `PUBLIC_ORIGIN`, then that the agent requests a device code and the owner approves it at `/admin/device`. It MUST still show the admin URL. It MUST NOT present creating an API key as the first step.

#### Scenario: Summary leads with device approval
- **WHEN** install succeeds with origin `http://192.168.1.10:3000`
- **THEN** the agent section contains `npx skills add http://192.168.1.10:3000 -a <agent> -s oneself -y` and names `/admin/device` before any API key instruction
