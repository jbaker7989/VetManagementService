# Brain: Vet Clinic Agent Logic

This file is the single source of truth for how the agent handles pets, owners, visits, and treatment. `AGENTS.md` links here; keep all domain logic in this file.

## Purpose

Support a veterinary clinic front desk and clinical staff by:
- Registering pets, whether they arrive by scheduled appointment or as a walk-in
- Recording who owns each pet and how to reach them
- Tracking why a pet is being seen, what's diagnosed, and what's done about it
- Tracking every medication given, its dosage and instructions
- Tracking which veterinarian is assigned to a case
- Keeping a running log of everything done over the course of treatment
- Tracking itemized costs per visit
- Scheduling and tracking follow-up visits

## Data Files

Persistent records live in `../memory/` as JSON. Treat these as the database — read before answering questions about existing patients/visits, write after any change.

- `../memory/patients.json` — one entry per pet + its owner
- `../memory/visits.json` — one entry per visit/case, linked to a patient by `patientId`

### `patients.json` schema

```json
{
  "id": "string, unique, e.g. p-0001",
  "name": "pet's name",
  "species": "e.g. dog, cat, bird, rabbit",
  "breed": "string or 'mixed/unknown'",
  "sex": "male | female | unknown",
  "neutered": true,
  "dateOfBirth": "YYYY-MM-DD or null if unknown",
  "approximateAge": "used when dateOfBirth is unknown, e.g. '~3 years'",
  "weightKg": 0.0,
  "distinguishingCharacteristics": "coat color/markings, scars, microchip id, temperament notes, etc.",
  "owner": {
    "name": "string",
    "phone": "string",
    "email": "string or null",
    "address": "string or null"
  },
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp",
  "isActive":true,
  "deathDate": "ISO 8601 timestamp"
}
```

### `visits.json` schema

```json
{
  "id": "string, unique, e.g. v-0001",
  "patientId": "references patients.json id",
  "intakeType": "scheduled | walk-in",
  "scheduledAt": "ISO 8601 timestamp or null if walk-in",
  "checkedInAt": "ISO 8601 timestamp",
  "assignedVeterinarian": "string, vet's name",
  "reasonForVisit": "owner-reported ailment/complaint",
  "diagnosis": "string, filled in once the vet determines it; null until then",
  "status": "checked-in | in-treatment | awaiting-followup | closed",
  "treatmentLog": [
    {
      "timestamp": "ISO 8601 timestamp",
      "performedBy": "string, staff/vet name",
      "note": "what was done (exam finding, procedure, observation, etc.)"
    }
  ],
  "medications": [
    {
      "name": "string, drug name",
      "dosage": "string, e.g. '5mg/kg'",
      "frequency": "string, e.g. 'twice daily'",
      "route": "string, e.g. oral, injection, topical",
      "instructions": "string, owner-facing administration instructions",
      "administeredAt": "ISO 8601 timestamp or null if sent home with owner only"
    }
  ],
  "costs": [
    {
      "item": "string, e.g. 'Exam fee', 'Rabies vaccine', 'Amoxicillin (30ct)'",
      "amount": 0.00
    }
  ],
  "totalCost": 0.00,
  "followUp": {
    "scheduled": true,
    "date": "ISO 8601 timestamp or null",
    "reason": "string or null"
  },
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp"
}
```

`totalCost` is always the sum of `costs[].amount`; recompute it any time `costs` changes rather than editing it directly.

## Workflows

### 1. Intake (scheduled or walk-in)

1. Determine `intakeType`. If scheduled, confirm the existing appointment; if walk-in, note there was no prior appointment.
2. Look up the pet in `patients.json` by name + owner. If not found, create a new patient record — ask for every field in the schema you don't already have (species, breed, sex, age/DOB, weight, distinguishing characteristics, owner name/phone).
3. Create a new visit record in `visits.json` with `intakeType`, `checkedInAt` set to now, `status: "checked-in"`, and `reasonForVisit` captured from the owner.
4. Ask which veterinarian is assigned, or leave `assignedVeterinarian` blank and prompt for it before treatment begins.

### 2. Diagnosis & treatment logging

1. Once the vet examines the pet, record `diagnosis` on the visit.
2. Every distinct action taken (exam finding, test run, procedure performed, observation) gets its own entry appended to `treatmentLog` with a timestamp and who performed it. Never overwrite prior entries — this is an append-only running log across the full course of treatment.
3. Update `status` as the case progresses (`in-treatment` → `awaiting-followup` or `closed`).

### 3. Medication

1. Each medication administered or prescribed gets its own entry in `medications`, including dosage, frequency, route, and clear owner-facing instructions.
2. If the medication is given at the clinic, set `administeredAt`. If it's sent home with the owner, leave `administeredAt` null but still require `instructions`.

### 4. Costs

1. Add one `costs` entry per billable item (exam fee, each medication, each procedure/test) — do not lump everything into a single line.
2. Recompute `totalCost` as the sum of all `costs[].amount` whenever the list changes.

### 5. Follow-up scheduling

1. If the vet wants to see the pet again, set `followUp.scheduled = true`, fill in `date` and `reason`.
2. If a follow-up is scheduled, offer to use the `send-email` skill to send the owner a reminder/confirmation.
3. When a follow-up visit actually happens, it becomes its own new entry in `visits.json` (not a mutation of the original visit) — link context by mentioning the prior `visit id` in `reasonForVisit` if useful, e.g. "Follow-up to v-0001".

## Skills

- **send-email** (`../skills/send-email/SKILL.md`) — use to send owners appointment reminders, follow-up confirmations, or visit receipts/summaries.
- **web-fetch** (`../skills/web-fetch/SKILL.md`) — use to look up unfamiliar drug dosing information, breed-specific health considerations, or similar external reference lookups. Never use it as a substitute for the assigned veterinarian's clinical judgment — surface what you find as reference material only.

## Ground Rules

- Never guess a diagnosis, dosage, or medical recommendation — that's the veterinarian's call. The agent's job is capturing and organizing data, not practicing medicine.
- Ask for any required field you don't have rather than inventing a placeholder value.
- Every write to `patients.json` or `visits.json` should update `updatedAt`.
- IDs are stable and never reused, even if a record is later closed or archived.
- Do not allow the deletion of any record. Add an `isActive` field to each record to record if the pet has died along with a `deathDate`.  
- update the `deathDate` with a timestamp of when the `isActive` date is set to true.  When updated to false remove the timestamp.
