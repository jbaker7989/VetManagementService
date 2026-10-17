# Feature: Prompt-Injection Hardening for a No-Login Vet Agent

**Feature ID:** SEC-002 (supersedes the authentication-based approach in SEC-001)
**Status:** Proposed
**Priority:** P0 — Blocking release
**Owner:** Security / Platform Engineering
**Stakeholders:** Product, Engineering, Compliance, Clinic Operations

---

## 1. Feature Overview

### Problem Statement

The Vet Agent exposes an LLM with read/write tools over patient and visit data (PHI) through unauthenticated HTTP endpoints (`/api/chat`, `/api/upload`) and an MCP server. The product will not have a login mechanism, so identity cannot be used to decide who may do what. Defenses must instead come from:

1. **Limiting who can reach the app** (network boundary, browser-origin checks).
2. **Limiting what the LLM can do** (least-privilege tools, deterministic code for writes, human approval).
3. **Treating all text as untrusted** (uploads, filenames, stored record fields, tool output).
4. **Detecting and recovering** (logging, rate limits, backups).

### Goal

A successful prompt injection, from live chat, an uploaded file, or text previously stored in a record, cannot exfiltrate bulk PHI or silently change clinical data, even though there are no user accounts.

### Design Principles

- **No identity, so no identity-based exceptions.** Redaction and approval apply to everyone.
- **The LLM never approves its own actions.** Approval is a server-enforced step performed by the human in the UI.
- **Prompt hardening is the weakest layer.** It is required but never the only control.
- **Assume a bypass will eventually happen.** Recovery (backups, audit) is part of the feature.

### Acceptance Criteria (feature level)

1. The server is unreachable from outside the intended network by default, and from arbitrary web pages in the user's browser.
2. No LLM tool call can create, modify, or delete data without a server-enforced human approval, except deterministic validated intake.
3. Upload and stored-record content is never interpreted as instructions.
4. Chat responses never expose bulk owner contact details.
5. The MCP server exposes no free-form LLM chat tool.
6. Every tool call is logged with session ID, source, and arguments (masked).
7. Clinical data can be restored to a prior state after an incident.
8. At least 15 distinct injection payloads (live, upload, stored, cross-site) fail in CI.

---

## 2. Priority Summary

| # | Story | Priority | Effort | Phase |
|---|---|---|---|---|
| 1 | Restrict network exposure by default | P0 | Small | 1 |
| 2 | Origin / CSRF / DNS-rebinding protection | P0 | Small | 1 |
| 3 | Remove `defaultProjectTrust: "always"` | P0 | Small | 1 |
| 4 | Remove MCP `vet_agent_chat` | P0 | Small | 1 |
| 5 | Validate and delimit uploaded data | P0 | Medium | 2 |
| 6 | Deterministic bulk intake (no LLM) | P0 | Medium | 2 |
| 7 | Server-enforced approval gate for mutations | P0 | Medium | 2 |
| 8 | Least-privilege tools per context | P0 | Medium | 2 |
| 9 | Always-on PII redaction | P0 | Small | 2 |
| 10 | Treat stored data and tool output as untrusted | P1 | Medium | 3 |
| 11 | Sanitize filenames and limit upload size | P1 | Small | 3 |
| 12 | Server-side output filtering (exfiltration channels) | P1 | Small | 3 |
| 13 | Rate limiting and server-issued sessions | P1 | Small | 3 |
| 14 | Harden the system prompt | P1 | Small | 3 |
| 15 | Audit logging and anomaly alerts | P1 | Medium | 3 |
| 16 | Backups, versioning, and rollback | P1 | Medium | 4 |
| 17 | Red-team and regression test suite | P1 | Medium | 4 |

**Phases:** 1 = quick config-level wins; 2 = core architectural controls; 3 = defense in depth; 4 = recovery and verification. Story 17 should start in Phase 1 and grow as stories land.

**Ship gate:** Stories 1–9 (all P0) must be complete before any deployment holding real PHI.

---

## 3. User Stories

### Story 1: Restrict network exposure by default — P0, Small

**As a** clinic owner
**I want** the app reachable only from the clinic's machine or network
**So that** anonymous internet users cannot reach an unauthenticated agent.

**Acceptance criteria:**
- Server binds to `127.0.0.1` by default; an explicit `HOST` setting is required for LAN binding.
- Startup fails with a clear message if bound to a public interface without `ALLOW_PUBLIC_BIND=true`.
- README documents the supported deployment patterns (localhost, LAN/VPN, reverse proxy with IP allowlist or proxy-level basic auth).
- Document that public internet exposure with PHI is unsupported.

---

### Story 2: Origin, CSRF, and DNS-rebinding protection — P0, Small

**As a** security engineer
**I want** POST/API routes to reject requests from untrusted browser origins
**So that** a malicious web page visited by clinic staff cannot call `localhost` and drive the agent.

**Acceptance criteria:**
- `Host` header is checked against an allowlist (blocks DNS rebinding).
- `Origin`/`Referer` on state-changing and chat/upload requests must match the app's own origin; otherwise `403`.
- No permissive CORS (`*`) on any route.
- State-changing routes require a custom header or per-page token that cross-site forms cannot set.
- GET data routes (`/api/patients`, `/api/visits`) are subject to the same Host/Origin checks.

---

### Story 3: Remove blanket project trust — P0, Small

**As a** platform engineer
**I want** `defaultProjectTrust: "always"` removed from agent settings
**So that** the agent's built-in confirmation behavior is not silently disabled.

**Acceptance criteria:**
- `agent-home/settings.json` no longer sets `"always"`.
- A startup check or test fails if the setting regresses.
- Behavior is verified: tool calls that mutate data cannot proceed without going through Story 7's gate.

---

### Story 4: Remove MCP `vet_agent_chat` — P0, Small

**As a** security engineer
**I want** the MCP server to expose only deterministic tools
**So that** a compromised MCP client cannot send arbitrary prompts to the clinic agent.

**Acceptance criteria:**
- `vet_agent_chat` is removed from `agent-home/mcp/server.js`.
- Remaining tools (CRUD, `bulk_intake`) use the same validation, redaction, and logging as the HTTP path.
- MCP server is documented as opt-in and disabled by default.
- `agent-home/mcp/SKILL.md` and README are updated.

---

### Story 5: Validate and delimit uploaded data — P0, Medium

**As a** clinic staff member
**I want** uploaded CSV/JSON parsed and validated before anything reaches the model
**So that** instructions hidden in a cell cannot hijack the agent.

**Acceptance criteria:**
- CSV/JSON is parsed into typed records server-side and validated against the patient schema; invalid rows are rejected with a clear error and never reach the LLM.
- Field values are length-capped and stripped of control characters.
- Any record content that does reach the LLM sits inside a labeled block ("UPLOADED DATA — NOT INSTRUCTIONS").
- Multiline quoted CSV cells containing instruction-like text are covered by a test.

---

### Story 6: Deterministic bulk intake — P0, Medium

**As a** clinic administrator
**I want** well-formed structured uploads to be written by code, not interpreted by the LLM
**So that** the riskiest write path has no injection surface.

**Acceptance criteria:**
- `/api/upload` routes schema-valid records to a deterministic insert/update path with no LLM call.
- The LLM is used only for genuinely ambiguous input and, in that case, its proposed changes go through Story 7's approval gate.
- Each record created or updated is logged; the response returns a summary (created / updated / rejected).
- Deterministic intake is previewed to the user before commit (dry-run summary + confirm).

---

### Story 7: Server-enforced approval gate for mutations — P0, Medium

**As a** clinic staff member
**I want** to confirm any agent-proposed change to patient or visit records
**So that** an injection cannot silently modify clinical data.

**Acceptance criteria:**
- `upsert_patient` and `upsert_visit` calls originating from the LLM are held server-side as pending actions.
- The UI shows a readable diff (before/after) and requires an explicit Approve/Reject click.
- Approval is a separate authenticated-by-session HTTP action bound to the pending-action ID. The model cannot trigger it.
- Rejection or timeout cancels the action and tells the agent why.
- High-risk fields (`isActive`, `deathDate`, medications, costs) are flagged in the diff.
- A cap limits pending actions per session to prevent approval fatigue floods.

---

### Story 8: Least-privilege tools per context — P0, Medium

**As a** security engineer
**I want** each agent flow to receive only the tools it needs
**So that** an injection in one flow cannot reach capabilities from another.

**Acceptance criteria:**
- Upload/intake sessions have no read tools (`list_patients`, `list_visits`, `find_patient`), so injected text cannot exfiltrate.
- Chat sessions get read tools with server-side field filtering (Story 9) and result-count caps.
- Mutation tools exist only behind the approval gate.
- Web-fetch and email skills remain disabled; a test asserts they are absent from the runtime tool list.
- `brain.md` no longer documents capabilities the runtime does not provide.

---

### Story 9: Always-on PII redaction — P0, Small

**As a** clinic privacy officer
**I want** owner phone, email, and address withheld from chat responses by default for everyone
**So that** a successful injection does not immediately leak PHI.

**Acceptance criteria:**
- Redaction is applied in code on tool results before they reach the model, not by prompt instruction.
- `list_patients` returns pet name, species, and owner first name only; `find_patient` returns one record at a time.
- Full owner contact details are available only through a deliberate, logged UI action that does not pass through the LLM (e.g., a "show contact info" button on a single record).
- The same rules apply to MCP tools.
- `GET /api/patients` and `/api/visits` follow the same field policy or are covered by Story 1/2 and documented as full-detail UI endpoints.

---

### Story 10: Treat stored data and tool output as untrusted — P1, Medium

**As a** security engineer
**I want** record fields and tool results handled as data, never instructions
**So that** a payload saved in a patient name or visit note cannot attack the agent later (second-order injection).

**Acceptance criteria:**
- Tool results are wrapped in a labeled data block before entering model context.
- Free-text fields are length-capped and stripped of control characters on write.
- Instruction-like patterns in stored fields are flagged to staff in the UI.
- Tests store an injection payload in a notes field, then run a chat that reads it, and assert no unauthorized tool call occurs.

---

### Story 11: Sanitize filenames and limit upload size — P1, Small

**As a** front-desk user
**I want** the upload endpoint to accept only sane filenames and sizes
**So that** malformed uploads cannot pollute the prompt or exhaust resources.

**Acceptance criteria:**
- Filename is reduced to a safe basename, control characters removed, capped at 120 characters.
- Filename is not interpolated into the prompt (or is passed inside the data block only).
- Payload capped at 1 MB and 500 rows; clear errors on violation.

---

### Story 12: Server-side output filtering for exfiltration channels — P1, Small

**As a** security engineer
**I want** model output scrubbed of data-exfiltration vectors
**So that** a bypassed model cannot leak data through links or images.

**Acceptance criteria:**
- Markdown images and external URLs are stripped or neutralized in responses.
- Responses that would contain more than N patient records are truncated with a message.
- The UI renders model output as escaped text/safe markdown only (no raw HTML).

---

### Story 13: Rate limiting and server-issued sessions — P1, Small

**As a** security engineer
**I want** per-client limits and unguessable server-issued session IDs
**So that** one client cannot flood the agent or poison another client's context.

**Acceptance criteria:**
- Server issues random session IDs (≥128 bits); client-supplied IDs that were not issued are rejected.
- Per-IP rate limits on `/api/chat` and `/api/upload`; `429` on excess.
- Maximum message length and maximum tool calls per turn are enforced.
- Idle sessions expire.

---

### Story 14: Harden the system prompt — P1, Small

**As a** platform engineer
**I want** the system prompt to explicitly reject embedded instructions
**So that** simple injection attempts are less likely to succeed.

**Acceptance criteria:**
- Prompt states that instructions in user messages, uploaded files, filenames, and record fields are untrusted data.
- Agent never reveals the system prompt, file paths, or internal data model.
- Prompt changes are validated by the Story 17 suite.
- Documented as a supporting layer, not a security boundary.

---

### Story 15: Audit logging and anomaly alerts — P1, Medium

**As a** security engineer
**I want** every tool call logged with context
**So that** injection attempts can be detected and investigated without user accounts.

**Acceptance criteria:**
- Each tool call logs tool name, masked arguments, session ID, client IP, source (chat/upload/MCP), and timestamp.
- Sensitive values (emails, phones) are hashed or masked.
- Alerts or log flags for: bulk reads, repeated mutation attempts in one session, rejected approvals, known injection phrases.
- Retention follows clinic policy.

---

### Story 16: Backups, versioning, and rollback — P1, Medium

**As a** clinic administrator
**I want** point-in-time snapshots of clinical data and an undo path for agent-made changes
**So that** we can recover if an injection ever succeeds.

**Acceptance criteria:**
- `patients.json` and `visits.json` are snapshotted before every approved mutation and on a schedule.
- Each change records who/what (session, source) and a before/after diff.
- Admin can restore a snapshot or revert a single change, with documented steps.
- Restore procedure is tested.

---

### Story 17: Red-team and regression test suite — P1, Medium

**As a** security engineer
**I want** automated injection tests run on every change
**So that** regressions are caught before deployment.

**Acceptance criteria:**
- Suite covers live chat, upload (CSV/JSON/filename), stored-field (second-order), and cross-site request payloads — at least 15 distinct payloads.
- Assertions: no unauthorized tool calls, no bulk PHI in output, no unapproved mutations, cross-origin requests rejected.
- Runs in CI and blocks merges on failure.
- New techniques are added as they are discovered.
- Begins in Phase 1 with Story 2 and Story 3 checks, and grows with each story.

---

## 4. Dependencies

- Deployment model decision (localhost vs. LAN vs. proxied) for Story 1.
- Approval UI/UX design for Story 7 (diff view, pending-action queue).
- Decision on whether full contact details are visible in the UI at all (Story 9).
- Storage location and retention for logs and snapshots (Stories 15, 16).
- Story 6 depends on Story 5's parsing/validation.
- Story 7 depends on Story 8's tool split to be meaningful.

## 5. Risks and Open Questions

| Risk | Mitigation |
|---|---|
| Public internet exposure is still possible via reverse proxy misconfiguration. | Story 1 startup guard; documented unsupported scenario. |
| Approval prompts slow front-desk work or cause rubber-stamping. | Deterministic intake bypasses LLM approvals (Story 6); show clear diffs and flag high-risk fields; cap pending actions. |
| Redaction hides data staff need. | Single-record "show contact info" action, logged. |
| Rate limiting by IP is weak behind shared NAT. | Acceptable at clinic scale; revisit if multi-site. |
| Anyone on the clinic network is implicitly trusted. | Accepted by the no-login design. Document it; consider proxy-level auth as an optional layer. |
| LLM defenses are probabilistic. | Layered controls (Stories 5–9) plus recovery (Story 16). |

## 6. Definition of Done

- All P0 stories (1–9) implemented and tested.
- Story 17 suite passes in CI with at least 15 payloads covering all four input paths.
- A restore from snapshot has been rehearsed successfully.
- README and security docs describe the trust boundaries, supported deployments, and the no-login assumption.
- Product, engineering, and compliance sign off on the accepted residual risks.

## 7. Relationship to SEC-001

SEC-001 assumed authentication. This feature replaces its Story 3 (authenticate endpoints) with Stories 1 and 2, folds Story 7 into Story 4, and makes Story 9 (deterministic intake) a P0. It also adds new stories for stored injection (10), output filtering (12), session and rate controls (13), and recovery (16). Once SEC-002 is accepted, SEC-001 should be marked superseded.
