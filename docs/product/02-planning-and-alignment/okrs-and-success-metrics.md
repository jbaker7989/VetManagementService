# OKRs & Success Metrics — VetScribe

**Category:** Planning & Alignment
**Owner:** Jason Baker (PM)
**Last updated:** 2026-10-07
**Period:** Illustrative first two quarters of productization. Targets are **[ASSUMPTION]** until we have design-partner baselines.

---

## North Star Metric

> **Visits fully captured with near-zero manual typing, per week.**

It couples the two things that matter: *adoption* (clinics are actually using it
for real visits) and *the core promise* (capture without the typing tax). A
"fully captured" visit means patient + visit + treatment log + itemized costs +
follow-up are complete to the `brain.md` schema.

## Metric tree

```
North Star: Fully-captured visits / week
├── Adoption      = active clinics × active users × visits/user
├── Capture quality = record-completeness % × charge-capture lift
├── Efficiency    = median minutes saved per visit (vs. baseline)
└── Trust/safety  = clinical-safety eval pass rate × data incidents (→0)
```

## OKRs

### Objective 1 — Prove the core promise with design partners
*The product measurably removes the documentation tax.*

- **KR1.1** Median documentation time per visit **↓ 50%** vs. each clinic's pre-VetScribe baseline.
- **KR1.2** Record-completeness score **≥ 90%** of required `brain.md` fields populated on closed visits.
- **KR1.3** **≥ 70%** of visits at active clinics captured primarily through natural language (not manual form edits).

### Objective 2 — Earn clinical and data trust
*Clinics trust the record enough to bill and audit from it.*

- **KR2.1** Clinical-safety eval pass rate **= 100%** (zero fabricated diagnoses/dosages) on the golden set, every release.
- **KR2.2** **Zero** data-isolation or data-loss incidents.
- **KR2.3** Charge-capture lift **≥ 5%** in recovered billable items vs. baseline **[ASSUMPTION — validate]**.

### Objective 3 — Build a repeatable path to value
*We can onboard a new clinic predictably.*

- **KR3.1** Time-to-first-captured-visit for a new clinic **≤ 1 day** from kickoff.
- **KR3.2** **≥ 80%** of onboarded clinics reach "active" (defined below) within 2 weeks.
- **KR3.3** Design-partner NPS / satisfaction **≥ target** with **≥ X** reference-willing clinics **[ASSUMPTION]**.

## Metric definitions (so we measure the same thing)

| Metric | Definition | Source |
|---|---|---|
| Active clinic | ≥ N captured visits in the trailing 7 days | Usage telemetry |
| Active user | ≥ 1 captured visit in trailing 7 days | Usage telemetry |
| Documentation time/visit | Time from visit open to `closed`, staff-attributed effort **[method TBD]** | Instrumentation + partner study |
| Record-completeness | % of required schema fields non-null on closed visits | Data audit job |
| Charge-capture lift | Δ in billable line items/visit vs. baseline period | Billing export comparison |
| Clinical-safety pass rate | % of eval cases with correct refusal to fabricate clinical content | Eval suite (PRD §7) |

## Guardrail metrics (don't win OKRs by breaking these)

- Clinical-safety eval pass rate must never drop below 100% — a hard release gate.
- p95 capture-turn latency within target (see PRD NFR-6).
- No increase in correction rate (staff editing/overriding agent output) beyond threshold.

## Anti-metrics / vanity we will NOT optimize

- Raw chat message volume (activity ≠ value).
- Number of features shipped.
- Signups without captured visits.

## Measurement plan & cadence

- **Instrument first:** nothing in O1/O2 is credible without baseline capture of
  per-clinic documentation time *before* go-live.
- **Weekly:** North Star + adoption review (PM).
- **Per release:** safety eval gate (PM + Eng).
- **Monthly:** OKR check-in with stakeholders (see [RACI](stakeholders-and-raci.md)).

## Open questions

- **[OPEN QUESTION]** How do we measure "documentation time saved" rigorously — timed study, self-report, or inferred from timestamps?
- **[OPEN QUESTION]** What is each design partner's pre-VetScribe baseline? (No baseline → no provable ROI.)
- **[OPEN QUESTION]** Target absolute numbers (clinics, visits/week) depend on team/funding — set once resourcing is known.
