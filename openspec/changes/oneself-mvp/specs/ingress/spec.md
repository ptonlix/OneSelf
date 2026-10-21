# Spec Delta

## Purpose

把浏览器和 Agent 的 HTTPS 入口放在应用进程外面，并保证发现文档、Cookie 和限流都使用同一个对外源。

## ADDED Requirements

### Requirement: One ingress at a time
Production compose MUST run the application, PostgreSQL, and RustFS, plus exactly one ingress profile. `COMPOSE_PROFILES` MUST default to `cloudflared`. `caddy` and `tailscale` MUST be mutually exclusive alternatives. Production MUST NOT publish the application, database, or RustFS on a host interface. `compose.dev.yaml` MUST publish PostgreSQL and RustFS port 9000 on loopback only, so the host process can reach them, and MUST NOT publish the RustFS console on 9001. The application in development MUST run on the host with pnpm. Ingress containers MUST reverse-proxy to the application and MUST NOT store site files.

#### Scenario: Selecting Caddy does not also start the tunnel
- **WHEN** production compose is started with `COMPOSE_PROFILES=caddy`
- **THEN** the Caddy service is the only ingress, cloudflared is not running, and RustFS has no host port

#### Scenario: Development publishes only the local object port
- **WHEN** `compose.dev.yaml` is started
- **THEN** RustFS accepts connections on loopback port 9000, port 9001 is not published, and the application process is not inside that compose file

### Requirement: Configured public origin
The process MUST take `PUBLIC_ORIGIN` as the only external origin. Discovery, the OAuth issuer, approval URLs, and absolute media URLs MUST use it. When it is HTTPS, the owner cookie MUST be `Secure`. Without `PUBLIC_ORIGIN`, the process MUST accept only the local development origin and MUST NOT start as a public ingress. The Tailscale profile MUST publish Serve on the tailnet name only and MUST NOT enable Funnel.

#### Scenario: Approval URL uses the configured origin
- **WHEN** the owner creates an API key behind the configured origin
- **THEN** the approval URL begins with that origin

### Requirement: Client address from one hop
Rate limits MUST be 30 public searches, 30 uploads, and 10 logins per client address per minute, counted in the application process. The client address MUST come only from the single ingress hop: `CF-Connecting-IP` for cloudflared, and the forwarding header written by Caddy or Tailscale for those profiles. Forwarding headers from any other peer MUST be ignored.

#### Scenario: Spoofed forwarding header is ignored
- **WHEN** a client that is not the ingress sends `X-Forwarded-For` naming a fresh address
- **THEN** the rate limit bucket is not that spoofed address

### Requirement: Cache and timeout boundaries
Responses for public PCP, `/media`, skills, and site `index.html` MUST send `Cache-Control: no-store`. Hashed CSS and JavaScript MAY be cached as immutable. When Cloudflare or another cache sits in front, it MUST NOT cache `/pcp`, `/oauth`, `/admin`, `/skills`, `/media`, or `/_preview`. The deployment notes MUST state that a response which does not finish within the Cloudflare proxy read timeout can be closed, while ordinary page, login, device, and MCP calls are expected to finish inside it.

#### Scenario: Public page API is not cached
- **WHEN** an anonymous client reads a public page
- **THEN** the response includes `Cache-Control: no-store`

#### Scenario: Admin is not a cached Cloudflare path
- **WHEN** the cloudflared profile is generated
- **THEN** its cache rules exclude `/admin`, `/oauth`, and `/_preview`
