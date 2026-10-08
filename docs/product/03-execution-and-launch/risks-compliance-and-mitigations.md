# Risks, Compliance & Mitigations — VetScribe

**Category:** Execution & Launch
**Owner:** Jason Baker (PM)
**Last updated:** 2026-10-07

---

## 1. Risk posture

VetScribe puts an LLM in the path of clinical and billing records. The product's
core design decisions are themselves risk mitigations — a narrow typed tool layer
with **no filesystem/shell access**, append-only attributed records, no hard
deletes, and a hard "never diagnose or dose" rule. This register tracks what
remains and what productization adds.

Scoring: **Likelihood (L)** and **Impact (I)** on Low/Med/High. Priority =
L × I, with any High-impact clinical/data risk treated as top priority
regardless of likelihood.

## 2. Risk register

| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | **Agent fabricates a diagnosis/dosage** (patient safety + liability) | Med | High | `brain.md` hard rule; clinical-safety eval as a **blocking release gate**; prod safety monitor; human originates all clinical fields | Clinical SME |
| R2 | **Clinics distrust AI-captured records for billing/legal** (adoption blocker) | High | High | Trust-by-confirmation UX; append-only/attributed audit trail; data export; reference clinics; ROI proof | PM / GTM |
| R3 | **Data breach / PII exposure** (owner contact data) | Med | High | Encryption in transit/at rest; auth + tenancy isolation; security review gate; least-privilege | Security |
| R4 | **Cross-tenant data leakage** | Med | High | Tenant isolation verified in tests (AC-6); canary rollout; monitoring | Eng |
| R5 | **Data loss / corruption** | Med | High | No hard deletes (built in); backups + point-in-time restore; data-integrity monitors (`totalCost`, schema) | Eng |
| R6 | **Public chat/upload endpoint abused** (it's internet-reachable, LLM-backed → cost + injection) | Med | Med | Auth, rate limits, input validation, payload caps, prompt-injection hardening of the tool layer | Eng |
| R7 | **Model/provider dependency** (behavior drift, outage, price change, deprecation) | Med | Med | Provider abstraction (pi); eval-gated model swaps; fallback provider; cost monitoring | Eng / PM |
| R8 | **LLM cost scales badly with volume** | Med | Med | Usage ceilings in pricing; model right-sizing; cache/short-circuit deterministic paths | PM / Eng |
| R9 | **Incumbent PIMS ships "good enough" capture first** | Med | High | Speed to design-partner proof; depth beyond note-taking (billing/follow-up/system-of-record) | PM |
| R10 | **Scaling off the flat-JSON MVP store** causes concurrency failures | High (if unaddressed) | High | Durable DB as a NOW roadmap gate before any multi-user clinic | Eng |
| R11 | **Regulatory/records-retention non-compliance** (varies by jurisdiction) | Med | Med→High | Legal review; retention + export policy; configurable retention | Legal |
| R12 | **Key-person dependency** (early, concentrated ownership) | High | Med | Document decisions (this folder + ADR log); cross-train; name backups per RACI | Sponsor |
| R13 | **Scope creep toward "autonomous vet"** (erodes trust, raises liability) | Med | High | Vision/strategy non-goals; Clinical SME gate; keep agent capture-only | PM / Clinical SME |

## 3. Compliance considerations

> **[ASSUMPTION / NOT LEGAL ADVICE]** — the items below are for planning; confirm
> each with qualified counsel before launch.

- **Veterinary medical records** are regulated at the **US state** level
  (retention periods, ownership, release rules). Must confirm per launch state.
- **PII:** owner names, phone, email, address are personal data — baseline
  security (encryption, access control, breach response) required regardless of
  sector-specific rules.
- **HIPAA:** generally does **not** apply to animal patients, but **do not assume** —
  confirm, especially if any human data is incidentally captured.
- **Payments/billing:** if VetScribe ever processes payments (later horizon),
  PCI scope applies — a reason to partner rather than build billing.
- **AI/consumer-protection:** be explicit in product copy that VetScribe captures
  and organizes and does **not** provide medical advice (reinforces R1/R13).
- **Data residency & subprocessors:** the LLM provider is a subprocessor; disclose
  it and confirm its data-handling terms meet our commitments to clinics.

## 4. Ethical & trust commitments

- The agent never practices medicine. Full stop.
- Records are the clinic's data; clinics can export and leave at any time.
- Attribution is honest — every clinical entry traces to the human who made it.
- We measure and publish (to partners) our clinical-safety eval results.

## 5. Risk review cadence

- Register reviewed at **monthly OKR review**; High-impact items reviewed per release.
- New one-way-door decisions trigger an ad-hoc risk pass.
- Any R1 (fabrication) or R3/R4 (data) event triggers incident response + postmortem (see [Release plan](release-and-rollout-plan.md) §9).

## Open questions

- **[OPEN QUESTION]** Which US state(s) do we launch in, and what are their veterinary-records retention rules?
- **[OPEN QUESTION]** Is a formal DPA + subprocessor disclosure needed with the LLM provider before handling real owner PII?
- **[OPEN QUESTION]** What liability/insurance posture (E&O) is appropriate given clinical-adjacent use?
- **[OPEN QUESTION]** Do we ever capture any human/owner health data that could pull us into stricter regimes?
