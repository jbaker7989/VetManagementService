# Market & Competitive Landscape — VetScribe

**Category:** Strategy & Vision
**Owner:** Jason Baker (PM)
**Last updated:** 2026-10-07

> **Note on figures:** The market sizes below are **[ASSUMPTION]** order-of-magnitude
> estimates to frame the opportunity and must be validated before any funding or
> pricing decision. They are illustrative reasoning, not researched facts.

---

## Market framing

Veterinary care is a large, resilient, fragmented services market. Spend has
grown steadily with pet ownership and the "humanization of pets," and the sector
faces a structural shortage of veterinarians and technicians. That shortage is
the tailwind: anything that returns clinical staff time has a clear ROI narrative.

### Sizing (illustrative — validate)

| Layer | Definition | Illustrative basis |
|---|---|---|
| **TAM** | All veterinary practices that buy software, globally | Tens of thousands of practices × software spend/practice |
| **SAM** | US independent + small-group companion-animal clinics | The segments we can serve with the planned product |
| **SOM (3-yr)** | The share we can realistically win with our motion | A low-single-digit % of SAM |

**[OPEN QUESTION]** We need real counts (practices by size band, software spend,
tech-adoption rates) before putting defensible numbers in a deck. Source candidates: AVMA, industry reports, PIMS vendor disclosures.

## Market trends we are riding

1. **Vet/tech labor shortage** → willingness to pay for time savings.
2. **Corporate consolidation** of clinics → a future enterprise buyer, but also entrenched incumbent tooling.
3. **Cloud PIMS displacing server-based legacy** → buyers are already in a switching mindset.
4. **AI scribes proven in human healthcare** → category validation; buyers increasingly expect "ambient" documentation.
5. **Rising client-service expectations** → reminders, summaries, and responsiveness are competitive differentiators for clinics.

## Competitive landscape

| Category | Examples (illustrative) | What they do well | Where we differ |
|---|---|---|---|
| **Incumbent cloud PIMS** | Full practice-management suites | Breadth: scheduling, billing, inventory, records | Form-first data entry; AI capture is bolted on, not the core |
| **Legacy server PIMS** | Established on-prem systems | Deeply embedded, complete | Dated UX, poor NL capture, migration-averse |
| **AI vet scribes** | Ambient note-takers for the exam room | Great at the dictation→SOAP note | Stop at the note; weaker on structured billing, follow-up, and system-of-record |
| **Point tools** | Reminder/comms, telehealth, booking | Solve one slice well | Fragmented; no unified capture layer |
| **Status quo** | Staff typing into forms / paper | Zero new spend | The burden and burnout we remove |

### Our position on the map

Two axes that matter: **(x) breadth of workflow owned** and **(y) quality of
natural-language capture**. Incumbent PIMS sit high-breadth / low-capture. AI
scribes sit low-breadth / high-capture. **VetScribe's wedge is high-capture and
growing breadth** — start where scribes stop (structured billing, follow-up,
system-of-record) and expand breadth toward the PIMS over time.

## Why we can win against each

- **vs. Incumbent PIMS:** They cannot easily make capture-first their core — it
  would cannibalize their form-centric product and retrain their users. We are
  capture-native from line one (see the repo's tool layer and `brain.md`).
- **vs. AI scribes:** We don't stop at a note. Our output is a *structured,
  billable, auditable, follow-up-aware* record — the thing clinics actually run on.
- **vs. Status quo:** Clear ROI in staff minutes and recovered charges.

## Risks to the market thesis

- Incumbents ship "good enough" AI capture before we reach escape velocity.
- Buyers distrust LLM-captured records for billing/legal use (mitigated by our
  audit/append-only/attribution design — a core selling point).
- Consolidation standardizes the market on one or two enterprise PIMS, shrinking
  the independent SAM we target.

## Open questions

- **[OPEN QUESTION]** Validated TAM/SAM/SOM with real sources.
- **[OPEN QUESTION]** Which incumbent PIMS dominate our target segment, and is co-existence (integration) or displacement the right posture per segment?
- **[OPEN QUESTION]** Is there a beachhead vertical (e.g. emergency/urgent-care, mobile vets, shelters) where capture pain is acute enough to accelerate adoption?
