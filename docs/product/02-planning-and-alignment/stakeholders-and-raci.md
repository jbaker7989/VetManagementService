# Stakeholders & RACI — VetScribe

**Category:** Planning & Alignment
**Owner:** Jason Baker (PM)
**Last updated:** 2026-10-07

> The roles below are the **functions** that must be covered to productize, not
> necessarily distinct headcount. In a small/early team one person wears several
> hats. **[ASSUMPTION]** — map to real people once the team is staffed.

---

## Stakeholder map

| Stakeholder / function | Interest | Influence | Engagement |
|---|---|---|---|
| **Product (PM)** | Outcomes, prioritization, trade-offs | High | Drives |
| **Engineering** | Feasibility, architecture, safety of the agent layer | High | Co-owns delivery |
| **Clinical SME (DVM advisor)** | Clinical correctness & safety of `brain.md` | High | Must approve clinical logic |
| **Design/UX** | Capture flow, trust-by-confirmation, bulk upload clarity | Medium | Partners on flows |
| **Design-partner clinics** | Does it save time / recover revenue safely | High | Validate everything |
| **GTM / Sales / Founder** | Positioning, pricing, pipeline | High | Owns the motion |
| **Legal/Compliance** | Records retention, PII, liability posture | Medium→High | Consulted/approves gates |
| **Security/IT** | Tenancy, auth, data protection | High | Approves release gates |
| **Owner/Founder (Jason)** | Vision, funding, strategic bets | High | Sponsor / final strategic call |

## RACI — by major initiative

**R**esponsible (does the work) · **A**ccountable (one owner, final say) · **C**onsulted · **I**nformed

| Initiative | PM | Eng | Clinical SME | Design | GTM | Legal | Security |
|---|---|---|---|---|---|---|---|
| Vision & strategy | A/R | C | C | C | C | I | I |
| Roadmap & prioritization | A/R | C | C | C | C | I | I |
| PRD / feature specs | A/R | C | C | C | I | C | C |
| Agent logic & `brain.md` changes | C | R | **A** | I | I | C | I |
| Clinical safety eval suite | C | R | **A** | I | I | C | I |
| Multi-tenancy, auth, datastore | I | **A/R** | I | I | I | C | C |
| Data security & PII handling | C | R | I | I | I | C | **A** |
| Pricing & packaging | C | I | I | I | **A/R** | C | I |
| Launch / GTM | C | C | I | C | **A/R** | C | I |
| Release go/no-go | **A** | R | C | I | C | C | C |
| Compliance & retention policy | C | C | C | I | I | **A/R** | C |

> **Note:** Clinical SME is **Accountable** for anything touching clinical logic
> or the safety eval — the PM does not overrule clinical judgment. This mirrors
> the product's own principle that the agent never practices medicine.

## Decision rights (how we decide, fast)

- **Reversible, low-cost decisions:** made by the Responsible owner, PM informed. Bias to action.
- **One-way-door decisions** (datastore choice, pricing model, PIMS integration strategy, going owner-facing): PM frames options + recommendation; **sponsor decides** with Clinical/Legal/Security consulted.
- **Safety gate:** Clinical SME + Security can **block** a release regardless of schedule. Non-negotiable.

## Operating cadence

| Ritual | Frequency | Purpose | Driver |
|---|---|---|---|
| Backlog refinement | Weekly | Keep NOW horizon ready | PM |
| Sprint / build review | Weekly or biweekly | Delivery progress, unblock | Eng + PM |
| Clinical review | As `brain.md`/agent changes | Approve clinical logic & eval results | Clinical SME |
| Design-partner sync | Biweekly | Real-world feedback, baselines | PM + GTM |
| OKR review | Monthly | Progress vs. key results | PM |
| Strategy review | Quarterly | Revisit bets, roadmap horizons | Sponsor + PM |

## Communication plan

- **Single source of truth:** this `/docs/product` folder, versioned in the repo.
- **Status updates:** short written update per cycle (progress, risks, decisions needed) to all stakeholders — see the [GTM plan](../03-execution-and-launch/gtm-and-launch-plan.md) for external comms.
- **Decisions logged:** one-way-door decisions recorded with context and date (consider an ADR log alongside this folder).

## Open questions

- **[OPEN QUESTION]** Who is the named Clinical SME, and are they an advisor, contractor, or employee? (Blocks clinical sign-off.)
- **[OPEN QUESTION]** Is there a dedicated Security/IT owner, or does Eng cover it initially?
- **[OPEN QUESTION]** Who holds the GTM/pricing hat in the early team?
