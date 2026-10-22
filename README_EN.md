<div align="center">

<img src="docs/images/hero.png" alt="OneSelf: One self. One context. Every AI." width="100%" />

<h1>OneSelf</h1>

<p><strong>One self. One context. Every AI.</strong></p>

<p>Open-source personal context management: build one context about you, let every AI understand you, and keep privacy and efficiency in balance.</p>

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

Every time you connect a new AI, you explain your background all over again, and the more you share, the harder it gets to tell what may be public and what belongs to only one AI.

OneSelf is open-source, self-hosted **personal context management**. Your résumé, experience, notes, photos, and scanned documents come together as one context about you: text becomes pages, and images and PDFs are attached to those pages as originals. Any AI agent reads, writes back to, and maintains it through one set of PCP operations, available over both HTTP and MCP. You approve which agent sees which sources and whether it may edit or publish, and you can take that access back at any time. Your public homepage is just another outlet of the same context: it shows only what you mark public, and a redesign goes live only when you say so.

- **Efficiency**: one context shared by every AI. Agents onboard themselves from the discovery document and skills, and they help you organize and write back, so you never have to introduce yourself again.
- **Privacy**: private by default, granted per source, every grant approved by you and revocable at any time, and the whole service runs on your own machine.

> In short: One self. One context. Every AI. You decide which context goes to which AI, how much of it, and when to take it back.

## ✨ Features

**OneSelf is agent-first personal context management: agents read, organize, and maintain; you set the boundaries: who gets what, how much, and for how long.**

**🗂️ Manage**

- **One context for everything about you**: experience, notes, and document summaries become pages, and photos and PDFs are uploaded as originals and attached to them; new kinds of data need no schema change, and facts, timelines, tags, and links between pages are indexed for keyword, filtered, and fact search.
- **Every change is traceable and reversible**: incremental edits must carry the current version, so nobody silently overwrites changes they haven't seen; each page keeps its last 50 versions, and deleted pages and sources can be restored for 30 days.

**🔐 Privacy**

- **Private by default, public only by your choice**: permissions per source at three levels (read, write, change visibility); without access, a private page looks exactly like a missing one. Your public homepage shows only what you mark public, and agents can redesign it, but a new version goes live only after you approve.
- **You approve every grant, and can revoke any of them**: whether an agent connects with an API key or the OAuth device flow, you confirm it on your approval page, and keys are shown once; revoke any single key or grant and the next request fails. Agents can't issue themselves keys or approve on your behalf.
- **Your context stays on your machine**: one Node.js process with PostgreSQL and RustFS, deployed with Docker Compose; agents only use the API and never touch the database, object storage, or secrets.

**⚡ Efficiency**

- **Agent-first, any AI can onboard itself**: an agent reads `/.well-known/pcp` and the `oneself` skill to learn how to use it; one operation table serves both HTTP (OpenAPI) and MCP, so any AI that speaks either can connect, with identical results.
- **AI keeps it current, no more repeating yourself**: agents can read originals you upload and turn them into pages, remember or forget a fact, add a timeline entry, tags, and links, so the next AI always reads the latest you.

## 🚀 Quick start

### 🐳 Option 1: Self-host with Docker Compose

Requirements: Docker and Docker Compose v2. The default ingress is a Cloudflare Tunnel and needs a tunnel token; you can switch to Caddy (your own domain) or Tailscale (tailnet-only access), see [Deployment](#-deployment).

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `PUBLIC_ORIGIN`: the single public origin, e.g. `https://your-domain`
- `OWNER_PASSWORD`: the initial password for your account (must be changed on first login)
- `POSTGRES_PASSWORD`, `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`
- the variables your ingress needs (`TUNNEL_TOKEN` by default)

Build the image locally and start:

```bash
docker compose up -d --build
```

> [!IMPORTANT]
> The app does **not** run database migrations on startup. Migrations live in [`packages/db/migrations`](packages/db/migrations), and `pnpm db:migrate` applies them with drizzle-kit using `DATABASE_URL` from `.env`. Production Compose does not publish the PostgreSQL port to the host, so plan a migration run before first start.

Then open `PUBLIC_ORIGIN` for the public homepage, sign in and change your password at `PUBLIC_ORIGIN/admin`, and give `PUBLIC_ORIGIN/.well-known/pcp` to any AI agent you want to connect.

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
pnpm --filter @oneself/public-page build
node --env-file=.env --experimental-strip-types apps/server/src/index.ts
```

Open <http://127.0.0.1:3000> for the original page and <http://127.0.0.1:3000/admin> to sign in.

> [!TIP]
> On direct start the app checks `DATABASE_URL`, `OBJECT_STORAGE_*`, `apps/admin/dist`, and `packages/public-page/dist`, and refuses to start if any is missing. It also refuses to start when no account exists yet and `OWNER_PASSWORD` is not set.

## 🔧 Configuration

See [`.env.example`](.env.example) for every variable with comments. `.env` is git-ignored; never commit real secrets.

| Variable                                                          | Description                                                                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_ORIGIN`                                                   | The single public origin, used for discovery, OAuth issuer, approval links, and media URLs; adds `Secure` to the cookie when HTTPS                   |
| `OWNER_LOGIN` / `OWNER_PASSWORD`                                  | Creates your account (the single account owner) on first start, stores only an Argon2id hash, and forces a password change                           |
| `OWNER_RESET_PASSWORD`                                            | Set temporarily if you forget the password; on restart it replaces the hash and forces a change again. Remove it afterwards. There is no email reset |
| `DATABASE_URL`                                                    | PostgreSQL connection string; built from `POSTGRES_PASSWORD` in Compose                                                                              |
| `OBJECT_STORAGE_*`                                                | S3-compatible endpoint, region, bucket, and keys; supplied from `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` in Compose                                 |
| `COMPOSE_PROFILES`                                                | Public ingress: `cloudflared` (default), `caddy`, or `tailscale`; only one at a time                                                                 |
| `TUNNEL_TOKEN` / `APP_DOMAIN`, `ACME_EMAIL` / `TAILSCALE_AUTHKEY` | For cloudflared, Caddy, and Tailscale respectively                                                                                                   |
| `ONESELF_IMAGE`                                                   | App image. Local default is `oneself:local`, built from the Dockerfile. A production install uses `docker.io/username/oneself:latest`                |
| `HOST` / `PORT`                                                   | Listen address and port, default `127.0.0.1:3000`; `0.0.0.0` inside the container                                                                    |

## 🧱 Architecture

<p align="center">
  <img src="docs/images/architecture.png" alt="OneSelf architecture: you, the account owner, approve and revoke access and curate your context in the admin UI; any AI agent or script connects to the PCP (HTTP and MCP, same operations) with an API key or OAuth device code you approved; visitors open the public homepage, which reads public content only; personal context is pages plus originals, with per-source grants, private by default and revertible versions, stored in self-hosted RustFS and PostgreSQL" width="100%" />
</p>

- **One process**: PCP, MCP, OAuth, the admin static files, and the published site are all served by one Hono app. No microservices, no Redis, no queue.
- **Rules stay out of routes**: HTTP and MCP only authenticate, parse, and respond. Shared use cases live in `apps/server/src/app`, business rules in pure-TypeScript `packages/domain`; object storage, clock, and page parsing come in through `ports` / `adapters`, and dependency-cruiser enforces the direction.
- **Source vs. projection**: page sources, originals, and site files live in object storage; page bodies, tags, links, facts, and timelines in PostgreSQL are projections. A write stores the hashed object first, then updates projections and appends a version in one transaction.
- **The site never queries pages**: the handler that serves site files only follows the site pointer; data on the page comes from separate browser requests to the public PCP.

| Role                | Can                                                                                                                                                     | Cannot                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| You (account owner) | Sign in to the admin UI, approve API keys and device-flow grants, revoke keys and grants, approve homepage launches, delete or restore sources          | Reset the password by email                       |
| AI agent            | Call the same operations within the approved sources and permissions using an API key or device-flow token; request a homepage launch with `site:write` | Create or manage keys, approve grants or launches |
| Visitor             | Open the live public site and read public content and public originals                                                                                  | Read any `private` page                           |

For the Mermaid system overview, code boundaries, tables, and key flows, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#系统总览图) (Chinese, with an English diagram).

## 🤖 Agent entry points

| Path                                   | Who                    | Purpose                                                                                                                             |
| -------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/.well-known/pcp`                     | Agents                 | Discovery: protocol version, operation list, OpenAPI, MCP, OAuth, skills                                                            |
| `/.well-known/agent-skills/index.json` | Installers             | Archive index for the single product skill `oneself`                                                                                |
| `/skills/oneself/SKILL.md`             | Agents                 | The only product skill. Read the context reference before writing, and the public-page reference before customizing the public page |
| `/openapi.json`                        | Agents, scripts        | OpenAPI generated from the operation registry                                                                                       |
| `POST /mcp`                            | MCP clients            | Streamable HTTP; same auth headers as PCP                                                                                           |
| `/pcp/v1/*`                            | Authenticated callers  | Pages, originals, search, structure, sources, identity, and site operations                                                         |
| `/pcp/v1/public/*`                     | Anyone                 | Only `visibility: public`, non-deleted pages                                                                                        |
| `/media/{id}`                          | Depends on owning page | Original bytes; anonymous when the owning page is public                                                                            |
| `/oauth/device/auth`, `/oauth/token`   | Agents                 | Request a device code; obtain and refresh access tokens                                                                             |
| `/admin`                               | You (account owner)    | Sign in, change password, approve device codes, API keys, and site launches                                                         |
| `/_preview/{releaseId}/`               | Anyone                 | Preview an unreleased build without moving the live pointer                                                                         |

Agents connect with either an API key (`Authorization: ApiKey <key>` or `X-Api-Key`) or an access token from the OAuth 2.1 device flow (`Authorization: Bearer <token>`). You approve both, and the same permissions give the same results. Errors are always `{ "error", "message" }`. Paths are defined in [`packages/operations/src/registry.ts`](packages/operations/src/registry.ts).

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

## 🧩 How context is organized

A context is made of **pages** and **originals**, grouped by source, e.g. `profile`, `career`, `health`:

- **Pages**: identified by `(source, slug)`; fields such as `type`, `title`, and `visibility` go in the frontmatter at the top, and any other keys are free-form. Statements that need a validity date or confidence go under `## Facts`, and dated events under `## Timeline`.
- **Originals**: photos, scans, and documents (JPEG, PNG, WebP, GIF, PDF, up to 20 MiB each) are uploaded with `file_upload` and referenced from a page's `files`; an original is anonymously readable only when its page is public.

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

Pages recognize only these two structured blocks, and a parse failure rolls back the whole write. Full rules: [skills/oneself/references/context.md](skills/oneself/references/context.md).

## 📁 Project structure

```text
OneSelf/
├── apps/
│   ├── server/            # The single Node process: pcp/, mcp/, oauth/, owner/, site-files/; use cases in app/
│   └── admin/             # Admin UI (Vite + React), talks HTTP only
├── packages/
│   ├── domain/            # Pure business rules: pages, originals, search, access, site pointer
│   ├── operations/        # Operation registry: names, paths, http-only. Zero dependencies
│   ├── ports/             # Interfaces for object storage, clock, page parsing
│   ├── adapters/          # S3 and PostgreSQL implementations plus in-memory test fakes
│   ├── db/                # Drizzle schema and SQL migrations
│   ├── public-client/     # Anonymous public PCP client, also used by custom sites
│   └── public-page/       # Source of the built-in public page
├── skills/oneself/        # Product skill: SKILL.md and references/
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

`compose.yaml` runs the app, PostgreSQL 18, and single-disk RustFS (`rustfs/rustfs:1.0.1`), and creates the bucket with aws-cli on first start. None of the app, database, or object storage publishes a host port; data lives in named volumes. The app image is built from the root `Dockerfile`, bundles the admin UI, the original page, its source zip, and `skills/`, and listens on `3000`. A production install sets `ONESELF_IMAGE` to `docker.io/<Docker Hub username>/oneself:latest`. Pushing a tag such as `v1.2.3` makes the release workflow push `oneself:1.2.3` and move `latest`. A prerelease tag pushes only the version and does not move `latest`. Update with `docker compose pull && docker compose up -d`. Set the `DOCKERHUB_USERNAME` variable and `DOCKERHUB_TOKEN` secret first. The same tag includes `linux/amd64` and `linux/arm64`. The build receives no secrets or `PUBLIC_ORIGIN`, and ingress programs are not part of this image.

The public ingress is a mutually exclusive Compose profile selected by `COMPOSE_PROFILES` in `.env`; switching ingress does not change the app image:

| Profile                 | Who can reach it                 | Needs                                                  |
| ----------------------- | -------------------------------- | ------------------------------------------------------ |
| `cloudflared` (default) | Internet, hostname on Cloudflare | `TUNNEL_TOKEN`. No router ports opened                 |
| `caddy`                 | Internet, your own domain        | `APP_DOMAIN`, `ACME_EMAIL`; ports 80 and 443 reachable |
| `tailscale`             | Devices on the same tailnet only | `TAILSCALE_AUTHKEY`. Serve only, no Funnel             |

Every ingress only forwards HTTPS to the app and never stores site files. `PUBLIC_ORIGIN` must match the chosen ingress's public address. Without a tunnel token or auth key the ingress container may fail while the app and database keep running.

Behind Cloudflare, do not cache `/pcp`, `/oauth`, `/.well-known`, `/admin`, `/skills`, `/media`, or `/_preview`. The app has simple built-in rate limits per IP per minute: 10 for login and device codes, 30 for public search and uploads; the client address is taken only from the ingress's own header.

</details>

## 📚 Documentation

- [Product requirements (PRD, Chinese)](docs/PRD.md): goals, non-goals, data model, PCP, acceptance criteria
- [Architecture (Chinese)](docs/ARCHITECTURE.md): stack, code boundaries, data, paths, and key flows
- [Skill: oneself](skills/oneself/SKILL.md)
- [OpenSpec change: oneself-mvp](openspec/changes/oneself-mvp/proposal.md)
- On a running instance: `/.well-known/pcp`, `/.well-known/agent-skills/index.json`, `/openapi.json`, `/skills/oneself/SKILL.md`
- Install: `npx skills add https://your-site`

## 🤝 Contributing

Issues and pull requests are welcome.

1. Branch from the current `main`.
2. Keep changes within the scope of [docs/PRD.md](docs/PRD.md); if operation names, permissions, or error codes change, update the docs and [`packages/operations`](packages/operations/src/registry.ts) before the code.
3. Run `pnpm check` before committing.
4. Open a pull request describing the behavior change and how you verified it.
