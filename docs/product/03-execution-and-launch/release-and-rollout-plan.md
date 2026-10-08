# Release & Rollout Plan — VetScribe

**Category:** Execution & Launch
**Owner:** Jason Baker (PM) + Engineering
**Last updated:** 2026-10-07

---

## 1. Purpose

How we ship changes to a product that holds clinical and billing records, safely
and reversibly. The guiding constraint: **a bad release at a clinic counter is
not a bug — it's a disruption to animal care and the clinic's revenue.** Every
rollout assumes that stakes.

## 2. Environments

| Environment | Data | Purpose | Gate to promote |
|---|---|---|---|
| **Local / dev** | Synthetic (today's JSON seed) | Build & unit test | Code review + tests pass |
| **Staging** | Synthetic, production-shaped | Integration, eval suite, security checks | Eval green + security checks |
| **Design-partner (controlled prod)** | Real clinic data, isolated tenant | Real-world validation | Readiness checklist + SME sign-off |
| **Production (beta→GA)** | Real, multi-tenant | Live clinics | Launch readiness (see GTM §7) |

> **MVP note:** the repo currently runs a single local environment on a flat
> JSON store. Standing up staging + a durable multi-tenant datastore is a **NOW**
> roadmap item and a prerequisite for any real rollout.

## 3. Release gates (every release)

1. **Automated tests** pass. *(Repo currently has no test script — stand this up first; see open questions.)*
2. **Clinical-safety eval suite** green — 100% correct refusal to fabricate clinical content. **Hard gate; Clinical SME accountable.**
3. **Data-integrity checks:** append-only treatment log preserved, `totalCost` reconciles, no hard-delete path, IDs stable.
4. **Security checks:** tenancy isolation, auth, input validation on public chat/upload endpoints.
5. **Go/no-go:** PM accountable; Clinical SME and Security hold blocking rights.

## 4. Rollout strategy

- **Progressive by tenant.** Roll a change to internal → one design partner →
  all design partners → beta → GA. Never all clinics at once.
- **Feature flags** for anything touching the agent, `brain.md`, or the data
  schema, so we can disable without redeploy.
- **Canary a clinic**, watch correction-rate and eval-adjacent telemetry for a
  defined soak period before widening.
- **Change freeze** around a clinic's peak hours where feasible (counter uptime matters).

## 5. Special handling: agent & `brain.md` changes

Changes to the grounding file or tool layer can silently alter clinical behavior.
Therefore:
- Treated as **clinical changes**, not config — Clinical SME approval required.
- Must pass the eval suite diff (no regression on the golden set).
- Model/provider changes (e.g. swapping the OpenRouter model, or the MCP
  `vet_agent_chat` provider) are **first-class releases** with full eval + canary,
  never a quiet env-var flip.

## 6. Observability & health

- Telemetry on capture turns: latency, error rate, correction rate (staff overriding output).
- Data-integrity monitors: `totalCost` mismatches, orphaned visits, schema violations.
- Safety monitor: flag any agent output resembling an originated diagnosis/dosage for review.
- Alerting on public-endpoint abuse (rate, payload size) — the chat box is internet-reachable.

## 7. Rollback & recovery

- **Code:** redeploy prior version; feature-flag kill switch for agent/schema changes.
- **Data:** because records are **append-only and never hard-deleted**, recovery
  favors forward-correcting entries over destructive rollback; backups + point-in-time
  restore required once on a real datastore.
- **Defined rollback triggers:** any eval regression in prod, any data-isolation
  incident, correction-rate spike beyond threshold, or counter-side latency breach.
- **Data portability:** clinics can export their full records at any time — a
  trust requirement and a rollback-of-last-resort (they can leave with their data).

## 8. Pre-deploy checklist (per release)

- [ ] Tests + eval suite green (gates 1–2)
- [ ] Data-integrity + security checks green (gates 3–4)
- [ ] Clinical SME sign-off if agent/`brain.md`/schema touched
- [ ] Feature flags configured; kill switch verified
- [ ] Backup taken / restore path confirmed
- [ ] Rollback trigger + owner named
- [ ] Affected clinics informed if user-visible
- [ ] Observability dashboards watched through soak window

## 9. Incident response (summary)

- Severity tiers keyed to clinical/billing impact (counter-down = top severity).
- On-call owner; clinic-facing comms template; blameless postmortem for sev-high.
- A fabricated-clinical-content event is automatically treated as high severity
  regardless of blast radius.

## Open questions

- **[OPEN QUESTION]** Automated test harness and CI — none exists in the repo yet; this is prerequisite work.
- **[OPEN QUESTION]** Target datastore + backup/restore approach (drives recovery guarantees).
- **[OPEN QUESTION]** Uptime/latency SLA at the counter, and whether offline/degraded capture is needed.
- **[OPEN QUESTION]** Where is production hosted, and what is the security/compliance posture of that host?
