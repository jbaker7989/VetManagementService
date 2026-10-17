# SEC-002 Delivery Board

Stages: **New** → **Development Ready** → **In Progress** → **QA** → **Completed**

- A story moves to *Development Ready* when its acceptance criteria are confirmed testable.
- *In Progress* means implementation is underway.
- *QA* means implementation is merged to the branch and tests are being written, run, and reviewed.
- *Completed* requires the story's tests to pass in `npm test`. Each story's tests move with the story.

Story definitions and acceptance criteria: [prompt-injection-no-login-feature-and-stories.md](prompt-injection-no-login-feature-and-stories.md).

| # | Story | Priority | Phase | Stage |
|---|---|---|---|---|
| 0 | Test harness and CI workflow | P0 | 0 | Completed |
| 1 | Restrict network exposure by default | P0 | 1 | Completed |
| 2 | Origin / CSRF / DNS-rebinding protection | P0 | 1 | Completed |
| 3 | Remove blanket project trust | P0 | 1 | Completed |
| 4 | Remove MCP `vet_agent_chat` | P0 | 1 | Completed |
| 5 | Validate and delimit uploaded data | P0 | 2 | In Progress |
| 6 | Deterministic bulk intake | P0 | 2 | In Progress |
| 7 | Server-enforced approval gate | P0 | 2 | In Progress |
| 8 | Least-privilege tools per context | P0 | 2 | In Progress |
| 9 | Always-on PII redaction | P0 | 2 | In Progress |
| 10 | Stored data and tool output untrusted | P1 | 3 | New |
| 11 | Filename and upload size limits | P1 | 3 | New |
| 12 | Output filtering for exfiltration | P1 | 3 | New |
| 13 | Rate limiting and server-issued sessions | P1 | 3 | New |
| 14 | Harden the system prompt | P1 | 3 | New |
| 15 | Audit logging and anomaly alerts | P1 | 3 | New |
| 16 | Backups, versioning, rollback | P1 | 4 | New |
| 17 | Red-team and regression suite | P1 | 4 | New |

## Log

| Date | Change |
|---|---|
| 2026-10-16 | Board created; all stories New. |
| 2026-10-16 | Story 0 Completed (2 smoke tests pass). Stories 1-4 moved New → Development Ready → In Progress. |
| 2026-10-16 | Stories 1-4 moved In Progress → QA (8 tests written, 3 stable runs) → Completed. Carried forward: Story 4 criterion "MCP tools share validation, redaction and logging with HTTP" is delivered by Stories 5, 9 and 15 and must be verified there. Stories 5-9 moved New → Development Ready → In Progress. |
