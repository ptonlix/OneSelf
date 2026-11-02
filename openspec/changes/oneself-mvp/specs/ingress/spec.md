# Spec Delta

## Purpose

把浏览器和 Agent 的入口（默认本机/局域网 HTTP，公网 HTTPS）放在应用进程外面，并保证发现文档、Cookie 和限流都使用同一个对外源。

## ADDED Requirements

### Requirement: One ingress at a time
Production compose MUST run the application, PostgreSQL, and RustFS, plus exactly one ingress profile. `COMPOSE_PROFILES` MUST default to `local`. `local`, `cloudflared`, `caddy`, and `tailscale` MUST be mutually exclusive. The `local` ingress MUST be a plain-HTTP reverse proxy that publishes only `HOST_PORT` (default 3000) on the host, for this host and its LAN; the public ingresses (`cloudflared`, `caddy`, `tailscale`) MUST serve HTTPS only. Production MUST NOT publish the application, database, or RustFS on a host interface; only the selected `local` proxy MAY publish a host port. `compose.dev.yaml` MUST publish PostgreSQL and RustFS port 9000 on loopback only, so the host process can reach them, and MUST NOT publish the RustFS console on 9001. The application in development MUST run on the host with pnpm. Ingress containers MUST reverse-proxy to the application and MUST NOT store site files.

#### Scenario: Selecting Caddy does not also start the tunnel
- **WHEN** production compose is started with `COMPOSE_PROFILES=caddy`
- **THEN** the Caddy service is the only ingress, cloudflared and the local proxy are not running, and RustFS has no host port

#### Scenario: Local ingress publishes only the proxy port
- **WHEN** production compose is started with `COMPOSE_PROFILES=local`
- **THEN** only the local proxy publishes `HOST_PORT`, and the application, PostgreSQL, and RustFS have no host port

#### Scenario: Development publishes only the local object port
- **WHEN** `compose.dev.yaml` is started
- **THEN** RustFS accepts connections on loopback port 9000, port 9001 is not published, and the application process is not inside that compose file

### Requirement: Configured public origin
The process MUST take `PUBLIC_ORIGIN` as the only external origin. Discovery, the OAuth issuer, approval URLs, and absolute media URLs MUST use it. When it is HTTPS, the owner cookie MUST be `Secure`. Without `PUBLIC_ORIGIN`, the process MUST accept only the local development origin and MUST NOT start as a public ingress. The Tailscale profile MUST publish Serve on the tailnet name only and MUST NOT enable Funnel.

#### Scenario: Approval URL uses the configured origin
- **WHEN** the owner creates an API key behind the configured origin
- **THEN** the approval URL begins with that origin

### Requirement: Client address from one hop
Rate limits MUST be 30 public searches, 30 uploads, and 10 logins per client address per minute, counted in the application process. The client address MUST come only from the single ingress hop: `CF-Connecting-IP` for cloudflared, the forwarding header written by Caddy or Tailscale for those profiles, and `X-Real-IP` for `local`. The `local` proxy MUST overwrite `X-Real-IP` and `X-Forwarded-For` with the peer address it sees. That peer address is whatever Docker hands the proxy: under Docker Desktop or the default userland-proxy it is the bridge gateway, so external clients MAY share one bucket; only Linux with userland-proxy disabled (iptables preserving the source) separates real clients. The documentation MUST NOT claim otherwise. Forwarding headers from any other peer MUST be ignored.

#### Scenario: Spoofed forwarding header is ignored
- **WHEN** a client that is not the ingress sends `X-Forwarded-For` naming a fresh address
- **THEN** the rate limit bucket is not that spoofed address

#### Scenario: Local ingress separates clients
- **WHEN** the ingress is `local` and two requests carry different proxy-written `X-Real-IP` values
- **THEN** they count against different rate limit buckets

### Requirement: Cache and timeout boundaries
Responses for public PCP, `/media`, skills, and site `index.html` MUST send `Cache-Control: no-store`. Hashed CSS and JavaScript MAY be cached as immutable. When Cloudflare or another cache sits in front, it MUST NOT cache `/pcp`, `/oauth`, `/.well-known`, `/admin`, `/skills`, `/media`, or `/_preview`. The deployment notes MUST state that a response which does not finish within the Cloudflare proxy read timeout can be closed, while ordinary page, login, device, and MCP calls are expected to finish inside it.

#### Scenario: Public page API is not cached
- **WHEN** an anonymous client reads a public page
- **THEN** the response includes `Cache-Control: no-store`

#### Scenario: Admin is not a cached Cloudflare path
- **WHEN** the cloudflared profile is generated
- **THEN** its cache rules exclude `/admin`, `/oauth`, and `/_preview`
