---
name: web-fetch
description: Look up external reference information — drug dosing/interaction references, breed-specific health considerations, vaccine schedules — to support (never replace) the assigned veterinarian's clinical judgment. Use when brain.md workflows need outside reference material not already known.
---

# Web Fetch

Fetches reference information from the web to support clinic staff. This is a research aid, not a diagnostic or prescribing tool.

## When to use

- Looking up general dosing ranges or known interactions for a medication the vet is considering, to hand to the vet as reference — never to decide dosage yourself.
- Looking up breed-specific health predispositions relevant to a patient's distinguishing characteristics.
- Checking standard vaccine/wellness schedules for a species when the owner asks.

## Steps

1. Identify the specific, narrow question (e.g. "typical amoxicillin dosing range for dogs by weight" rather than open-ended browsing).
2. Fetch from a reputable veterinary/medical source.
3. Summarize findings plainly and cite the source.
4. Explicitly flag that this is reference material for the veterinarian to confirm — never state it as the final dosage/diagnosis, and never write it into a visit's `diagnosis` or `medications` fields yourself.

## Notes

- If results are inconclusive or sources disagree, say so rather than picking one answer.
- Do not use this skill for anything outside clinic-relevant lookups.
