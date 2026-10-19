// Single definition of the patient and visit shapes. lib/tools.js (pi agent),
// agent-home/mcp/server.js (MCP) and the upload validation in lib/intake.js
// all import from here so the three entry points can't drift apart.

import { z } from "zod";

const ownerFields = {
  name: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().max(254).optional(),
  address: z.string().max(500).optional(),
};

export const patientFields = {
  id: z.string().max(50).describe("Existing patient id to update; omit to create new").optional(),
  name: z.string().max(200).optional(),
  species: z.string().max(100).optional(),
  breed: z.string().max(200).optional(),
  sex: z.enum(["male", "female", "unknown"]).optional(),
  neutered: z.boolean().optional(),
  dateOfBirth: z.string().max(40).nullable().optional(),
  approximateAge: z.string().max(100).nullable().optional(),
  weightKg: z.number().nullable().optional(),
  distinguishingCharacteristics: z.string().max(1000).nullable().optional(),
  owner: z.object(ownerFields).optional(),
  isActive: z.boolean().describe("Set false if the pet has died").optional(),
  deathDate: z.string().max(40).nullable().optional(),
};

// Upload rows are stricter than the tool schema: unknown columns are rejected
// and a new patient needs the fields the store requires to create one.
export const PatientRecord = z
  .object(patientFields)
  .strict()
  .refine((p) => p.id || (p.name && p.species), { message: "name and species are required when id is not given" });

const TreatmentLogEntry = z.object({
  timestamp: z.string().max(40).optional(),
  performedBy: z.string().max(200),
  note: z.string().max(2000),
});

const MedicationEntry = z.object({
  name: z.string().max(200),
  dosage: z.string().max(100),
  frequency: z.string().max(100),
  route: z.string().max(100),
  instructions: z.string().max(1000),
  administeredAt: z.string().max(40).nullable().optional(),
});

const CostEntry = z.object({
  item: z.string().max(200),
  amount: z.number(),
});

const MAX_ENTRIES = 50;

export const visitFields = {
  id: z.string().max(50).describe("Existing visit id to update; omit to create new").optional(),
  patientId: z.string().max(50).optional(),
  intakeType: z.enum(["scheduled", "walk-in"]).optional(),
  scheduledAt: z.string().max(40).nullable().optional(),
  checkedInAt: z.string().max(40).optional(),
  assignedVeterinarian: z.string().max(200).nullable().optional(),
  reasonForVisit: z.string().max(1000).optional(),
  diagnosis: z.string().max(1000).nullable().optional(),
  status: z.enum(["checked-in", "in-treatment", "awaiting-followup", "closed"]).optional(),
  treatmentLog: z.array(TreatmentLogEntry).max(MAX_ENTRIES).optional(),
  medications: z.array(MedicationEntry).max(MAX_ENTRIES).optional(),
  costs: z.array(CostEntry).max(MAX_ENTRIES).optional(),
  followUp: z
    .object({
      scheduled: z.boolean().optional(),
      date: z.string().max(40).nullable().optional(),
      reason: z.string().max(1000).nullable().optional(),
    })
    .optional(),
};
