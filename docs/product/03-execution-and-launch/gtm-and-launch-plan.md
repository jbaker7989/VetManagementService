# GTM & Launch Plan — VetScribe

**Category:** Execution & Launch
**Owner:** Jason Baker (PM) + GTM
**Last updated:** 2026-10-07
**Status:** Plan — pre-launch. Pricing figures are **[ASSUMPTION]** placeholders to be validated.

---

## 1. Positioning

**For** independent and small-group veterinary practices drowning in
documentation, **VetScribe** is an AI capture co-pilot that **turns the natural
conversation of a visit into clean, billable, auditable records** — so staff
stop re-typing and start seeing patients. **Unlike** form-first practice software
or note-only AI scribes, VetScribe produces the *structured, itemized,
follow-up-aware record a clinic actually runs on*, and it is safe **because** it
never diagnoses or doses — it only captures what the team decides.

**One-liner:** *Describe the visit. VetScribe writes the record.*

## 2. Target market & segmentation (launch)

- **Beachhead:** independent companion-animal clinics (1–3 locations), US, tech-curious owner/manager who feels the staffing pinch.
- **Second wave:** small groups (4–10 locations) and acute-pain niches (urgent care, mobile vets) **[validate]**.
- **Not yet:** large corporate chains (long cycles), international (regulatory variance).

See [Personas](../01-strategy-and-vision/personas-and-jtbd.md) and
[Market](../01-strategy-and-vision/market-and-competitive-landscape.md).

## 3. Value proposition by persona

| Persona | Message |
|---|---|
| Practice owner (buyer) | "Recover missed charges and staff hours — with records clean enough to bill and audit from." |
| Veterinarian | "Say what you found and did; it's logged accurately and attributed. It never puts a diagnosis or dosage in your mouth." |
| Front desk | "Check in any walk-in in seconds, in plain language." |

## 4. Pricing & packaging (hypothesis — validate)

- **Model:** per-location subscription with a usage ceiling, **[ASSUMPTION]**; simple enough for an independent owner to say yes to.
- **Design-partner tier:** free or deeply discounted in exchange for baselines, feedback, and a reference.
- **ROI framing is the pitch:** price well under the value of staff hours saved + charges recovered (quantified from OKR data).
- **[OPEN QUESTION]** Per-seat vs. per-location vs. per-visit? Per-location is the hypothesis (predictable for buyer, aligned to value).

## 5. Go-to-market motion

**Phase 0 — Design partners (now):** 1→3 hand-picked clinics. High touch.
Instrument baselines *before* go-live. Goal: prove OKR O1/O2.

**Phase 1 — Private beta:** 5–10 clinics via warm intros and the author's
network. Repeatable onboarding (KR3.x). Collect references and case studies.

**Phase 2 — Public launch:** low-touch, content- and reference-led motion
(independent clinics don't respond to heavy enterprise sales). Channels:
veterinary associations/communities, conferences, word-of-mouth, targeted
content on the documentation-burden pain.

**[OPEN QUESTION]** Is the long-term motion product-led self-serve, or
founder/inside-sales-led? Beachhead segment and price point suggest a low-touch,
reference-driven motion; confirm with CAC data.

## 6. Launch tiers & definition of "launch"

| Tier | Audience | Bar to clear |
|---|---|---|
| **Internal / alpha** | Team + synthetic data | PRD AC-1..AC-5 pass; eval suite green |
| **Design partner (controlled)** | 1–3 real clinics | AC-6/AC-7 (tenancy, isolation, bulk integrity); support runbook ready |
| **Private beta** | 5–10 clinics | ROI dashboard live; onboarding ≤ 1 day; rollback plan proven |
| **GA / public** | Open | Repeatable onboarding, pricing live, support SLAs, references in hand |

## 7. Launch readiness checklist (gates to GA)

- [ ] Clinical-safety eval suite green; Clinical SME sign-off
- [ ] Multi-tenancy, auth, data isolation verified (AC-6)
- [ ] Security review complete; PII encryption + retention policy in place
- [ ] ROI/metrics dashboard live (charge-capture, time-saved, completeness)
- [ ] Onboarding + migration (import from incumbent PIMS export) documented and tested
- [ ] Support model + runbook + incident response defined
- [ ] Pricing, billing, and terms finalized; Legal sign-off
- [ ] ≥ 2 reference clinics willing to be quoted
- [ ] Rollback / data-export guarantee documented (clinics must trust they can leave)

## 8. Enablement & assets

- Demo script built on the existing chat UI (walk-in → treatment → billing → follow-up).
- ROI calculator (staff minutes + recovered charges) driven by OKR definitions.
- One-pager + case studies from design partners.
- Migration guide leveraging the existing bulk CSV/JSON import.

## 9. Launch metrics (did the launch work?)

Tie to [OKRs](../02-planning-and-alignment/okrs-and-success-metrics.md): activated
clinics, time-to-first-captured-visit, week-4 retention/active rate, reference
willingness, and zero safety/data incidents during launch.

## 10. Risks to GTM

See [Risks register](risks-compliance-and-mitigations.md). Top GTM-specific risks:
trust barrier to billing from AI-captured records; CAC in a fragmented,
low-ACV segment; incumbent PIMS shipping "good enough" capture.

## Open questions

- **[OPEN QUESTION]** Pricing model and price point (needs ROI data).
- **[OPEN QUESTION]** Primary acquisition channel for independent clinics.
- **[OPEN QUESTION]** Do we require an incumbent-PIMS integration to be credible at beta, or is import/export sufficient?
- **[OPEN QUESTION]** Support model and SLA expectations for clinics that can't tolerate downtime at the counter.
