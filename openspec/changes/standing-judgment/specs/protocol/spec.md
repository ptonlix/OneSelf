# Spec Delta

## MODIFIED Requirements

### Requirement: Discovery document
`GET /.well-known/pcp` MUST return protocol `pcp`, version `1`, the operation list excluding the three key-management operations, and absolute URLs for OpenAPI, MCP, OAuth metadata, and the `oneself` skill. Those absolute URLs MUST use the configured public origin. A request `Host` or forwarded host that differs from that origin MUST NOT change them. `context-management` and `public-page` are not product skill names. The document MUST also return `self.soul` and `self.recent`, each with `source` `self` and slug `soul` or `recent`. Those two values MUST NOT be absolute URLs and MUST NOT change with `Host`.

#### Scenario: Host header does not rewrite discovery
- **WHEN** discovery is requested with a `Host` other than the configured public origin
- **THEN** every absolute URL still uses the configured public origin

#### Scenario: Anonymous discovery names the standing pages
- **WHEN** a client fetches `/.well-known/pcp` with no credential
- **THEN** `self.soul` is `{source: self, slug: soul}`, `self.recent` is `{source: self, slug: recent}`, and `version` remains `1`

### Requirement: Skill bytes
The product skill name is `oneself`. `GET /skills/oneself/SKILL.md` MUST return the same bytes as `GET /pcp/v1/skills/oneself`. `context-management` and `public-page` are not product skill names and MUST NOT be served. The context reference MUST document frontmatter, visibility, the two fences, the `files` array, and `[[source/slug]]`. The public-page reference MUST state which public fields the built-in page can show, how to customize from the public-page source zip, add a real path, build, and avoid reserved paths. It MUST tell the agent to give the activation approval URL to the owner and MUST say not to claim the site has changed before approval. The next customization MUST start from that source zip rather than an uploaded dist. `GET /skills/oneself/references/self.md` MUST return the standing-judgment reference. Skill text MUST forbid putting secrets or private pages into source or build output, MUST require `credentials: omit` on public requests, and MUST NOT name the server framework.

#### Scenario: Anonymous skill matches the API
- **WHEN** a client fetches `/skills/oneself/SKILL.md` and the PCP skill resource
- **THEN** the bodies are byte-for-byte equal

#### Scenario: Self reference is served
- **WHEN** a client fetches `/skills/oneself/references/self.md`
- **THEN** the body is the standing-judgment reference and is not a second skill entry
