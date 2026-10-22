# Spec Delta

## Purpose

让 HTTP 和 MCP 对同一份资料操作给出同一结果，并让发现文档指向配置好的对外源。

## ADDED Requirements

### Requirement: One operation registry
Every data and site operation MUST appear on both OpenAPI and MCP with the same name, parameters, errors, and permission result. `create_api_key`, `list_api_keys`, and `revoke_api_key` MUST be HTTP only and MUST NOT appear in the MCP tool list. Adding only one adapter for a data or site operation MUST fail the contract test.

#### Scenario: MCP has no key tools
- **WHEN** a client lists MCP tools
- **THEN** the three key-management operations are absent

#### Scenario: Same write on both transports
- **WHEN** the same `put_page` body is sent through HTTP and through MCP with the same credential
- **THEN** both succeed or both fail with the same error code and the stored hash matches

### Requirement: Discovery document
`GET /.well-known/pcp` MUST return protocol `pcp`, version `1`, the operation list excluding the three key-management operations, and absolute URLs for OpenAPI, MCP, OAuth metadata, and the `oneself` skill. Those absolute URLs MUST use the configured public origin. A request `Host` or forwarded host that differs from that origin MUST NOT change them. `context-management` and `public-page` are not product skill names.

#### Scenario: Host header does not rewrite discovery
- **WHEN** discovery is requested with a `Host` other than the configured public origin
- **THEN** every absolute URL still uses the configured public origin

### Requirement: Skill bytes
The product skill name is `oneself`. `GET /skills/oneself/SKILL.md` MUST return the same bytes as `GET /pcp/v1/skills/oneself`. `context-management` and `public-page` are not product skill names and MUST NOT be served. The context reference MUST document frontmatter, visibility, the two fences, the `files` array, and `[[source/slug]]`. The public-page reference MUST state which public fields the built-in page can show, how to customize from the original source zip, add a real path, build, and avoid reserved paths. It MUST tell the agent to give the activation approval URL to the owner and MUST say not to claim the site has changed before approval. The next customization MUST start from that source zip rather than an uploaded dist. Skill text MUST forbid putting secrets or private pages into source or build output, MUST require `credentials: omit` on public requests, and MUST NOT name the server framework.

#### Scenario: Anonymous skill matches the API
- **WHEN** a client fetches `/skills/oneself/SKILL.md` and the PCP skill resource
- **THEN** the bodies are byte-for-byte equal

### Requirement: MCP transport
MCP MUST be served by the same process at `POST /mcp` using Streamable HTTP. The old SSE transport MUST NOT be enabled. MCP authentication headers MUST be the same ones accepted by PCP. The server MUST NOT open a second MCP process.

#### Scenario: Unauthenticated MCP write matches HTTP
- **WHEN** an MCP write is sent without a credential
- **THEN** the error code is `unauthorized`, the same as the HTTP route

### Requirement: Path table
HTTP paths MUST be exactly the architecture table. In particular, pages use `PUT` and `PATCH /pcp/v1/pages/{source}/{slug}`, `POST /pcp/v1/pages`, `GET /pcp/v1/pages`, `DELETE` and `POST .../restore`, `GET .../versions`, `POST .../revert`, and `POST /pcp/v1/slugs/resolve`. Files use `POST` and `GET /pcp/v1/files` and `GET /pcp/v1/files/{id}`, while bytes are only `GET /media/{id}`. Search and query are `POST /pcp/v1/search` and `POST /pcp/v1/query`. Structure routes are the tag, link, timeline, fact, and recall paths in that table. Sources use `GET` and `POST /pcp/v1/sources`, `GET` and `DELETE /pcp/v1/sources/{id}`, and `POST /pcp/v1/sources/{id}/restore`. Whoami and skills use `/pcp/v1/whoami` and `/pcp/v1/skills`. Site routes are `GET /pcp/v1/site`, `GET /pcp/v1/site/source`, `POST /pcp/v1/site/releases`, `POST /pcp/v1/site/releases/{id}/preview`, and `POST /pcp/v1/site/activate`. Key routes are `/pcp/v1/api-keys`. Owner routes are `POST /admin/login`, `POST /admin/password`, `POST /admin/logout`, `POST /admin/api-keys/{id}/approve`, and `POST /admin/site-activations/{id}/approve`. There MUST NOT be `/pcp/v1/public/files/{id}` or a public `query`.

#### Scenario: Documented write path is the only write path
- **WHEN** a client calls `PUT /pcp/v1/pages/{source}/{slug}` and also calls a different path for the same body
- **THEN** only the documented path is routed to `put_page`
