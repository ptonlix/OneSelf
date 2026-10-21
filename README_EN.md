<div align="center">

<img src="docs/images/hero.png" alt="OneSelf: One self. One context. Every AI." width="100%" />

<h1>OneSelf</h1>

<p><strong>One self. One context. Every AI.</strong></p>

<p>An open-source, self-hosted personal context store: Markdown is the source of truth, and one set of PCP operations serves your scripts, other people's agents, and your public homepage.</p>

<p>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white" alt="Node.js 24" />
  <img src="https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white" alt="Hono 4" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 18" />
  <img src="https://img.shields.io/badge/MCP-Streamable_HTTP-6E56CF" alt="MCP Streamable HTTP" />
</p>

<p>
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-agent-entry-points">Agent entry points</a> ·
  <a href="#-documentation">Docs</a> ·
  <a href="README.md">中文</a>
</p>

</div>

---

## 💡 What is OneSelf

Personal data is scattered across résumés, notes, scanned documents, and chats with different agents. Every new agent needs the same background pasted in again, and nothing says what may be public and what is only for that one agent.

OneSelf is a **self-hosted, single-owner personal data store** that keeps three concerns apart:

- **Storage**: every page is a Markdown file stored in object storage under its content hash. PostgreSQL holds only a predefined index; no kind of data gets its own business table.
- **Agent access**: every data and site operation lives in PCP (Personal Context Protocol). HTTP (OpenAPI) and MCP share one operation table. Your own agents use API keys; other people's agents use the OAuth 2.1 device flow. Permissions are granted per source (folder) at three levels: read, write, change visibility.
- **Publishing**: the public site is a static landing page whose browser script reads the public PCP anonymously at runtime. The built-in original page already shows your public data; a customized version is uploaded by an agent and goes live only after you approve it.

> In short: your data lives in one place, and you approve who reads it, what they see, and when your homepage changes.

## ✨ Features

**OneSelf is built for agents: reading and writing data, filing originals, and redesigning the homepage all happen through PCP. People only approve: which agent gets which permissions, and which homepage version goes live.**

- **Agents onboard themselves**: reading `/.well-known/pcp` gives an agent the operation list, OpenAPI, MCP, OAuth endpoints, and the two skills ([data](skills/data.md), [original page](skills/original-page.md)), so nobody has to paste background in again.
- **One operation table for HTTP and MCP**: the 40 data and site operations registered in [`packages/operations`](packages/operations/src/registry.ts) generate the `/pcp/v1` routes, `/openapi.json`, and `POST /mcp` (official MCP SDK, in-process Streamable HTTP). API key management is HTTP-only and never exposed to MCP.
- **Humans approve, secrets stay put**: other people's agents use the OAuth 2.1 device flow (`oidc-provider`); you pick sources and permissions at `/admin/device`. Access tokens last 15 minutes; refresh tokens rotate on use and are stored only as hashes. API keys start with `osk_` and are shown once on the approval page. Agents cannot create keys or approve a site launch.
- **Markdown is the source, new data needs no migration**: résumés, experience, notes, and document summaries are all pages with frontmatter, and new `type`s need no migration. `## Facts`, `## Timeline`, tags, and `[[source/slug]]` links are written back into the Markdown and indexed for `search`, `query`, and `recall`.
- **Private by default**: `visibility` defaults to `private`. Without read access, private, deleted, and missing pages all return the same `not_found`. Making a page public needs the separate "change visibility" permission.
- **Originals stay under your control**: images and PDFs (up to 20 MiB each) go to object storage and are attached through the page's `files` frontmatter; `/media/{id}` is anonymously readable only when the owning page is public.
- **Agents redesign, you publish**: an agent downloads the original-page source zip, uploads its build as an immutable release, previews it at `/_preview/{id}/`, and requests activation. The site pointer moves only after you open the approval link and accept. Rolling back uses the same flow.
- **History and recovery**: each page keeps its 50 most recent versions for revert; soft-deleted pages and sources can be restored within 30 days.
- **One process, self-hosted**: API, MCP, OAuth, admin UI, and the public site run in one Node.js process. Docker Compose adds PostgreSQL 18 and RustFS, with one public ingress chosen from cloudflared, Caddy, or Tailscale.

## 🚀 Quick start

### 🐳 Option 1: Self-host with Docker Compose

Requirements: Docker and Docker Compose v2. The default ingress is a Cloudflare Tunnel and needs a tunnel token; you can switch to Caddy (your own domain) or Tailscale (tailnet-only access), see [Deployment](#-deployment).

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `PUBLIC_ORIGIN`: the single public origin, e.g. `https://your-domain`
- `OWNER_PASSWORD`: the owner's initial password (must be changed on first login)
- `POSTGRES_PASSWORD`, `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`
- the variables your ingress needs (`TUNNEL_TOKEN` by default)

Build the image locally and start:

```bash
docker compose up -d --build
```

> [!IMPORTANT]
> The app does **not** run database migrations on startup. Migrations live in [`packages/db/migrations`](packages/db/migrations), and `pnpm db:migrate` applies them with drizzle-kit using `DATABASE_URL` from `.env`. Production Compose does not publish the PostgreSQL port to the host, so plan a migration run before first start.

Then open `PUBLIC_ORIGIN` for the public homepage, sign in and change your password at `PUBLIC_ORIGIN/admin`, and give `PUBLIC_ORIGIN/.well-known/pcp` to your agent.

### 💻 Option 2: Local development

Requirements:

- Node.js `>=24`
- pnpm 12.9.1 (via Corepack)
- Docker and Docker Compose v2

```bash
corepack enable
corepack prepare pnpm@12.9.1 --activate
pnpm install --frozen-lockfile
docker compose -f compose.dev.yaml up -d
```

`compose.dev.yaml` starts only PostgreSQL and RustFS, bound to `127.0.0.1`. Create a local `.env` at the repository root (these credentials are for your machine only, never production; leave `PUBLIC_ORIGIN` unset locally so the app uses `http://127.0.0.1:3000`):

```bash
DATABASE_URL=postgres://oneself:oneself@127.0.0.1:5432/oneself
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_BUCKET=oneself
OBJECT_STORAGE_ACCESS_KEY=oneself
OBJECT_STORAGE_SECRET_KEY=oneselfsecret
OWNER_LOGIN=owner
OWNER_PASSWORD=<choose an initial password>
```

Run migrations, build the two front-end packages, then start the app:

```bash
pnpm db:migrate
pnpm --filter @oneself/admin build
pnpm --filter @oneself/original-pages build
node --env-file=.env --experimental-strip-types apps/server/src/index.ts
```

Open <http://127.0.0.1:3000> for the original page and <http://127.0.0.1:3000/admin> to sign in.

> [!TIP]
> On direct start the app checks `DATABASE_URL`, `OBJECT_STORAGE_*`, `apps/admin/dist`, and `packages/original-pages/dist`, and refuses to start if any is missing. It also refuses to start when there is no owner yet and `OWNER_PASSWORD` is not set.

## 🔧 Configuration

See [`.env.example`](.env.example) for every variable with comments. `.env` is git-ignored; never commit real secrets.

| Variable                                                          | Description                                                                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_ORIGIN`                                                   | The single public origin, used for discovery, OAuth issuer, approval links, and media URLs; adds `Secure` to the cookie when HTTPS                   |
| `OWNER_LOGIN` / `OWNER_PASSWORD`                                  | Creates the single owner on first start (Argon2id hash only) and forces a password change                                                            |
| `OWNER_RESET_PASSWORD`                                            | Set temporarily if you forget the password; on restart it replaces the hash and forces a change again. Remove it afterwards. There is no email reset |
| `DATABASE_URL`                                                    | PostgreSQL connection string; built from `POSTGRES_PASSWORD` in Compose                                                                              |
| `OBJECT_STORAGE_*`                                                | S3-compatible endpoint, region, bucket, and keys; supplied from `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` in Compose                                 |
| `COMPOSE_PROFILES`                                                | Public ingress: `cloudflared` (default), `caddy`, or `tailscale`; only one at a time                                                                 |
| `TUNNEL_TOKEN` / `APP_DOMAIN`, `ACME_EMAIL` / `TAILSCALE_AUTHKEY` | For cloudflared, Caddy, and Tailscale respectively                                                                                                   |
| `ONESELF_IMAGE`                                                   | App image tag, default `oneself:local`                                                                                                               |
| `HOST` / `PORT`                                                   | Listen address and port, default `127.0.0.1:3000`; `0.0.0.0` inside the container                                                                    |

## 🧱 Architecture

<p align="center">
  <img src="docs/images/architecture.png" alt="OneSelf architecture: browsers open the site served by pointer and read the public PCP anonymously; your own agents use API keys and other agents use device-flow tokens to call the same PCP operation table; one Node.js process stores Markdown, originals, and site bundles in RustFS and the index, grants, and site pointer in PostgreSQL" width="100%" />
</p>

- **One process**: PCP, MCP, OAuth, the admin static files, and the published site are all served by one Hono app. No microservices, no Redis, no queue.
- **Rules stay out of routes**: HTTP and MCP only authenticate, parse, and respond. Shared use cases live in `apps/server/src/app`, business rules in pure-TypeScript `packages/domain`; object storage, clock, and Markdown parsing come in through `ports` / `adapters`, and dependency-cruiser enforces the direction.
- **Source vs. projection**: Markdown, originals, and site files live in object storage; page bodies, tags, links, facts, and timelines in PostgreSQL are projections. A write stores the hashed object first, then updates projections and appends a version in one transaction.
- **The site never queries pages**: the handler that serves site files only follows the site pointer; data on the page comes from separate browser requests to the public PCP.

| Role               | Can                                                                                                                         | Cannot                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Owner              | Sign in to the admin UI, approve device codes, create and revoke API keys, approve site launches, delete or restore sources | Reset the password by email             |
| Own agent / script | Read and write allowed sources with an approved API key; request a site launch with `site:write`                            | Create or manage keys, approve a launch |
| Third-party agent  | Get a short-lived token via the device flow and call the same operations within the granted sources                         | Manage keys, approve a launch           |
| Visitor            | Open the live public site and read public data and public originals                                                         | Read any `private` page                 |

For the Mermaid system overview, code boundaries, tables, and key flows, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#系统总览图) (Chinese, with an English diagram).

## 🤖 Agent entry points

| Path                                 | Who                    | Purpose                                                                         |
| ------------------------------------ | ---------------------- | ------------------------------------------------------------------------------- |
| `/.well-known/pcp`                   | Agents                 | Discovery: protocol version, operation list, OpenAPI, MCP, OAuth, skills        |
| `/skills/data.md`                    | Agents                 | How to write data: frontmatter, visibility, the two fences, files, links        |
| `/skills/original-page.md`           | Site agents            | What the original page shows; how to customize, upload, preview, request launch |
| `/openapi.json`                      | Agents, scripts        | OpenAPI generated from the operation registry                                   |
| `POST /mcp`                          | MCP clients            | Streamable HTTP; same auth headers as PCP                                       |
| `/pcp/v1/*`                          | Authenticated callers  | Pages, originals, search, structure, sources, identity, and site operations     |
| `/pcp/v1/public/*`                   | Anyone                 | Only `visibility: public`, non-deleted pages                                    |
| `/media/{id}`                        | Depends on owning page | Original bytes; anonymous when the owning page is public                        |
| `/oauth/device/auth`, `/oauth/token` | Third-party agents     | Request a device code; obtain and refresh access tokens                         |
| `/admin`                             | Owner                  | Sign in, change password, approve device codes, API keys, and site launches     |
| `/_preview/{releaseId}/`             | Anyone                 | Preview an unreleased build without moving the live pointer                     |

Authentication: API keys use `Authorization: ApiKey <key>` or `X-Api-Key`; OAuth access tokens use `Authorization: Bearer <token>`. Errors are always `{ "error", "message" }`. Paths are defined in [`packages/operations/src/registry.ts`](packages/operations/src/registry.ts).

<details>
<summary><strong>PCP operations</strong></summary>

| Group                | Operations                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages                | `put_page`, `edit_page`, `put_pages`, `get_page`, `list_pages`, `delete_page`, `restore_page`, `get_versions`, `revert_version`, `resolve_slugs`         |
| Originals            | `file_upload`, `file_list`, `file_url`                                                                                                                   |
| Search               | `search`, `query`, `recall`                                                                                                                              |
| Structure write-back | `add_tag`, `remove_tag`, `get_tags`, `add_link`, `remove_link`, `get_links`, `get_backlinks`, `add_timeline_entry`, `get_timeline`, `remember`, `forget` |
| Sources and identity | `sources_list`, `sources_add`, `sources_delete`, `sources_restore`, `sources_status`, `whoami`, `list_skills`, `get_skill`                               |
| Site                 | `list_sites`, `get_site`, `put_site`, `preview_site`, `activate_site`                                                                                    |
| HTTP only            | `create_api_key`, `list_api_keys`, `revoke_api_key`                                                                                                      |

</details>

## 📝 Writing data

A page is identified by `(source, slug)`. `type` and `title` go in frontmatter; any other keys are free-form. Statements that need a validity date or confidence go under `## Facts`, and dated events under `## Timeline`:

```markdown
---
type: profile
title: Engineer
name: Jane Doe
visibility: public
tags: [public-profile]
files: []
---

# Jane Doe

Builds personal tools and developer products.

## Facts

- id: fact_01
  entity: Jane Doe
  statement: Lives in Shanghai
  confidence: 0.9
  valid_until: 2027-01-01

## Timeline

- 2024-06-01 | Joined a company | Backend work
```

Only these two fences are recognized, and a parse failure rolls back the whole write. Full rules: [skills/data.md](skills/data.md).

## 📁 Project structure

```text
OneSelf/
├── apps/
│   ├── server/            # The single Node process: pcp/, mcp/, oauth/, owner/, site-files/; use cases in app/
│   └── admin/             # Admin UI (Vite + React), talks HTTP only
├── packages/
│   ├── domain/            # Pure business rules: pages, originals, search, access, site pointer
│   ├── operations/        # Operation registry: names, paths, http-only. Zero dependencies
│   ├── ports/             # Interfaces for object storage, clock, Markdown parsing
│   ├── adapters/          # S3 and PostgreSQL implementations plus in-memory test fakes
│   ├── db/                # Drizzle schema and SQL migrations
│   ├── public-client/     # Anonymous public PCP client, also used by custom sites
│   └── original-pages/    # Source of the built-in landing page
├── skills/                # Product skills: data.md, original-page.md
├── tests/                 # API smoke tests and skill acceptance tests
├── deploy/Caddyfile       # Caddy ingress, reverse proxy only
├── docs/                  # PRD and architecture
├── openspec/              # Behavior specs and change records
├── compose.yaml           # Production: app + PostgreSQL + RustFS + one ingress profile
├── compose.dev.yaml       # Local dependencies: PostgreSQL + RustFS
└── Dockerfile             # App image: admin UI, original page, its source zip, and skills/
```

## 🧪 Development

```bash
pnpm check            # Prettier, ESLint, tsc, Vitest, dependency-cruiser, Knip, in order
pnpm test             # Unit and in-process API tests (no Compose needed)
pnpm test:smoke       # Closed-loop smoke test against real PostgreSQL and RustFS from compose.dev.yaml
pnpm boundaries       # Package dependency direction only
pnpm db:migrate       # Apply migrations to DATABASE_URL from .env
```

`pnpm check` is the local gate before merging. Install dependencies with pnpm only. Behavior follows [docs/PRD.md](docs/PRD.md); paths, transactions, and deployment follow [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🚢 Deployment

<details>
<summary><strong>Docker Compose and public ingress in detail</strong></summary>

`compose.yaml` runs the app, PostgreSQL 18, and single-disk RustFS (`rustfs/rustfs:1.0.1`), and creates the bucket with aws-cli on first start. None of the app, database, or object storage publishes a host port; data lives in named volumes. The app image is built from the root `Dockerfile`, bundles the admin UI, the original page, its source zip, and `skills/`, and listens on `3000`. In production set `ONESELF_IMAGE` to a pinned version tag, not `latest`.

The public ingress is a mutually exclusive Compose profile selected by `COMPOSE_PROFILES` in `.env`; switching ingress does not change the app image:

| Profile                 | Who can reach it                 | Needs                                                  |
| ----------------------- | -------------------------------- | ------------------------------------------------------ |
| `cloudflared` (default) | Internet, hostname on Cloudflare | `TUNNEL_TOKEN`. No router ports opened                 |
| `caddy`                 | Internet, your own domain        | `APP_DOMAIN`, `ACME_EMAIL`; ports 80 and 443 reachable |
| `tailscale`             | Devices on the same tailnet only | `TAILSCALE_AUTHKEY`. Serve only, no Funnel             |

Every ingress only forwards HTTPS to the app and never stores site files. `PUBLIC_ORIGIN` must match the chosen ingress's public address. Without a tunnel token or auth key the ingress container may fail while the app and database keep running.

Behind Cloudflare, do not cache `/pcp`, `/oauth`, `/admin`, `/skills`, `/media`, or `/_preview`. The app has simple built-in rate limits per IP per minute: 10 for login and device codes, 30 for public search and uploads; the client address is taken only from the ingress's own header.

</details>

## 📚 Documentation

- [Product requirements (PRD, Chinese)](docs/PRD.md): goals, non-goals, data model, PCP, acceptance criteria
- [Architecture (Chinese)](docs/ARCHITECTURE.md): stack, code boundaries, data, paths, and key flows
- [Skill: writing data](skills/data.md)
- [Skill: original page](skills/original-page.md)
- [OpenSpec change: oneself-mvp](openspec/changes/oneself-mvp/proposal.md)
- On a running instance: `/.well-known/pcp`, `/openapi.json`, `/skills/data.md`, `/skills/original-page.md`

## 🤝 Contributing

Issues and pull requests are welcome.

1. Branch from the current `main`.
2. Keep changes within the scope of [docs/PRD.md](docs/PRD.md); if operation names, permissions, or error codes change, update the docs and [`packages/operations`](packages/operations/src/registry.ts) before the code.
3. Run `pnpm check` before committing.
4. Open a pull request describing the behavior change and how you verified it.
