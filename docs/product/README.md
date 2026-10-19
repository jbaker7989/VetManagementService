# Product Documentation — VetManagementService

**Working product name:** VetScribe (AI clinic co‑pilot for veterinary practices)
**Document owner:** Jason Baker (Principal / Senior Technical Product Manager)
**Last updated:** 2026-10-07
**Status:** Productization plan — current codebase is a working MVP/prototype

---

## How to read this

This folder is the product-management record for VetManagementService. The
running code in this repo is a **demonstration-grade MVP**: an agentic intake
and treatment tracker (the "Clinic Agent") grounded on `agent-home/brain/brain.md`,
exposed through an Express chat UI and a local MCP server, with a typed tool
layer that keeps the LLM off the filesystem and shell.

These documents take the next step: they lay out **how this MVP becomes a
product** — the strategy, the plan, and the launch — written the way a Principal
PM would document it for a cross-functional team and executive stakeholders.

Each document states its own assumptions and the open questions that still need
an answer. Where a claim depends on a decision no one has made yet, it is
flagged **[ASSUMPTION]** or **[OPEN QUESTION]** rather than asserted as fact.

## Document map

### 1. Strategy & Vision — *why we are building this, and what winning looks like*
| Doc | Purpose |
|---|---|
| [Vision](01-strategy-and-vision/vision.md) | The 3-year north star and the change we want to create |
| [Product Strategy](01-strategy-and-vision/product-strategy.md) | Where we play, how we win, the wedge, and the moat |
| [Market & Competitive Landscape](01-strategy-and-vision/market-and-competitive-landscape.md) | TAM/SAM/SOM, incumbents, and our differentiation |
| [Personas & Jobs-to-be-Done](01-strategy-and-vision/personas-and-jtbd.md) | Who we serve and the jobs they hire us for |

### 2. Planning & Alignment — *what we are building, in what order, and who owns what*
| Doc | Purpose |
|---|---|
| [Roadmap](02-planning-and-alignment/roadmap.md) | Now / Next / Later across four horizons |
| [PRD: Agentic Intake & Treatment](02-planning-and-alignment/prd-agentic-intake-and-treatment.md) | The flagship spec for the core workflow |
| [OKRs & Success Metrics](02-planning-and-alignment/okrs-and-success-metrics.md) | Objectives, key results, and the metric tree |
| [Stakeholders & RACI](02-planning-and-alignment/stakeholders-and-raci.md) | Decision rights and the operating cadence |

### 3. Execution & Launch — *how we ship it safely and bring it to market*
| Doc | Purpose |
|---|---|
| [GTM & Launch Plan](03-execution-and-launch/gtm-and-launch-plan.md) | Segmentation, pricing, motion, and launch tiers |
| [Release & Rollout Plan](03-execution-and-launch/release-and-rollout-plan.md) | Environments, gating, and the readiness checklist |
| [Risks, Compliance & Mitigations](03-execution-and-launch/risks-compliance-and-mitigations.md) | Clinical safety, data, and the risk register |

## Current state vs. documented plan (honest baseline)

| Capability | In the repo today | In this plan |
|---|---|---|
| Patient & visit records | ✅ JSON store, append-only treatment log | Multi-tenant database, audit trail |
| Natural-language intake | ✅ Chat UI + pi agent on 5 typed tools | Same, hardened + voice/phone intake |
| Bulk intake | ✅ CSV/JSON upload + `bulk_intake` MCP tool | Migration tooling from incumbent PIMS |
| Programmatic access | ✅ Local stdio MCP server | Authenticated, hosted MCP + REST API |
| Clinical guardrails | ✅ "Never guess a diagnosis/dosage" in brain.md | Formalized safety policy + eval suite |
| Users / auth / tenancy | ❌ none | Required before any pilot |
| Scheduling, billing, e-fax, labs | ❌ none | Phased integrations |

## Top open questions (owners to assign)

1. **[OPEN QUESTION]** Is the near-term goal a fundable product, or a portfolio/reference artifact? This plan assumes the former; several decisions below depend on the answer.
2. **[OPEN QUESTION]** Target buyer: independent single-doctor clinics, multi-site groups, or corporate consolidators? Strategy assumes independent + small groups as the wedge.
3. **[OPEN QUESTION]** Build net-new vs. integrate-into-existing PIMS (Practice Information Management System)? Strategy assumes a co-pilot layer first, full system later.
4. **[OPEN QUESTION]** Regulatory posture — is any output ever owner-facing medical guidance, or strictly staff-facing data capture? Current guardrails assume the latter.
