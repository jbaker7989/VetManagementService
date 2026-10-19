# Personas & Jobs-to-be-Done — VetScribe

**Category:** Strategy & Vision
**Owner:** Jason Baker (PM)
**Last updated:** 2026-10-07

> Personas below are **[ASSUMPTION]**-based archetypes drawn from the workflows in
> `brain.md`. They must be pressure-tested with real discovery interviews before
> they drive roadmap trade-offs.

---

## Primary personas

### 1. Priya — Front-desk / Client-service representative (CSR)
- **Context:** First contact. Handles scheduled check-ins and walk-ins, phones
  ringing, owners at the counter. Under time pressure.
- **Goals:** Get the pet checked in and the owner's complaint captured fast and
  correctly; not keep a lobby waiting.
- **Pains:** Re-keying returning-client info; mistyped owner contact details;
  walk-ins arriving mid-rush with no record.
- **JTBD:** *"When a pet arrives, help me create or find its record and open a
  visit in seconds, so I can get back to the person in front of me."*
- **Maps to repo:** the Intake workflow + `find_patient`/`upsert_patient`/`upsert_visit`.

### 2. Dr. Alvarez — Veterinarian (DVM)
- **Context:** Examines the pet, decides diagnosis, treatment, meds, follow-up.
  Documents between (or long after) appointments.
- **Goals:** A complete, accurate record with minimal typing; confidence nothing
  clinical is fabricated.
- **Pains:** Charting fatigue; recall errors from late documentation; software
  that slows the exam.
- **JTBD:** *"When I finish an exam, let me say what I found and did and have it
  logged accurately and attributed to me — without the software ever putting
  words (or a dosage) in my mouth."*
- **Maps to repo:** Diagnosis & treatment logging, Medication workflow, and the
  hard "never guess a diagnosis/dosage" ground rule.

### 3. Marcus — Practice owner / Practice manager (the buyer)
- **Context:** Runs the business. Owns the budget. Accountable for revenue,
  staffing, compliance.
- **Goals:** Capture all billable items; reduce staff overtime/burnout; clean,
  auditable records; happy clients who return.
- **Pains:** Missed charges (revenue leakage); staff turnover; audit exposure
  from incomplete records; expensive, hard-to-switch software.
- **JTBD:** *"When I invest in tooling, show me recovered revenue and staff hours
  saved I can measure, without a painful migration or compliance risk."*
- **Maps to repo:** itemized `costs` + recomputed `totalCost`, append-only audit
  trail, bulk CSV/JSON import.

## Secondary personas

### 4. Taylor — Veterinary technician / nurse
- Administers meds, runs tests, records observations into the treatment log.
- **JTBD:** *"Let me log what I did to the pet, attributed to me, without leaving
  the floor."*

### 5. Sam — IT / integrator (for multi-site or tech-forward clinics)
- Connects VetScribe to other tools; cares about data access and security.
- **JTBD:** *"Give me programmatic, authenticated access to our clinic data and a
  clean way to import/export."*
- **Maps to repo:** the MCP server + planned REST API / migration tooling.

### 6. Dana — Pet owner / client (indirect user, not the buyer)
- Receives reminders, follow-up confirmations, visit summaries.
- **JTBD:** *"Tell me clearly what happens next for my pet and remind me so I
  don't miss the follow-up."*
- **Maps to repo:** the `send-email` skill + follow-up scheduling.

## JTBD summary (forces of progress)

| Job | Push (pain of today) | Pull (promise of VetScribe) | Anxiety we must defuse |
|---|---|---|---|
| Capture a visit | Slow, error-prone typing | Speak/type naturally → structured record | "Will it get the medical details wrong?" |
| Bill accurately | Missed charges | Itemized, auto-totaled costs | "Can I trust it enough to bill from?" |
| Stay compliant | Thin, late records | Append-only, attributed, timestamped | "Is my data safe and auditable?" |
| Retain clients | Missed follow-ups | Auto follow-up + reminders | "Will it feel impersonal to clients?" |

## How personas shape priorities

- **Priya & Dr. Alvarez are the daily users** → capture speed and clinical trust
  are the bar for everything. If they resist, nothing else matters.
- **Marcus is the buyer** → every feature needs an ROI story in minutes-saved or
  charges-recovered (see [OKRs](../02-planning-and-alignment/okrs-and-success-metrics.md)).
- **Sam & Dana unlock expansion** (integrations, client experience) but are not
  the wedge.

## Open questions

- **[OPEN QUESTION]** Run 8–12 discovery interviews per primary persona to replace these assumptions with evidence.
- **[OPEN QUESTION]** For multi-doctor clinics, how is "performedBy"/attribution authenticated when capture is conversational? (Links to auth work in the roadmap.)
- **[OPEN QUESTION]** Which persona's pain is acute enough to be the single demo that sells the pilot?
