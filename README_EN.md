<div align="center">

<img src="docs/images/hero.png" alt="OneSelf: One self. One context. Every AI." width="100%" />

<h1>OneSelf</h1>

<p><strong>One self. One context. Every AI.</strong></p>

<p>Open-source, self-hosted personal context and cognition.<br />Let AI do more than remember you. Let it come to understand you.</p>

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

<p>
  <a href="#-what-is-oneself">What</a> ·
  <a href="#-why-oneself">Why</a> ·
  <a href="#-soul-and-recent">Soul and Recent</a> ·
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-agent-entry-points">Agent entry points</a> ·
  <a href="#-documentation">Docs</a> ·
  <a href="README.md">中文</a>
</p>

</div>

<p align="center">
  <a href="https://chenfudong.win/">
    <img src="docs/assets/site-intro.gif" alt="Opening animation of chenfudong.win" width="100%" />
  </a>
  <br />
  <sub>A personal site built with OneSelf: <a href="https://chenfudong.win/">chenfudong.win</a></sub>
</p>

---

## 💡 What is OneSelf

Do you introduce yourself again every time you switch AIs?

Your experience, how you think, work habits, interests, and goals are scattered across platforms, chats, and files. An AI may remember some of that, and still fail to understand a person over time.

**OneSelf is not only a memory problem. It is how an AI keeps understanding a person.**

It puts your material, experience, knowledge, and files back in your hands, and lets an agent gradually draw out:

- What do you actually care about?
- How do you think, judge, and solve problems?
- How do you tend to work and live?
- What are you pursuing over the long run?
- What are you paying attention to, and living through, right now?
- What is changing?

That understanding is kept as two portraits:

- **Soul: the long-term you.**
- **Recent: the current you.**

Source material is evidence. Personal cognition is what accumulates. Collaboration with AI is the point. With your approval, different AIs read the same context instead of meeting you from zero.

**Your material, your call. Your portrait is built from evidence. Your context belongs to no AI platform.**

## 🤔 Why OneSelf

Most AIs already have Memory. Why OneSelf?

1. **Memory is fragmented.** Switch AIs and you introduce yourself again. Platform memory does not travel, and it does not merge.
2. **Remembering is not understanding.** Notes, facts, and a portrait of a person are different things. A large archive can still miss how someone thinks and decides.
3. **Personal data should not belong to a platform.** You need to own, control, and authorize your context, instead of leaving that to each chat.

> An AI should not have to meet you from zero every time. OneSelf lets every AI gradually understand the real you.

## 🧠 Soul and Recent

OneSelf does not only store what you said. It builds an understanding from material and evidence that accumulate over time. That understanding has two dimensions. `self` is a built-in source. `self/soul` and `self/recent` are created from templates. An agent does not start a separate overview.

### Soul: the long-term you

`self/soul` records stable traits that observation and repeated evidence can support. It is not a résumé and not a set of labels. One accidental act does not enter the formal portrait.

| Dimension             | What it captures                                          |
| --------------------- | --------------------------------------------------------- |
| Values                | Beliefs: what you actually care about                     |
| Thinking              | How you think and judge                                   |
| Operating             | How you act, decide, and solve problems                   |
| Habits                | Patterns that keep showing up                             |
| Motivations           | What you pursue over the long run                         |
| Strengths & Frictions | What you are good at, and what repeatedly gets in the way |

Supported judgments enter the formal portrait. Patterns worth watching, but not yet confirmed, stay in the candidate observations. They are not confirmed traits.

### Recent: the current you

`self/recent` records the life that still matters to understand. It is not a diary, and it is not an upload log.

| Dimension          | What it captures                                             |
| ------------------ | ------------------------------------------------------------ |
| Focus              | What you have been attending to, studying, or thinking about |
| Work               | Current work, practice, and projects                         |
| Mood               | Recent emotion, pressure, and drive                          |
| Health             | Body and health states that already appear in the material   |
| Life               | Daily life, routine, and changes of setting                  |
| Relationships      | Relationships that matter right now                          |
| Goals & Challenges | Current goals, difficulties, and choices                     |

Every judgment cited as the present has a time basis and a `valid_until`. A past mood, a finished project, or an old health state is not the present just because it was written down.

### How they differ

|                | Soul                                                | Recent                            |
| -------------- | --------------------------------------------------- | --------------------------------- |
| Question       | Who is this person over time?                       | What are they living through now? |
| Time           | Long-term, relatively stable                        | Recent, still changing            |
| Content        | Values, thinking, habits, motives                   | Work, mood, health, daily life    |
| How it changes | New evidence supports, revises, or drops a judgment | It moves with current life        |
| Rule           | Do not conclude lightly                             | Do not treat expired notes as now |

**Soul is the inner pattern. Recent is the present situation. Together they are what an AI needs in order to understand you.**

The boundary is part of the product: one act is not a lasting trait; an agent's inference is not something you said; empty sections stay empty; expired notes are not the present; uploading a file is not permission to archive a life. Format and initialization: [skills/oneself/references/self.md](skills/oneself/references/self.md).

## ✨ Features

**Ongoing understanding, not just an archive**

- **Soul**: values, thinking, ways of working, habits, and motives, drawn from material that accumulates.
- **Recent**: current focus, work, mood, health, daily life, relationships, and goals.
- **Active linking**: an agent does not only file one document. It compares existing evidence for repeated patterns, real changes, and possible contradictions.
- **Bounded cognition**: separate what you said, what the material shows, and what the agent infers. Uncertainty stays a candidate, or stays as source material.
- **Revision**: new evidence can support, correct, or overturn an old judgment. The portrait should get closer to the person, not merely fuller.

**One context for material and portrait**

- **Material stays put**: experience, projects, notes, and knowledge become pages. Photos and PDFs are uploaded as originals and attached.
- **Evidence you can follow**: judgments in Soul and Recent link back to source pages.
- **Time and history**: facts, timelines, tags, links, and validity dates are searchable. Incremental edits carry the current version. Each page keeps its last 50 versions. Deleted pages and sources can be restored for 30 days.
- **No second copy**: source pages keep the original. The portrait only keeps judgments that help later understanding.

**Agent-first: maintain with judgment, do not passively record**

- **Finish the task you asked for first.** A one-off translation, summary, or edit does not become long-term memory.
- **Update the portrait only when the material warrants it.** If the intent is unclear, sensitive material is not archived on its own.
- **Start from empty.** A new user does not fill out a résumé first. Existing material can grow a portrait over time.
- **One entry.** PCP, HTTP / OpenAPI, and MCP share one operation table. Different agents use the same context you approved.

**Yours to keep**

- **Open source and self-hosted**: Node.js, PostgreSQL, and RustFS, deployed with Docker Compose. Agents only use the API.
- **Private by default**: read, write, and visibility are granted per source. Without access, a private page looks like a missing one.
- **You approve every grant, and can revoke any of them**: API keys and OAuth device codes both need your approval. Agents cannot issue themselves keys or approve on your behalf.
- **Public only by your choice**: an agent may help build the public homepage. A new version goes live only after you approve.

## 🗂️ How context is organized

Personal context has three layers. Source material is evidence. Soul and Recent are the portrait. Collaboration is the point.

### 1. Source material: keep the evidence

Experience, projects, notes, knowledge, health records, photos, and PDFs stay in their own sources. You name those sources, for example:

```text
work/
knowledge/
health/
life/
```

A page holds structured writing. Originals are uploaded with `file_upload` and attached to a page. An original is anonymously readable only when its page is public. These sources are not a fixed filing scheme, and they do not replace the portrait.

### 2. Personal cognition: keep the judgments that matter

Two pages sit above the material. They do not copy it. They record judgments that evidence can support, and link back to the source.

```text
self/soul      # long-term portrait, including candidate observations
self/recent    # recent life, with a validity date on each current judgment
```

`self` is built in. On startup the server fills in either page if it is missing, and does not overwrite an existing body. An agent must not create them again, and must not write a separate overview in their place.

### 3. AI collaboration: one context, many agents

An approved agent reads Soul, Recent, and the relevant source pages through PCP, then helps from that understanding. Reads, edits, and publication stay inside the permissions you granted.

Page format, Facts / Timeline, and operations: [context.md](skills/oneself/references/context.md). How to write the portrait: [self.md](skills/oneself/references/self.md).

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
2. Give this command to the agent you are talking to (replace `<agent>` with its name):

```bash
npx skills add https://your-origin -a <agent> -s oneself -y
```

3. With no credential, the agent requests a device code. Sign in at `/admin`, then approve it at `/admin/device`.
4. An API key is for a script or a long-lived key, not the first conversational connect.

**Install options**

- Directory: `$HOME/.local/share/oneself` by default (`%LOCALAPPDATA%\oneself` on Windows), never the source tree; the script prints it first
- Another directory: `ONESELF_DIR=/path` or `sh -s -- --dir /path` (the Compose project stays `oneself`, sharing the same volumes)
- Non-interactive: `ONESELF_YES=1`
- Ingress: local/LAN by default; Cloudflare Tunnel, Caddy, or Tailscale also available, see [Deployment](#-deployment)
- Variables: see [Configuration](#-configuration)

**Operations**

- Commands: `bin/oneself update | doctor | backup | restore`
- `backup` / `restore` run in the install directory with its `compose.yaml`; they do not need a checkout or `scripts/transfer-cli.ts`
- `update` upgrades and restarts when a newer release exists; otherwise it only pulls the current image. `doctor` only checks
- `update` can move `.oneself-release` and `ONESELF_IMAGE`, but replacing the CLI binary still requires re-running the Release install command.
- Passwords are kept. An older Release's install command never downgrades; set `ONESELF_REF=v1.2.3` to force a version

Install and operations are implemented in [`apps/cli`](apps/cli). `oneself.sh` / `oneself.ps1` only download and verify the platform binary, then hand over. The scripts are [`deploy/oneself-bootstrap.sh`](deploy/oneself-bootstrap.sh) and [`deploy/oneself-bootstrap.ps1`](deploy/oneself-bootstrap.ps1).

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

| Path                                        | Who                    | Purpose                                                                                                                 |
| ------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/.well-known/pcp`                          | Agents                 | Discovery: protocol version, operation list, auth headers, public endpoints, upload limits, OpenAPI, MCP, OAuth, skills |
| `/.well-known/agent-skills/index.json`      | Installers             | Archive index for the single product skill `oneself`                                                                    |
| `/skills/oneself/SKILL.md`                  | Agents                 | The only product skill: mission, how to connect, and which reference to read                                            |
| `/skills/oneself/references/philosophy.md`  | Agents                 | Design philosophy: fewer, more accurate judgments, not a larger archive                                                 |
| `/skills/oneself/references/cognition.md`   | Agents                 | How to observe, link, and where cognition must stop                                                                     |
| `/skills/oneself/references/self.md`        | Agents                 | Format and initialization for `self/soul` and `self/recent`                                                             |
| `/skills/oneself/references/context.md`     | Agents                 | Pages, originals, and file operations                                                                                   |
| `/skills/oneself/references/public-page.md` | Agents                 | The public homepage: customize, preview, and request a launch                                                           |
| `/openapi.json`                             | Agents, scripts        | OpenAPI generated from the operation registry and the same input schemas as MCP, with parameters, bodies, and security  |
| `POST /mcp`                                 | MCP clients            | Streamable HTTP; same auth headers as PCP                                                                               |
| `/pcp/v1/*`                                 | Authenticated callers  | Pages, originals, search, structure, sources, identity, and site operations                                             |
| `/pcp/v1/public/*`                          | Anyone                 | Only `visibility: public`, non-deleted pages                                                                            |
| `/media/{id}`                               | Depends on owning page | Original bytes; anonymous when the owning page is public                                                                |
| `/oauth/device/auth`, `/oauth/token`        | Agents                 | Request a device code; obtain and refresh access tokens                                                                 |
| `/admin`                                    | You (account owner)    | Sign in, change password, approve device codes, API keys, and site launches                                             |
| `/_preview/{releaseId}/`                    | Anyone                 | Preview an unreleased build without moving the live pointer                                                             |

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
pnpm data:export --out oneself-export --stopped
pnpm data:import --from oneself-export.tar.gz --stopped
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
- Agents connect with `npx skills add https://your-origin -a <agent> -s oneself -y`.

## 📚 Documentation

- [Product requirements (PRD, Chinese)](docs/PRD.md): goals, non-goals, data model, PCP, acceptance criteria
- [Architecture (Chinese)](docs/ARCHITECTURE.md): stack, code boundaries, data, paths, and key flows
- [Skill: oneself](skills/oneself/SKILL.md)
- [Philosophy](skills/oneself/references/philosophy.md) · [Cognition](skills/oneself/references/cognition.md) · [Soul / Recent](skills/oneself/references/self.md) · [Context operations](skills/oneself/references/context.md) · [Public page](skills/oneself/references/public-page.md)
- On a running instance: `/.well-known/pcp`, `/.well-known/agent-skills/index.json`, `/openapi.json`, `/skills/oneself/SKILL.md`

## 🤝 Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Report vulnerabilities through [SECURITY.md](SECURITY.md), and do not paste keys, passwords, or export archives into an issue. The collaboration agreement is [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

1. Branch from the current `main`.
2. Keep changes within the scope of [docs/PRD.md](docs/PRD.md); if operation names, permissions, or error codes change, update the docs and [`packages/operations`](packages/operations/src/registry.ts) before the code.
3. Run `pnpm check` before committing.
4. Open a pull request describing the behavior change and how you verified it.

## ⭐ Star History

<a href="https://www.star-history.com/#ptonlix/OneSelf&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ptonlix/OneSelf&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ptonlix/OneSelf&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ptonlix/OneSelf&type=date&legend=top-left" />
  </picture>
</a>
