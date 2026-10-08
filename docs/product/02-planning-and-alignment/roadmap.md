# Roadmap — VetScribe

**Category:** Planning & Alignment
**Owner:** Jason Baker (PM)
**Last updated:** 2026-10-07
**Format:** Outcome-oriented (Now / Next / Later). Dates are **[ASSUMPTION]** and depend on team size — see open questions.

---

## Roadmap principles

- **Outcomes over output.** Each horizon is defined by the outcome it must prove,
  not a feature checklist.
- **Capture-first sequencing.** We harden the wedge (intake → treatment → billing
  → follow-up) before adding breadth.
- **Nothing ships to a clinic without the safety/audit baseline** (auth, tenancy,
  eval suite).

## Horizon 0 — Done (in the repo today)

The MVP that de-risks the core technical bet:

- ✅ Natural-language intake & treatment capture via pi Clinic Agent
- ✅ Five typed tools, **no filesystem/shell access** to the LLM
- ✅ Patient/visit JSON store, append-only treatment log, no hard deletes
- ✅ Itemized costs with recomputed `totalCost`
- ✅ Follow-up scheduling + `send-email` skill
- ✅ Bulk CSV/JSON intake
- ✅ Local stdio MCP server exposing the same operations
- ✅ Clinical guardrails grounded in `brain.md`

## NOW (0–3 months) — *"Make it real for one clinic"*
**Outcome:** A single design-partner clinic can run real daily intake on VetScribe safely.

| Theme | Work | Why |
|---|---|---|
| **Multi-tenancy & auth** | User accounts, roles (CSR/DVM/tech/admin), clinic isolation | Prerequisite for any real use; enables real attribution |
| **Durable datastore** | Replace flat JSON with a real DB; migration of existing schema | JSON store won't survive concurrency/scale |
| **Clinical eval suite** | Golden-set tests for capture accuracy + "never guess" safety | Turns the guardrail promise into something measured |
| **Audit & history UI** | Surface the append-only trail to staff | Trust + compliance story |
| **Hardening** | Rate limits, input validation, observability on the chat/upload paths | Public chat box must be safe |

## NEXT (3–9 months) — *"Prove ROI and make it repeatable"*
**Outcome:** 5–10 clinics live; measurable time-saved and charge-capture lift; a repeatable onboarding.

| Theme | Work |
|---|---|
| **Follow-up & client comms** | Automated reminders/confirmations, visit summaries, delivery tracking |
| **Billing export** | Clean invoice/charge export; reconcile with clinic's billing |
| **Onboarding & migration** | Self-serve import from incumbent PIMS exports; setup wizard |
| **Hosted MCP + REST API** | Authenticated programmatic access (today's MCP is local/no-auth) |
| **Scheduling (v1)** | Appointment calendar feeding intake |
| **Admin reporting** | Minutes-saved, charge-capture, record-completeness dashboards (the ROI proof) |

## LATER (9–18 months) — *"Expand breadth toward system-of-record"*
**Outcome:** VetScribe is the system clinics run the visit on, not just capture into.

- Lab / imaging / e-fax integrations
- Inventory & medication stock linkage
- Voice/ambient capture in the exam room; phone intake
- Multi-location group management & roll-up reporting
- Marketplace of skills/integrations (building on the existing skills pattern)

## FUTURE / EXPLORATORY (18+ months)
- Full lightweight PIMS for target segments
- Predictive follow-up / recall optimization
- Expansion to new segments (emergency, mobile, shelter) and new geographies

## Now/Next/Later at a glance

```
NOW     ██████  Multi-tenancy · DB · eval suite · audit UI · hardening
NEXT    ░░████  Follow-up/comms · billing export · migration · hosted API · scheduling · reporting
LATER   ░░░░██  Integrations · ambient/voice · multi-site · skill marketplace
FUTURE  ░░░░░░  Full PIMS · predictive recall · new segments/geos
```

## Dependencies & sequencing rules

1. **Auth + DB + tenancy gate everything.** No clinic-facing feature ships before them.
2. **Eval suite gates every change to the agent or `brain.md`.** Safety is a release gate, not a backlog item.
3. **ROI reporting must land in NEXT** — without it, the GTM motion has no proof.
4. **Billing export precedes billing integration** (walk before run).

## Open questions

- **[OPEN QUESTION]** Team size and funding — these dates assume a small funded team; a solo/portfolio effort compresses to "NOW only."
- **[OPEN QUESTION]** Which incumbent PIMS export formats must migration support first?
- **[OPEN QUESTION]** Database and hosting choice (drives cost and the security story).
- **[OPEN QUESTION]** Do we do ambient voice capture ourselves or partner?
