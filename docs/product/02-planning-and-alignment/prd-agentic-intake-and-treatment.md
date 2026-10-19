# PRD — Agentic Intake & Treatment Capture (Flagship)

**Category:** Planning & Alignment
**Owner:** Jason Baker (PM)
**Last updated:** 2026-10-07
**Status:** v1 — describes the core workflow as built, plus the gaps required to make it clinic-ready
**Related:** [Roadmap](roadmap.md) · [OKRs](okrs-and-success-metrics.md) · [Risks](../03-execution-and-launch/risks-compliance-and-mitigations.md)

---

## 1. Summary

The flagship capability of VetScribe: a clinic staff member describes a visit in
natural language — a walk-in, a scheduled check-in, an exam finding, a
medication given, a charge, a follow-up — and the system produces a complete,
structured, auditable patient and visit record. A typed tool layer and a
grounding file (`brain.md`) keep the underlying LLM constrained to safe,
validated operations. This PRD covers the capture workflow end-to-end and
specifies what must be added to run it in a real clinic.

## 2. Problem & goals

**Problem:** Documentation is a manual translation tax that staff do late and
imperfectly, causing missed charges, thin records, and burnout.

**Goals (what v1 must achieve):**
- G1. A visit can be fully captured through natural language with no form-filling.
- G2. The record is structured to the `brain.md` schema, itemized for billing,
  and append-only/attributed for audit.
- G3. The agent never fabricates clinical content (diagnosis, dosage, recommendation).
- G4. The same operations are reachable programmatically (MCP today; authenticated API next).

**Non-goals:**
- N1. The agent making any clinical decision.
- N2. Owner-facing medical guidance.
- N3. Scheduling, inventory, and lab integrations (later horizons).

## 3. Users & primary scenarios

See [Personas & JTBD](../01-strategy-and-vision/personas-and-jtbd.md). Primary:
CSR (intake), DVM (diagnosis/meds), tech (treatment log), practice manager
(billing/audit).

**Scenario A — Walk-in intake (CSR):** "A walk-in just came in — Biscuit, a
golden retriever, owner Jane Doe, limping on the back right leg." → system finds
or creates the patient, opens a `checked-in` visit with `intakeType: walk-in`,
captures `reasonForVisit`, prompts for the missing required fields and the
assigned vet.

**Scenario B — Treatment logging (DVM/tech):** "Dr. Alvarez examined Biscuit,
diagnosed a soft-tissue strain, gave 50mg carprofen PO, and wants a recheck in
10 days." → appends attributed, timestamped entries to `treatmentLog`; adds a
`medications` entry with dosage/route/instructions; sets `diagnosis`; itemizes
costs; sets `followUp`.

**Scenario C — Bulk intake (manager/IT):** upload a CSV/JSON of existing
patients → each row upserted to the schema.

## 4. Functional requirements

### 4.1 Intake
- FR-1 Classify `intakeType` as `scheduled` or `walk-in`.
- FR-2 Look up existing patient by name (+ owner to disambiguate) before creating a new one.
- FR-3 On create, require schema fields; **ask for any missing required field — never invent a placeholder.**
- FR-4 Open a visit with `checkedInAt = now`, `status = checked-in`, captured `reasonForVisit`.
- FR-5 Capture/prompt for `assignedVeterinarian` before treatment begins.

### 4.2 Diagnosis & treatment
- FR-6 Record `diagnosis` only when the vet states it (never inferred).
- FR-7 `treatmentLog` is **append-only**; each entry timestamped and attributed (`performedBy`). Never overwrite prior entries.
- FR-8 Advance `status` through `in-treatment` → `awaiting-followup` / `closed`.

### 4.3 Medication
- FR-9 One `medications` entry per drug with dosage, frequency, route, owner-facing instructions.
- FR-10 Set `administeredAt` if given at clinic; if sent home, leave null but still require `instructions`.
- FR-11 The agent must **never originate or alter a dosage** — it records what the vet specifies.

### 4.4 Costs
- FR-12 One `costs` entry per billable item (no lumping).
- FR-13 Recompute `totalCost` as the sum of `costs[]` whenever the list changes.

### 4.5 Follow-up
- FR-14 Set `followUp.scheduled/date/reason` when the vet requests a recheck.
- FR-15 Offer the `send-email` reminder/confirmation to the owner.
- FR-16 A follow-up that occurs becomes a **new** visit record (not a mutation), optionally referencing the prior visit id.

### 4.6 Data integrity & access
- FR-17 Every write updates `updatedAt`; IDs are stable and never reused.
- FR-18 **No hard deletes.** Death is a state change: `isActive = false` sets `deathDate = now`; reviving clears it.
- FR-19 Same operations available via MCP tools; (NEXT) via authenticated REST API.

## 5. Non-functional requirements (the clinic-ready gap)

> These are **required to productize** and are not fully present in the MVP.

- NFR-1 **Multi-tenancy & auth:** clinic isolation; authenticated users mapped to real `performedBy` attribution (today attribution is a free-text string).
- NFR-2 **Durable, concurrent datastore:** replace the lock-serialized flat JSON store with a real database supporting concurrent clinic use.
- NFR-3 **Safety/guardrail enforcement is measurable:** a clinical eval suite gates releases (see §7).
- NFR-4 **Auditability surfaced:** staff-visible history of who changed what, when.
- NFR-5 **Resilience:** input validation, rate limiting, and observability on the public chat/upload endpoints.
- NFR-6 **Latency:** intake interaction feels real-time at the counter **[ASSUMPTION: target p95 < a few seconds per turn — confirm].**
- NFR-7 **PII handling:** owner contact data encrypted at rest/in transit; retention policy defined.

## 6. UX notes

- Conversational capture must **confirm structured results back** to the user
  (show the record it created/updated), so staff trust and can correct it.
- Missing-field prompts should be minimal and batched, not an interrogation.
- Bulk upload must report per-row success/failure clearly.

## 7. Safety & clinical guardrails (gating)

- **Hard rule:** the agent captures and organizes; it never diagnoses, doses, or
  recommends. Enforced in `brain.md` and verified by eval.
- **Eval suite (new):** golden-set transcripts measuring (a) extraction accuracy
  to schema, (b) correct refusal to fabricate clinical content, (c) correct
  missing-field prompting. A regression here **blocks release**.
- **Human-in-the-loop:** clinical fields (`diagnosis`, dosage) originate from a
  human; the agent only records them.

## 8. Acceptance criteria (v1 clinic-ready)

- [ ] AC-1 A full walk-in → treatment → billing → follow-up visit can be captured end-to-end via NL and matches the `brain.md` schema.
- [ ] AC-2 The agent refuses to produce a diagnosis or dosage not supplied by a human, in 100% of eval cases.
- [ ] AC-3 `totalCost` always equals the sum of `costs[]`.
- [ ] AC-4 Treatment log is append-only and attributed; no path overwrites prior entries.
- [ ] AC-5 No record can be hard-deleted; death transitions set `deathDate`.
- [ ] AC-6 Two clinics' data are fully isolated; every write is attributed to an authenticated user.
- [ ] AC-7 Bulk upload reports per-row outcomes and never partially corrupts a record.

## 9. Success metrics

Tie to [OKRs](okrs-and-success-metrics.md): median capture time per visit,
charge-capture lift, record-completeness score, clinical-safety eval pass rate,
staff adoption/satisfaction.

## 10. Open questions

- **[OPEN QUESTION]** Latency and uptime targets for counter-side use.
- **[OPEN QUESTION]** How is `performedBy` authenticated in a conversational flow (badge login? per-user session?).
- **[OPEN QUESTION]** Data retention & export obligations for veterinary records (varies by jurisdiction).
- **[OPEN QUESTION]** Which model/provider is the production default, and what is the fallback? (MVP uses an OpenRouter model; MCP's `vet_agent_chat` expects an Anthropic key — consolidate.)
