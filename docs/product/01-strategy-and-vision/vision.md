# Vision — VetScribe

**Category:** Strategy & Vision
**Owner:** Jason Baker (PM)
**Last updated:** 2026-10-07
**Horizon:** 3 years

---

## Vision statement

> Every veterinary visit should be fully, accurately captured without a staff
> member ever stopping to type. VetScribe turns the natural conversation of a
> clinic — at the front desk, in the exam room, on the phone — into clean,
> structured, auditable medical records, so clinical teams spend their time on
> animals instead of data entry.

## The problem we are attacking

Veterinary practices run on documentation they hate doing. The clinical record
is the legal record, the billing source, and the continuity-of-care memory — yet
it is captured by overworked staff typing into rigid forms between appointments,
often hours later from memory. The result is predictable: missed charges,
thin histories, delayed follow-ups, and burnout. The industry has a well-known
staffing crisis; every minute spent on administrative entry is a minute not
spent on patients or clients.

Existing practice-management software (PIMS) is form-first: it assumes a human
will translate what happened into the software's schema. That translation is the
tax we want to remove.

## The change we want to create

A clinic where the **system listens to how people already work** and does the
structuring itself:

- A walk-in is described in plain language and a complete patient + visit record
  exists before the pet reaches the exam room.
- A vet dictates findings and the treatment log, medications, dosages, and
  itemized charges are captured — append-only, timestamped, attributed.
- Follow-ups schedule themselves and the owner gets a reminder without anyone
  opening a calendar.
- The data is good enough that the practice *trusts* it for billing, audits,
  and continuity of care.

## Why now

1. **Capable, cheap LLMs** make reliable natural-language-to-schema extraction
   practical — the core bet behind the Clinic Agent already working in this repo.
2. **Agent harnessing patterns have matured** — typed tools, grounding files,
   and guardrails (exactly the architecture here: a narrow validated tool layer
   with no shell/filesystem access) make it safe to put an LLM behind a clinic
   workflow.
3. **MCP is standardizing agent-to-system access**, so a clinic's data can be
   reachable by the tools staff already use (e.g. a desktop assistant) without
   bespoke integrations.
4. **Acute labor shortage** in veterinary medicine raises willingness to pay for
   anything that returns staff time.

## What we believe (first principles)

- The record should be a **byproduct of work, not a second job.**
- The agent **captures and organizes; it never practices medicine.** Diagnosis
  and dosage are the veterinarian's call. (This is already a hard rule in
  `brain.md` and is non-negotiable.)
- **Structured + auditable beats conversational-but-lossy.** Every write is
  attributed, timestamped, and append-only where it matters clinically.
- **Meet clinics where they are** — natural language, CSV bulk import, and
  standard protocols (MCP/REST), not a forced migration.

## What success looks like in 3 years

- VetScribe is the capture layer for a meaningful base of independent and
  small-group clinics.
- A median visit is documented with **near-zero manual typing** and measurably
  **higher charge-capture and record completeness** than the clinic's prior tool.
- The product is trusted enough that clinics rely on its records for billing and
  continuity of care — the bar that separates a note-taker toy from infrastructure.

## Explicitly out of scope for the vision

- Being the veterinarian: no autonomous clinical decisions, diagnoses, or dosing.
- Consumer / pet-owner telemedicine.
- Becoming a full PIMS on day one (we start as a co-pilot layer — see
  [Product Strategy](product-strategy.md)).

## Open questions

- **[OPEN QUESTION]** Is the long-term ambition to *replace* the PIMS or to be the
  capture/intelligence layer *on top of* it? The vision is written to allow either, but strategy must pick a primary path.
- **[OPEN QUESTION]** Do we ever expand into owner-facing communication beyond
  reminders (e.g. result explanations)? This has regulatory implications.
