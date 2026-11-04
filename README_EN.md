<div align="center">

<img src="docs/images/hero.png" alt="OneSelf: One self. One context. Every AI." width="100%" />

<h1>OneSelf</h1>

<p><strong>One self. One context. Every AI.</strong></p>

<p>Every new AI means pasting your experience, notes, and preferences again, with no clear line for what that agent may see.</p>

</div>

<!-- TODO(demo-gif): Film docs/demo-gif-storyboard.md (30–60s).
     Save the file as docs/assets/oneself-demo.gif (it does not exist yet).
     Then replace this blockquote with:
     <img src="docs/assets/oneself-demo.gif" alt="Two clients read one personal context, then a grant is approved and revoked" width="100%" />
     Do not reuse docs/assets/cli-install.gif; that clip is only the installer. -->

> **Demo GIF not recorded yet.** Shot list, captions, and the README snippet to paste afterwards are in [docs/demo-gif-storyboard.md](docs/demo-gif-storyboard.md). Put the file at `docs/assets/oneself-demo.gif`.

**One-line install** (Docker and Docker Compose v2)

```bash
curl -fsSL https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.sh | sh
```

Windows (PowerShell): `powershell -c "irm https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.ps1 | iex"`

Options, upgrades, and running from source are under [Quick start](#-quick-start).

**Clients (documented configuration, not a verified list)**

This repository does not name any client as supported. The documented ways in are HTTP (OpenAPI) and `POST /mcp`, which share one operation table, and `npx skills add https://your-origin -a <agent> -s oneself`. The `<agent>` value is interpreted by the installer. It is not a list of products this repo has verified.

<div align="center">

<p>
  <a href="https://github.com/ptonlix/OneSelf/stargazers"><img src="https://img.shields.io/github/stars/ptonlix/OneSelf" alt="GitHub stars" /></a>
  <a href="https://github.com/ptonlix/OneSelf/releases/latest"><img src="https://img.shields.io/github/v/release/ptonlix/OneSelf" alt="GitHub release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/ptonlix/OneSelf" alt="MIT license" /></a>
  <a href="https://hub.docker.com/r/ptonlix/oneself"><img src="https://img.shields.io/docker/pulls/ptonlix/oneself" alt="Docker pulls for ptonlix/oneself" /></a>
  <a href="https://github.com/ptonlix/OneSelf/actions/workflows/ci.yml"><img src="https://github.com/ptonlix/OneSelf/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

<p>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white" alt="Node.js 24" />
  <img src="https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white" alt="Hono 4" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 18" />
  <img src="https://img.shields.io/badge/MCP-Streamable_HTTP-6E56CF" alt="MCP Streamable HTTP" />
</p>

</div>

## Why OneSelf

The OneSelf column is limited to facts this repository already states. The other two columns only say where that kind of product usually sits in a comparison. They are not a feature audit of Mem0, OpenMemory, or Basic Memory. What those projects do is defined by their own docs.

|               | OneSelf                                                                                                                                     | Mem0 / OpenMemory-style memory layer                           | Basic Memory                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Job           | One personal context, shared by many AIs                                                                                                    | A layer that stores and retrieves memories for an app or agent | Markdown notes on your machine                               |
| Where it runs | On your machine. Docker Compose, PostgreSQL, and RustFS. The default ingress is this host or the LAN                                        | See that project's docs                                        | See that project's docs                                      |
| Who may read  | You approve every API key and every OAuth device-code grant, and you can revoke each one on its own                                         | See that project's docs                                        | See that project's docs                                      |
| What stays    | Markdown pages, originals, Facts, and Timeline. Each page keeps its last 50 versions. Deleted pages and sources can be restored for 30 days | See that project's docs                                        | See that project's docs                                      |
| Public page   | Optional. The built-in home page is only an introduction. A personal homepage goes live only after you approve it                           | This repo does not state whether they have a public homepage   | This repo does not state whether they have a public homepage |

An agent cannot issue itself a key, and it cannot approve a grant for you. Uploading a site bundle does not publish it.

<div align="center">

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

You shouldn't have to start with an introduction every time.

You switched AIs. You are still you. Your experience, knowledge, work, and preferences should not move with a platform.

OneSelf puts that material back in your hands.

Open source and self-hosted. One set of personal material, shared by many AIs. Every read, edit, and publication needs your approval.

**Your material, your call. AIs come to know you, instead of you adapting to each AI.**

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

### 🐳 Option 1: CLI install

> Requires Docker and Docker Compose v2.

**macOS / Linux**

```bash
curl -fsSL https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.sh | sh
```

**Windows** (PowerShell, not Git Bash)

```powershell
powershell -c "irm https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.ps1 | iex"
```

<img src="docs/assets/cli-install.gif" alt="OneSelf CLI install demo: run curl … | sh, set the admin account, pick the local/LAN ingress, and finish with the install summary showing the home page and admin URLs" width="100%" />

The installer prompts for the public origin and ingress, then starts the services. Then:

1. Open the printed `PUBLIC_ORIGIN` (home page)
2. Sign in at `/admin` and change the password
3. Give `PUBLIC_ORIGIN/.well-known/pcp` to your agent

**Install options**

- Directory: `$HOME/.local/share/oneself` by default (`%LOCALAPPDATA%\oneself` on Windows), never the source tree; the script prints it first
- Another directory: `ONESELF_DIR=/path` or `sh -s -- --dir /path` (the Compose project stays `oneself`, sharing the same volumes)
- Non-interactive: `ONESELF_YES=1`
- Ingress: local/LAN by default; Cloudflare Tunnel, Caddy, or Tailscale also available, see [Deployment](#-deployment)
- Variables: see [Configuration](#-configuration)

**Operations**

- Commands: `bin/oneself update | doctor | backup | restore`
- `update` only pulls the pinned image and restarts; `doctor` only checks
- Upgrade: re-run a newer Release's install command; passwords are kept
- An older Release never downgrades an install; set `ONESELF_REF=v1.2.3` to force a version

**Implementation**

- One install implementation: the CLI binary in [`apps/cli`](apps/cli)
- `oneself.sh` / `oneself.ps1` are thin bootstraps ([`deploy/oneself-bootstrap.sh`](deploy/oneself-bootstrap.sh), [`deploy/oneself-bootstrap.ps1`](deploy/oneself-bootstrap.ps1)) that download and verify the platform binary, then hand over
- Alpine/musl uses `oneself-linux-*-musl`

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

`pnpm dev` builds the admin UI and the built-in public page, then starts the server; the process applies pending migrations before it listens. The app requires Node.js 24; the root `.node-version` pins it, so fnm, nvm, asdf, and volta switch automatically:

```bash
pnpm dev
```

`pnpm db:migrate` applies migrations without starting the app. Use it before an import so the process does not create the owner first.

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
| `COMPOSE_PROFILES`                                                | Ingress: `local` (default, LAN `http://IP:HOST_PORT`), `cloudflared`, `caddy`, or `tailscale`; only one at a time                                    |
| `TUNNEL_TOKEN` / `APP_DOMAIN`, `ACME_EMAIL` / `TAILSCALE_AUTHKEY` | For cloudflared, Caddy, and Tailscale respectively                                                                                                   |
| `ONESELF_IMAGE`                                                   | App image. Installs use `docker.io/ptonlix/oneself:latest`. Use `oneself:local` only when building from source                                       |
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
| `/.well-known/pcp`                     | Agents                 | Discovery: protocol version, operation list, auth headers, public endpoints, upload limits, OpenAPI, MCP, OAuth, skills             |
| `/.well-known/agent-skills/index.json` | Installers             | Archive index for the single product skill `oneself`                                                                                |
| `/skills/oneself/SKILL.md`             | Agents                 | The only product skill. Read the context reference before writing, and the public-page reference before customizing the public page |
| `/openapi.json`                        | Agents, scripts        | OpenAPI generated from the operation registry and the same input schemas as MCP, with parameters, bodies, and security              |
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
pnpm test:smoke       # Closed-loop smoke test on the running compose.dev.yaml services, separate DB and bucket
pnpm boundaries       # Package dependency direction only
pnpm db:migrate       # Apply migrations to DATABASE_URL from .env without starting the app
pnpm data:export -- --out oneself-export --stopped
pnpm data:import -- --from oneself-export.tar.gz --stopped
pnpm dev              # Build the admin UI and built-in public page, then start the app
```

`data:export` / `data:import` pack the PostgreSQL `public` data and the RustFS `pages/`, `files/`, and `sites/` prefixes into a `tar.gz`, then load that archive into an empty database and bucket migrated to the same revision. `--out oneself-export` writes `oneself-export.tar.gz`; copy that file to the new machine. Stop the app and pass `--stopped`. The bundle contains password hashes and key hashes; do not commit it. Sessions, device codes, `PUBLIC_ORIGIN`, and object-storage credentials are not included. Add `--via compose` when the production database port is not published. Without a PostgreSQL 18 `pg_dump` on the host, use `--via compose --compose compose.dev.yaml` for the dev dependencies. Import into a non-empty target only with `--replace`.

`pnpm test:smoke` starts and stops no containers; bring the dev services up first with `docker compose -f compose.dev.yaml up -d`. It creates and resets a separate `oneself_smoke` database in the same PostgreSQL and creates and empties a separate `oneself-smoke` bucket in the same RustFS, never touching dev data, and leaves both in place afterwards. It does not read `DATABASE_URL` or `OBJECT_STORAGE_*` from `.env`; override with `SMOKE_POSTGRES_ADMIN_URL` (default `postgres://oneself:oneself@127.0.0.1:5432/postgres`), `SMOKE_DATABASE`, `SMOKE_OBJECT_STORAGE_ENDPOINT`, `SMOKE_OBJECT_STORAGE_BUCKET`, `SMOKE_OBJECT_STORAGE_ACCESS_KEY_ID`, `SMOKE_OBJECT_STORAGE_SECRET_ACCESS_KEY`, and `SMOKE_OBJECT_STORAGE_REGION`. A database or bucket name without `smoke`, or named `oneself`, is refused.

`pnpm check` is the local gate before merging. Install dependencies with pnpm only. Behavior follows [docs/PRD.md](docs/PRD.md); paths, transactions, and deployment follow [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🚢 Deployment

`compose.yaml` runs the app, PostgreSQL 18, and RustFS; none of them publishes a host port. The ingress is chosen by `COMPOSE_PROFILES` in `.env` from four mutually exclusive profiles (the installer asks once); switching ingress does not change the app image:

| Profile           | Who can reach it                  | Needs                                                   |
| ----------------- | --------------------------------- | ------------------------------------------------------- |
| `local` (default) | This host / LAN, `http://IP:port` | `HOST_PORT` (default 3000). Only this port is published |
| `cloudflared`     | Internet, hostname on Cloudflare  | `TUNNEL_TOKEN`. No router ports opened                  |
| `caddy`           | Internet, your own domain         | `APP_DOMAIN`, `ACME_EMAIL`; ports 80 and 443 reachable  |
| `tailscale`       | Devices on the same tailnet only  | `TAILSCALE_AUTHKEY`. Serve only, no Funnel              |

- `PUBLIC_ORIGIN` must match the chosen ingress's public address.
- Behind Cloudflare, do not cache `/pcp`, `/oauth`, `/.well-known`, `/admin`, `/skills`, `/media`, or `/_preview`.
- Without the installer: `cp .env.example .env`, fill in the variables, then `docker compose pull && docker compose up -d`.
- Agents connect with `npx skills add https://your-origin -a <agent> -s oneself`.

## 📚 Documentation

- [Product requirements (PRD, Chinese)](docs/PRD.md): goals, non-goals, data model, PCP, acceptance criteria
- [Architecture (Chinese)](docs/ARCHITECTURE.md): stack, code boundaries, data, paths, and key flows
- [Skill: oneself](skills/oneself/SKILL.md)
- [Demo GIF storyboard](docs/demo-gif-storyboard.md)
- On a running instance: `/.well-known/pcp`, `/.well-known/agent-skills/index.json`, `/openapi.json`, `/skills/oneself/SKILL.md`
- Install: `npx skills add https://your-site`

## 🤝 Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Report vulnerabilities through [SECURITY.md](SECURITY.md), and do not paste keys, passwords, or export archives into an issue. The collaboration agreement is [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

1. Branch from the current `main`.
2. Keep changes within the scope of [docs/PRD.md](docs/PRD.md); if operation names, permissions, or error codes change, update the docs and [`packages/operations`](packages/operations/src/registry.ts) before the code.
3. Run `pnpm check` before committing.
4. Open a pull request describing the behavior change and how you verified it.
