# Spec Delta

## Purpose

把 Agent 需要的接口细节放进服务端自己生成的机器可读文档：发现文档写认证请求头、匿名公开接口和上传限制，OpenAPI 写每个操作的参数和安全要求，且都和实际行为同源。Skill 因此只讲流程。协议版本仍是 `1`，只增加字段。

## ADDED Requirements

### Requirement: Discovery describes credentials, public endpoints, and uploads
`GET /.well-known/pcp` MUST also return `auth.headers` (each credential and the exact header format the server accepts), `public` (`credentials: "omit"` and every anonymous endpoint, including `/media/{id}`, with name, method, and path), and `uploads` for `file_upload` and `put_site` (multipart field, matching MCP arguments, media types, byte limit, and the site file count). These MUST be additive, keep version `1`, and use the same values the server enforces.

#### Scenario: Agent learns headers and limits from discovery
- **WHEN** an agent reads `/.well-known/pcp` with no credential
- **THEN** it finds the API key and bearer header formats, the five anonymous endpoints, and the upload field names and limits, and each listed public endpoint is routed

#### Scenario: Limits match enforcement
- **WHEN** a file larger than `uploads.file_upload.max_bytes` or of a type outside `media_types` is uploaded
- **THEN** the server rejects it, because the route and discovery read the same domain constants

### Requirement: OpenAPI parameters and security follow the MCP schemas
`/openapi.json` MUST describe each operation's path, query, or JSON body parameters generated from the same input schemas as the MCP tools; upload operations MUST use a multipart body with the field from `uploads`. Every operation MUST declare `security`: credential schemes for agent operations, owner session only for HTTP-only key operations, and none for the anonymous public endpoints, which MUST also be listed. A contract test MUST fail when OpenAPI and MCP parameters differ.

#### Scenario: Parameter drift fails the check
- **WHEN** an operation input schema gains a field that OpenAPI does not show
- **THEN** the contract test comparing `tools/list` input schemas with `/openapi.json` fails

#### Scenario: Public endpoints need no credential
- **WHEN** `/openapi.json` is read
- **THEN** each public endpoint has `security: []` and states `credentials: omit`

### Requirement: OpenAPI security, uploads, and errors match the runtime
`/openapi.json` security schemes MUST be derived from `auth.headers`: the raw-key header is an `apiKey` scheme on `X-Api-Key`, the bearer header an `http` `bearer` scheme, and `Authorization: ApiKey <key>` is only described. Upload fields MUST be `format: binary` with `contentMediaType` values equal to `uploads.*.media_types`. Each status MUST have one response whose `error` enum lists every code with that status.

#### Scenario: Headers built from each scheme authenticate
- **WHEN** a client builds request headers exactly as each declared security scheme and each discovery header describes
- **THEN** the server accepts every one of them

#### Scenario: Shared status lists both codes
- **WHEN** an operation's `403` response is read
- **THEN** it names both `forbidden` and `password_change_required`
