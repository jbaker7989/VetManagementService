// Assigns a veterinarian to a pet's care from the UI: updates the pet's open visit,
// or checks the pet in with a new visit when it has none.

import { z } from "zod";
import { visitFields } from "./schema.js";

export const AssignRequest = z.object({
  veterinarianId: z.string().min(1).max(50).nullable(),
  reasonForVisit: visitFields.reasonForVisit,
});

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

// The most recent visit that is not closed; visits are stored oldest first.
const findOpenVisit = (visits, patientId) => visits.findLast((v) => v.patientId === patientId && v.status !== "closed");

// The store's read-then-write is not atomic, so run check-ins one at a time (single process) or concurrent ones each create a visit.
let queue = Promise.resolve();
export function assignVeterinarian(args) {
  const run = queue.then(() => assign(args));
  queue = run.catch(() => {});
  return run;
}

async function assign({ dataStore, roster, patientId, input, context }) {
  const request = AssignRequest.safeParse(input);
  if (!request.success) throw httpError(400, request.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  const { veterinarianId, reasonForVisit } = request.data;

  const patient = await dataStore.findPatient({ id: patientId });
  if (!patient) throw httpError(404, "Patient not found");

  let assignedVeterinarian = null;
  if (veterinarianId !== null) {
    const vet = await roster.get(veterinarianId);
    if (!vet) throw httpError(400, `Unknown veterinarianId ${veterinarianId}`);
    assignedVeterinarian = vet.name;
  }

  const openVisit = findOpenVisit(await dataStore.listVisits(), patient.id);
  if (openVisit) return dataStore.upsertVisit({ id: openVisit.id, assignedVeterinarian }, context);

  if (veterinarianId === null) throw httpError(400, "No open visit to clear the veterinarian from");
  if (!reasonForVisit?.trim()) throw httpError(400, "reasonForVisit is required to check in a pet with no open visit");
  return dataStore.upsertVisit({ patientId: patient.id, reasonForVisit, assignedVeterinarian }, context);
}
