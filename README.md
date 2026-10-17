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
  the same CRUD tools, plus bulk intake, directly to external MCP clients
  like Claude Desktop (opt-in; it exposes no chat tool) — independent of the
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
```

Requires a `KIMI_API_KEY` in `.env` for the LLM behind the chat/upload agent.
To run the MCP server standalone instead (or in addition), see
[`agent-home/mcp/SKILL.md`](agent-home/mcp/SKILL.md).

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

## Testing

Run `npm test` with Node.js 24 to execute the built-in Node test suite.
The smoke tests use a temporary data store and a stub agent session, so they
do not require API keys or modify clinic data.

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
