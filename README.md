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
  - `GET /api/patients`, `GET /api/visits` — direct reads for the UI
  - `POST /api/chat` — streams an NDJSON conversation with the clinic agent
  - `POST /api/upload` — parses a CSV/JSON file and runs it through the intake
    workflow
- **Clinic agent** (`agent-home/`, `lib/agentSession.js`) — a
  [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)
  session configured with **no filesystem or shell access** — only five typed
  tools (`lib/tools.js`): `list_patients`, `find_patient`, `upsert_patient`,
  `list_visits`, `upsert_visit`. Domain rules (data schema, intake/treatment/
  follow-up workflows, "never guess a diagnosis or dosage") live in
  [`agent-home/brain/brain.md`](agent-home/brain/brain.md), the single source
  of truth the agent is grounded on.
- **Data store** (`lib/store.js`) — a small lock-serialized JSON-file store;
  `agent-home/memory/patients.json` and `visits.json` are the "database."
  Records are never deleted, only marked inactive.
- **MCP server** (`agent-home/mcp/server.js`) — a local stdio
  [Model Context Protocol](https://modelcontextprotocol.io) server exposing
  the same CRUD tools, plus bulk intake and a natural-language tool, directly
  to external MCP clients like Claude Desktop — independent of the Express
  app, backed by the same JSON store. See
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
npm start        # Express app at http://localhost:3000
```

Requires a `KIMI_API_KEY` in `.env` for the LLM behind the chat/upload agent.
To run the MCP server standalone instead (or in addition), see
[`agent-home/mcp/SKILL.md`](agent-home/mcp/SKILL.md).

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
