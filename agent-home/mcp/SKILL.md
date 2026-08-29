---
name: vet-mcp
description: Local MCP (Model Context Protocol) server exposing the clinic's patient/visit records and intake workflow to external MCP clients (e.g. Claude Desktop). Use when a request needs the clinic's data reachable outside the Express chat UI, or when configuring an MCP client to talk to this clinic's data directly.
---

# Vet Clinic MCP Server

`server.js` in this folder is a local stdio MCP server that exposes the clinic's
patient and visit data directly to any MCP-speaking client. It reads/writes the
same JSON files as the Express front end (`../memory/patients.json` /
`visits.json`) via the same `../../lib/store.js`, so both stay in sync — there
is no separate database and no HTTP hop.

## What this is

- A **local stdio** MCP server: an MCP client launches it as a subprocess and
  talks to it over stdin/stdout. It is not a network service and has no
  authentication — do not wrap it in an HTTP/SSE transport without adding auth
  first, since its write tools have no access control of their own.
- Independent of `server.js` (the Express app) and `npm start` — it can run
  with or without the web UI running, since both go through the same
  `lib/store.js`.

## Tools exposed

| Tool | Purpose |
|---|---|
| `list_patients` | List all patient (pet) records, including owner info. |
| `find_patient` | Look up one patient by `id`, or by `name` (+ optional `ownerName` to disambiguate). |
| `upsert_patient` | Create (omit `id`) or update (pass `id`) a patient record. |
| `list_visits` | List all visits, optionally filtered by `patientId`. |
| `upsert_visit` | Create (omit `id`) or update (pass `id`) a visit. `treatmentLog`/`medications` entries are appended; `costs` replaces the list and `totalCost` is recomputed. |
| `bulk_intake` | Create/update many patients at once from raw CSV or JSON text. Rows are written as-is via `upsert_patient` — no interpretation, so field names must already match the schema below. |
| `vet_agent_chat` | Hand a natural-language instruction to the clinic's pi-coding-agent (the same one behind `/api/chat`), which calls the CRUD tools above on your behalf. Use for loosely-specified requests instead of calling tools directly. Requires `KIMI_API_KEY`. |

The `upsert_patient` and `upsert_visit` field names, enums, and the append/replace
semantics for visit sub-lists come straight from the schemas and workflows in
[`../brain/brain.md`](../brain/brain.md) — read that file rather than duplicating
the schema here.

## Requirements

- Node 24 (see `package.json`'s `engines`).
- `npm install` in the repo root (adds `@modelcontextprotocol/sdk` and `zod`).
- `KIMI_API_KEY` set in `.env` at the repo root — only needed for `vet_agent_chat`;
  the five CRUD tools and `bulk_intake` work without it.

## Running it

Start it directly to confirm it launches:

```bash
node agent-home/mcp/server.js
```

It will sit waiting on stdin — that's expected for a stdio server. Exit with Ctrl+C.

To inspect/exercise it interactively:

```bash
npx @modelcontextprotocol/inspector node agent-home/mcp/server.js
```

### Claude Desktop config

Add an entry to `claude_desktop_config.json`'s `mcpServers`:

```json
{
  "mcpServers": {
    "vet-clinic": {
      "command": "node",
      "args": ["agent-home/mcp/server.js"],
      "cwd": "/Users/jbaker/Development/VetManagementSystem/vet-agent-build"
    }
  }
}
```

## Safety notes

- No auth: this server is meant to run locally, launched by a trusted MCP
  client. Anyone who can start it has full read/write access to clinic data.
- `upsert_patient` / `upsert_visit` / `bulk_intake` apply exactly what's passed
  — no ground-rule checking (e.g. "never guess a diagnosis"). That judgement is
  the caller's responsibility for these tools.
- `vet_agent_chat` runs through the same pi-coding-agent as the Express app, so
  it follows `brain.md`'s ground rules: it won't invent a diagnosis, dosage, or
  required field, and never deletes records (pets are marked `isActive: false`
  instead).
- IDs are stable and never reused, even for inactive/deceased patients — see
  `brain.md`.
