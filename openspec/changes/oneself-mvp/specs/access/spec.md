# Spec Delta

## Purpose

用一个所属人账号、批准后才生效的 API Key，以及 OAuth 设备码，决定谁可以读写哪些目录。

## ADDED Requirements

### Requirement: Single owner bootstrap
On first start with no owner, the system MUST create one owner from `OWNER_LOGIN` and `OWNER_PASSWORD`, store only an Argon2id hash, and require a password change. Later starts MUST NOT use those variables to log in or reset an existing owner. `OWNER_RESET_PASSWORD`, when set, MUST replace the hash, require a password change again, and log without the password. The process MUST refuse to start when no owner exists and no initial password is configured. Startup MUST NOT create an API key.

#### Scenario: Missing initial password refuses startup
- **WHEN** the database has no owner and the initial password variables are unset
- **THEN** the process exits without serving requests

### Requirement: Password change gate
Before the required password change, the only successful owner operations MUST be logout and password change. Every other admin or PCP call MUST return `password_change_required`.

#### Scenario: Unchanged password cannot write
- **WHEN** a newly bootstrapped owner calls `put_page` before changing the password
- **THEN** the response is `password_change_required` and no page is written

### Requirement: One authorization check
After authentication, every operation MUST pass through one authorization decision for the credential, operation, and source. The owner session MUST be allowed every operation, including key management and site approval, and MUST be the only credential with `admin: true`. An API key or OAuth grant MUST carry the approved per-source read, write, and visibility flags plus optional `site:write`. Neither MUST be able to manage keys or approve activation. Read permission on a source MUST include every non-deleted private page in it, and the approval page MUST say so before the owner confirms. There MUST NOT be a separate public-only grant. An API key with unrestricted data access MUST include sources created after the key was approved. An API key and an OAuth grant with the same source flags and the same `site:write` flag MUST get the same result for the same operation. Revoking one key or one grant MUST NOT disable any other credential.

#### Scenario: OAuth cannot approve the site
- **WHEN** an OAuth token with `site:write` calls the site approval route
- **THEN** the response is `forbidden` and the pointer is unchanged

#### Scenario: Hidden source looks missing
- **WHEN** a credential without read permission reads a page in that source, and the same request is repeated for a missing slug and for a soft-deleted slug
- **THEN** all three responses are `not_found` and none contains the body

#### Scenario: Revoking one key leaves another working
- **WHEN** the owner revokes one API key while a second key and an OAuth grant remain
- **THEN** the revoked key fails on its next call and the other two still succeed within their grants

#### Scenario: Same grants match across credential types
- **WHEN** an API key and an OAuth grant have the same source flags and both read the same private page
- **THEN** both receive the same page

### Requirement: API key approval
`whoami` MUST return `{credential, admin, site_write, sources:[{id, read, write, visibility}]}`. `create_api_key` MUST accept a label, either unrestricted data access or an explicit source list, and optional `site:write`. The response MUST be a pending id and approval URL valid for 15 minutes, with no key. The raw key MUST be generated only when the owner opens the approval page and confirms, MUST be shown only in that response, MUST start with `osk_`, and MUST be stored only as a SHA-256 hash. Expiry, a second confirmation, or a missing owner session MUST NOT create a key. Callers MUST be able to send `Authorization: ApiKey <key>` or `X-Api-Key`. Revocation MUST take effect on the next request. An existing key MUST NOT have its permissions changed or its raw value shown again.

#### Scenario: Create does not return a usable key
- **WHEN** the owner calls `create_api_key`
- **THEN** the response has no key material and a request using that response cannot authenticate

#### Scenario: Confirm shows the key once
- **WHEN** the owner confirms a pending key request
- **THEN** the confirmation response contains the raw `osk_` key and a later list shows only metadata

### Requirement: Device-code OAuth
Production discovery MUST advertise only the device code flow. Authorization code with PKCE MUST be enabled only in test configuration and MUST NOT appear in discovery. Password and implicit grants MUST NOT be accepted. Access tokens MUST last 15 minutes. Refresh tokens MUST be stored only as hashes, rotated on use, and the previous token MUST fail immediately. Reuse of a rotated refresh token MUST revoke the whole grant. The verification page MUST be `/admin/device` and MUST require an owner session. A device flow MUST NOT mint an API key.

#### Scenario: Reused refresh token kills the grant
- **WHEN** a client uses a refresh token that was already rotated
- **THEN** that grant can no longer refresh or call protected operations

### Requirement: Owner session cookie
The owner cookie MUST be named `oneself_session`, with `Path=/`, `HttpOnly`, and `SameSite=Lax`. It MUST include `Secure` when the public origin is HTTPS. Admin write requests MUST reject an `Origin` that is not the public origin.

#### Scenario: Cross-origin admin write is rejected
- **WHEN** an owner session sends an admin write whose `Origin` is a different site
- **THEN** the write is rejected and no state changes

### Requirement: Error distinction
A call without a credential to a write, non-public query, activation request, or admin route MUST return `unauthorized`. A valid credential that is not allowed the operation MUST return `forbidden`. An unreadable resource MUST return `not_found`. Hash conflicts MUST return `conflict`. Illegal bodies, fences, slugs, or zips MUST return `invalid`. Oversized uploads MUST return `payload_too_large`. The error body MUST be `{error, message}` using only those codes plus `password_change_required`. The HTTP status MUST be 401 for `unauthorized`, 403 for `forbidden` and `password_change_required`, 404 for `not_found`, 409 for `conflict`, 400 for `invalid`, and 413 for `payload_too_large`. The owner cookie MUST authenticate calls to `/pcp/v1`. The process MUST NOT enable CORS.

#### Scenario: Missing credential on a write
- **WHEN** a caller without a credential calls `put_page`
- **THEN** the HTTP status is 401, `error` is `unauthorized`, and the body contains only `error` and `message`
