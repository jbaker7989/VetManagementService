# Product Strategy — VetScribe

**Category:** Strategy & Vision
**Owner:** Jason Baker (PM)
**Last updated:** 2026-10-07

---

## Strategy in one paragraph

Win the veterinary documentation burden by starting as a **co-pilot capture
layer** — natural-language intake and treatment logging that sits alongside the
clinic's existing systems — rather than a rip-and-replace PIMS. Land in
independent and small-group clinics where switching costs and procurement
friction are lowest, prove measurable time savings and charge-capture lift on
the single most painful workflow (intake → treatment → billing → follow-up),
then expand account-by-account into scheduling, billing, and integrations until
VetScribe is the system of record.

## Where we play

| Dimension | Choice | Rationale |
|---|---|---|
| **Primary segment** | Independent clinics + small groups (1–5 locations) | Fast decisions, acute labor pain, underserved by heavyweight PIMS. |
| **Secondary (later)** | Mid-size groups (6–30 locations) | Reached after proof points and admin/reporting maturity. |
| **Buyer** | Practice owner / lead DVM / practice manager | Same person often feels the pain and controls budget. |
| **Geography** | US first | Single regulatory/billing context to start; expand later. |
| **Wedge workflow** | Intake → treatment log → itemized billing → follow-up | Already the working core in this repo; highest, most daily pain. |

## How we win (differentiation)

1. **Capture-first, not form-first.** Competitors make humans translate reality
   into their schema. We invert it: the agent does the structuring. This repo
   already demonstrates the hard part — reliable NL→schema via a typed tool
   layer grounded on `brain.md`.
2. **Trust by construction.** The LLM can only call five validated tools; it has
   **no filesystem or shell access**, records are **append-only and attributed**,
   and nothing is ever deleted (death is a state change, not a delete). This is a
   credible, demonstrable safety story for a clinical buyer.
3. **Clinically humble by design.** "Never guess a diagnosis or dosage" is
   enforced in the grounding. We sell *time back*, not medical automation — which
   is exactly what keeps DVMs comfortable adopting it.
4. **Open by protocol.** MCP + (planned) REST means we integrate rather than
   trap. Bulk CSV/JSON import lowers the cost of trying us with real data.

## The wedge → expansion path (land and expand)

```
LAND:   Intake & treatment capture co-pilot  (what works today)
          ↓ prove: minutes saved/visit, charge-capture lift, record completeness
EXPAND: + follow-up automation & owner comms
          + scheduling
          + billing/invoicing export → integration
          + lab / imaging / e-fax integrations
BECOME: System of record (lightweight PIMS for the segments we serve)
```

## Our unfair advantages / moat (built over time)

- **Workflow-grounded data model** refined with real clinics (the `brain.md`
  schema + workflows are the seed of this).
- **Proprietary evaluation suite** for clinical-capture accuracy and safety —
  hard to replicate, compounds with usage.
- **Switching cost via system-of-record gravity** once billing and history live
  in VetScribe.
- **Trust/brand with DVMs** as the tool that is safe *because* it refuses to
  practice medicine.

## Strategic bets & the riskiest assumptions

| # | Bet | If wrong… |
|---|---|---|
| B1 | Clinics will trust an LLM-captured record enough to bill from it | We stay a note-taking toy; must nail accuracy + audit. |
| B2 | NL capture saves enough time to pay for itself | No ROI story; motion stalls. |
| B3 | Co-pilot-first beats replace-PIMS-first | Wrong entry point wastes 12–18 months. |
| B4 | Independent clinics are reachable at viable CAC | Need a repeatable, low-touch motion (see GTM). |

These map directly to the [OKRs](../02-planning-and-alignment/okrs-and-success-metrics.md)
and the pilot success criteria in the [GTM plan](../03-execution-and-launch/gtm-and-launch-plan.md).

## What we are deliberately NOT doing

- Not building autonomous clinical decision support.
- Not competing on breadth-of-features with incumbent PIMS on day one.
- Not targeting large corporate/hospital chains first (long sales cycles).
- Not going multi-region/multi-regulatory before the US motion is proven.

## Open questions

- **[OPEN QUESTION]** Co-pilot-on-top vs. replace-the-PIMS as the primary 18-month
  path? (Bet B3 — the single most consequential strategic choice.)
- **[OPEN QUESTION]** Do we need a formal integration with a specific incumbent PIMS to be viable in pilots, or is export/import enough to start?
- **[OPEN QUESTION]** Build vs. partner for billing — regulatory and payments complexity may argue for partnering.
