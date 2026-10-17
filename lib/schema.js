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
  timestamp: z.string().optional(),
  performedBy: z.string(),
  note: z.string(),
});

const MedicationEntry = z.object({
  name: z.string(),
  dosage: z.string(),
  frequency: z.string(),
  route: z.string(),
  instructions: z.string(),
  administeredAt: z.string().nullable().optional(),
});

const CostEntry = z.object({
  item: z.string(),
  amount: z.number(),
});

export const visitFields = {
  id: z.string().describe("Existing visit id to update; omit to create new").optional(),
  patientId: z.string().optional(),
  intakeType: z.enum(["scheduled", "walk-in"]).optional(),
  scheduledAt: z.string().nullable().optional(),
  checkedInAt: z.string().optional(),
  assignedVeterinarian: z.string().nullable().optional(),
  reasonForVisit: z.string().optional(),
  diagnosis: z.string().nullable().optional(),
  status: z.enum(["checked-in", "in-treatment", "awaiting-followup", "closed"]).optional(),
  treatmentLog: z.array(TreatmentLogEntry).optional(),
  medications: z.array(MedicationEntry).optional(),
  costs: z.array(CostEntry).optional(),
  followUp: z
    .object({
      scheduled: z.boolean().optional(),
      date: z.string().nullable().optional(),
      reason: z.string().nullable().optional(),
    })
    .optional(),
};
