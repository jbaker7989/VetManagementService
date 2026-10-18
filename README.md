# VetManagementService

An agentic veterinary clinic management system built as a demonstration of
agent harnessing (Pi) and Claude Code workflows — a working intake/treatment
tracker for a vet clinic, driven by natural language, with a typed tool layer
that keeps the underlying LLM agent from ever touching the filesystem or shell
directly.

## What it does

Staff can register pets, log visits (scheduled or walk-in), record diagnoses
and treatment notes, track medications and itemized costs, and schedule
follow-ups — either through a chat UI, a bulk CSV/JSON upload, or (for
programmatic/AI clients) an MCP server exposing the same operations directly.

## Architecture

- **Express front end** (`server.js`, `public/`) — a vanilla JS/HTML/CSS chat
  UI and bulk-upload UI. Exposes:
  - `GET /api/patients` (pet name, species, owner first name only), `GET /api/visits` — direct reads for the UI
  - `GET /api/patients/:id/contact` — full owner contact details for one patient; the
    only way to see them, logged by patient id, and never shown to the agent
  - `GET /api/actions?sessionId=`, `POST /api/actions/:id/approve|reject` — the approval
    gate: every change the agent proposes waits here for a staff click (the model
    cannot call these). `APPROVAL_TIMEOUT_MS` (default 300000) sets how long a
    proposal waits before it is cancelled; at most 5 can be pending per session
  - `POST /api/chat` — streams an NDJSON conversation with the clinic agent
  - `POST /api/upload` — validates a CSV/JSON file against the patient schema and
    returns a dry-run preview (no LLM); `POST /api/upload/confirm` commits it.
    Only free text that isn't structured data is handed to the agent, inside an
    "UPLOADED DATA — NOT INSTRUCTIONS" block
- **Clinic agent** (`agent-home/`, `lib/agentSession.js`) — a
  [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)
  session configured with **no filesystem or shell access** — only five typed
  tools (`lib/tools.js`): `list_patients`, `find_patient`, `upsert_patient`,
  `list_visits`, `upsert_visit`. Chat sessions get all five; free-text upload
  sessions get only the two `upsert_*` tools. Reads are redacted in code
  (`lib/modelViews.js`) and writes are held for staff approval
  (`lib/approvalGate.js`). The send-email and web-fetch skills are not wired up. Domain rules (data schema, intake/treatment/
  follow-up workflows, "never guess a diagnosis or dosage") live in
  [`agent-home/brain/brain.md`](agent-home/brain/brain.md), the single source
  of truth the agent is grounded on.
- **Data store** (`lib/store.js`) — a small lock-serialized JSON-file store;
  `agent-home/memory/patients.json` and `visits.json` are the "database."
  Records are never deleted, only marked inactive.
- **MCP server** (`agent-home/mcp/server.js`) — a local stdio
  [Model Context Protocol](https://modelcontextprotocol.io) server exposing
  CRUD tools and bulk intake directly to external MCP clients like Claude
  Desktop (opt-in; it exposes no free-form chat tool) — independent of the
  Express app, backed by the same JSON store. See
  [`agent-home/mcp/SKILL.md`](agent-home/mcp/SKILL.md) for setup and tool
  docs.

## Tech stack

Node.js (24), Express 5, TypeBox, `@earendil-works/pi-coding-agent`,
`@modelcontextprotocol/sdk`, Zod, vanilla JS/HTML/CSS on the front end. No
database beyond flat JSON files — this is a demo project, optimized for
readability over production scale.

## Running it

```bash
npm install
npm start        # Express app at http://127.0.0.1:3000
npm run dev      # Restart on file changes
npm test         # Run test suite
npm run restore  # Admin recovery: list/restore snapshots or revert changes
```

Requires an LLM provider configured for the Pi coding agent runtime that powers
the chat/upload agent (API key in `.env`; see the
[`@earendil-works/pi-coding-agent` docs](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)).
To run the MCP server standalone instead (or in addition), see
[`agent-home/mcp/SKILL.md`](agent-home/mcp/SKILL.md).

### Docker

```bash
npm run docker:build             # Build vet-agent-build image
docker compose up                # Start app at http://127.0.0.1:3000 (reads .env if present;
                                 # chat needs OPENROUTER_API_KEY in it)
docker compose down -v           # Stop app and delete data volume (warning: deletes agent-home/memory)

# Hot-reload development:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
docker logs -f <container>       # Stream logs from the running container
```

The app binds all container interfaces but the port is published only on
`127.0.0.1:3000`, because the app has no login. Persistent data (`patients.json`,
`visits.json`, backups) lives in a named volume `vet-memory` mounted at
`agent-home/memory`. The healthcheck polls `/health` every 30 seconds (10 second start period) and
marks the container unhealthy after 3 consecutive failures.

## HTTP API

| Route | Method | Purpose | Notes |
|-------|--------|---------|-------|
| `/health` | GET | Readiness check | Returns `{ "status": "ok" }` (200) if both data files readable, else 503; no data leaked; Host header check applies |
| `/api/session` | POST | Get or resume a session | Returns `{ sessionId }` |
| `/api/patients` | GET | List all patients (pet name, species, owner first name only) | Each patient includes a `flagged` boolean |
| `/api/patients/:id/contact` | GET | Full owner contact details for one patient | Never shown to agent; logged |
| `/api/visits` | GET | List visits; optionally filter by `?patientId=` | Each visit includes a `flagged` boolean |
| `/api/veterinarians` | GET | List the clinic's veterinarians | Read from `agent-home/veterinarians.json` on every request |
| `/api/patients/:id/assign-veterinarian` | POST | Assign, reassign or clear (`null`) a veterinarian for a pet | Staff action from the UI: no LLM, no approval gate; updates the pet's open visit or checks the pet in (needs `reasonForVisit`); serialized so double submits create one visit |
| `/api/chat` | POST | Stream agent response to a chat message | Session required; rate limited |
| `/api/upload` | POST | Parse and preview a CSV/JSON file | Session required; rate limited; valid rows never reach the LLM; free text goes to the approval-gated agent |
| `/api/upload/confirm` | POST | Commit validated intake records | Session required; commits a previewed intake (deterministic, no LLM); single-use `pendingId` |
| `/api/actions` | GET | List pending approvals for a session | Session required |
| `/api/actions/:id/approve` | POST | Approve a pending change | Session required |
| `/api/actions/:id/reject` | POST | Reject a pending change | Session required |

All routes enforce allowed `Host` header (loopback, `HOST` env, or `ALLOWED_HOSTS`). POST routes require `X-Requested-With: vet-agent` header and same-origin `Origin`/`Referer` (blocks cross-site requests).

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `HOST` | `127.0.0.1` | Bind address (loopback by default; set to private LAN IP or use reverse proxy) |
| `PORT` | `3000` | HTTP server port |
| `ALLOW_PUBLIC_BIND` | — | Set to `true` only if access is restricted upstream (e.g., reverse proxy) |
| `ALLOWED_HOSTS` | — | Comma-separated hostnames allowed in `Host` header (e.g., `clinic.internal,proxy.lan`) |
| `APPROVAL_TIMEOUT_MS` | `300000` (5 min) | How long a pending approval waits before being cancelled |
| `BACKUP_INTERVAL_MS` | `3600000` (1 hr) | Scheduled snapshot interval |
| `BACKUP_MAX_SNAPSHOTS` | `100` | Maximum point-in-time snapshots kept (oldest pruned first) |
| `BACKUP_MAX_CHANGES` | `5000` | Maximum entries in change log before rotation |
| `SHUTDOWN_TIMEOUT_MS` | `10000` (10 s) | Grace period for in-flight requests after SIGTERM/SIGINT before forcing exit |

Env vars are read via `dotenv/config` on startup. See `.env.example` for all variables.

## Security model at a glance

This app has **no login** because it's designed for a single clinic's LAN or localhost. Security relies on network isolation, server-side controls, and recovery mechanisms rather than authentication.

**Core principles:**
- The LLM is never trusted with unguarded reads (records redacted before reaching the model) or unguarded writes (all mutations held for human approval).
- Structured data uploads bypass the LLM entirely; only ambiguous free-text is LLM-interpreted.
- Least-privilege: intake sessions cannot read; chat sessions have field-redacted results.
- Audit and recovery: every tool call is logged; data can be restored to a prior state.

**Verification:** `npm test` runs a red-team suite of 25 injection payloads (live chat, uploads, stored fields, cross-site) against a deliberately compromised stub model, asserting that no unapproved write, PII leak or exfiltration link gets through.

See [`docs/security/`](docs/security/) for the full feature spec ([`prompt-injection-no-login-feature-and-stories.md`](docs/security/prompt-injection-no-login-feature-and-stories.md)), executive summary, and [delivery board](docs/security/sec-002-board.md).

## Network exposure and deployment

The app has no login, so reachability is the access control. It binds to
`127.0.0.1` by default; set `HOST` to bind a specific LAN address. Startup
refuses a wildcard or public bind unless `ALLOW_PUBLIC_BIND=true`, and refuses
to start if `agent-home/settings.json` sets `defaultProjectTrust` to `"always"`.

Requests must carry an allowed `Host` header (loopback, `HOST`, or any name in
the comma-separated `ALLOWED_HOSTS`), cross-origin `Origin`/`Referer` values are
rejected with `403`, and `POST` routes require `X-Requested-With: vet-agent`.

Supported deployments:

- **Localhost** (default) — one machine, one user.
- **LAN / VPN** — set `HOST` to the machine's private address.
- **Reverse proxy** — bind to loopback, restrict access at the proxy with an IP
  allowlist or basic auth, and list the proxy's hostname in `ALLOWED_HOSTS`.

Exposing the app to the public internet with patient data (PHI) is **not
supported**.

### Prompt-injection controls

- **Sessions** — the browser gets a session id from `POST /api/session`
  (returns `{ "sessionId" }`, accepts optional `{ "sessionId" }` to resume).
  A new 128-bit random id is issued if none is provided or the id has expired.
  `/api/chat`, `/api/upload`, `/api/upload/confirm`, and `/api/actions*`
  routes reject requests with an unknown or expired session id (`403`).
  Sessions expire after 1 hour of inactivity.
- **Rate limits** — `/api/chat` and `/api/upload` are limited per client IP
  (20 and 10 requests/minute, respectively; returns `429` with `Retry-After`
  header). Chat messages are capped at 4000 characters, turns at 25 tool calls,
  uploads at 1 MB and 500 rows, and filenames at 120 characters. Behind a
  reverse proxy, all clients share the proxy's IP unless Express `trust proxy`
  is explicitly configured.
- **Structured data handling** — uploaded CSV/JSON is parsed and validated
  server-side before anything reaches the model; only ambiguous free-text is
  sent to the LLM. Tool results are wrapped in `CLINIC DATA — NOT INSTRUCTIONS`
  and uploaded text in `UPLOADED DATA — NOT INSTRUCTIONS` blocks. All stored
  text is control-character stripped and length-limited on write; records with
  instruction-like text are flagged in the UI (never blocked from storage).
- **Output filtering** — model text is scrubbed of markdown images and
  `http(s)` links before streaming, and rendered as plain text to prevent
  exfiltration via embedded URLs. Owner contact details (phone, email, address)
  are withheld from model results; they are available only through a direct UI
  action (`GET /api/patients/:id/contact`) that never passes through the agent.
- **Approval gate** — every mutation tool call (`upsert_patient`,
  `upsert_visit`) from the LLM is held server-side as a pending action. The UI
  shows a readable before/after diff and requires explicit Approve/Reject. The
  model cannot trigger approval; it is a separate, server-enforced HTTP action
  bound to a pending-action ID. Rejection or timeout (5 minutes) cancels the
  action and tells the agent why. At most 5 pending actions are kept per session
  to prevent approval fatigue.
- **System prompt and domain rules** in `brain.md` (capability descriptions,
  data schema, workflows) are a supporting layer, not a security boundary. The
  server-side controls above are what enforce safety.
- **Audit log** — each tool call (chat, intake, and MCP) is logged as one JSON
  line to stdout with session id, IP, source, tool name, and arguments (masked:
  email/phone/address hashed, note bodies omitted). Alert-level anomalies
  (bulk reads, repeated mutation proposals, rejected approvals, injection
  phrases) are flagged with `"level":"alert"`. Retention and rotation are
  operator-controlled (e.g., via process manager or log shipper).

## Docker and CI/CD

Containerized deployments use Docker and GitHub Actions. The pipeline spans four workflows:

| Event | Workflow | Jobs | Result |
|-------|----------|------|--------|
| PR to `main` | `ci.yml` | `test` (`npm test`) + `docker` (`npm run test:docker`) | Blocks merge if failing |
| Push to `main` | `cd.yml` | CI + `publish` to ghcr.io | Tags: `sha-<short>` (immutable) and `latest`; then deploys the `sha-` tag to staging (no-op until `DEPLOY_HOST` is set) |
| Push `v*` release tag | `cd.yml` | CI + `publish` to ghcr.io | Tags: `1.2.3` and `1.2` (semver); no deploy |
| Manual dispatch | `production.yml` | Deploy a chosen published tag | Requires approval in GitHub environment; gated by required reviewers |

Staging and production both run `deploy.yml`, which (if configured) SSHes to a VM, pulls the
published image, runs `docker compose -f docker-compose.deploy.yml up -d --wait`, and smoke-tests
`$APP_URL/health`. On failure, it reverts to the previous tag (saved in `.previous-tag`) when one
exists, then opens a GitHub issue titled "Deploy failed: <env> <tag>" with the run link.

**One-time GitHub setup** (Settings → Branches, Environments, Secrets, Variables):
- Create two environments: `staging` and `production`. On `production`, enable **Required reviewers**.
- Per environment, set `DEPLOY_HOST`, `DEPLOY_USER`, `APP_URL` (variables) and `DEPLOY_SSH_KEY`,
  `DEPLOY_KNOWN_HOSTS` (secrets); do **not** store `OPENROUTER_API_KEY` (it lives only on the VM's `.env`).
- On `main` branch protection, require the `test` and `docker` checks.
- CI/CD uses the built-in `GITHUB_TOKEN` for ghcr.io (no registry secret); the package must be readable by this repository (see the runbook).

**Not yet exercised on GitHub:** none of these workflows has run there. The ghcr.io push, the required-check names, and the whole SSH deploy, rollback and issue path are verified only by `actionlint` and local tests.

**Known limits:**
- Single replica: data lives in JSON files on one volume.
- Image size ≈566 MB (budget 650 MB; node:24-slim is ~261 MB, prod deps ~178 MB). Original 200 MB
  target was dropped due to dependency footprint.
- No lint step exists (code style checks are not automated yet).

For details, see [`docs/devops/`](docs/devops/): feature spec and architecture, board, and production runbook.

## Backups and recovery

Every change to `patients.json` or `visits.json` (from approved chat/intake actions,
confirmed uploads, or MCP writes) triggers a point-in-time snapshot of both files.
The running server also snapshots hourly if anything changed. Snapshots and an
append-only change log (`changes.jsonl`: id, timestamp, source, session id, record
id, before/after state) live in `agent-home/memory/backups/`, which is git-ignored.
Data files are written atomically (temp file + rename), so crashes cannot leave a
half-written file. Environment variables (see above) control:
- `BACKUP_MAX_SNAPSHOTS` (default 100): oldest snapshots pruned when this limit is reached
- `BACKUP_MAX_CHANGES` (default 5000): when the change log reaches this size, it rotates
  to `changes.1.jsonl` and a new `changes.jsonl` is started
- `BACKUP_INTERVAL_MS` (default 3600000 / 1 hour): how often the server takes a scheduled
  snapshot if anything changed

To recover, **stop the server first**, then use the admin script (not available
over HTTP). Each restore or revert saves a safety snapshot of the current state
first, so it can itself be undone:

```bash
npm run restore -- list-snapshots          # id, time, trigger, record counts
npm run restore -- list-changes            # id, time, source, session, record
npm run restore -- restore <snapshot-id>   # replace both data files from a snapshot
npm run restore -- revert <change-id>      # undo one change; refuses if the record
                                           # changed since, unless --force is added
```

## Testing

```bash
npm test                 # 80 tests: unit, integration, injection red-team, workflow and runbook checks (no Docker needed)
npm run test:docker      # 15 tests: builds the image, runs it, lints the workflows, rehearses the deploy compose file
                         # (about 1 minute; skips cleanly if no Docker daemon is available)
```

CI runs both. Unit and integration tests use a temporary data store and stub
agent session, so they do not require API keys or modify clinic data.

## About the author

Built by **Jason Baker**, a Senior Technical Product Manager and CEO/Founder
of Rekab-Compute, LLC, with 25+ years spanning software engineering, data
architecture, and product management — most recently focused on API
platforms, agentic workflows, and applied LLM systems (RAG, fine-tuning,
model harnessing, MCP). He has led API/data-platform roadmaps at MASA and
HealthyMD, spent nearly a decade as a Technical Product Manager and Senior
Business Analyst at UKG, and started his career as a Java software engineer
and database administrator at Ultimate Software (now UKG). This project is a
hands-on sample of that background applied to agent-based product
development.

Connect on [LinkedIn](https://www.linkedin.com/in/jason-baker-mba-78034996/).
