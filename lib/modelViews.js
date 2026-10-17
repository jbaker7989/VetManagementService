// What the LLM (and MCP clients) may see of the clinic's data. Owner phone,
// email and address never leave the store through these helpers; the only way
// to see them is the guarded contact route in server.js.

export const MAX_LIST_RESULTS = 50;

export function summarizePatient(patient) {
  return {
    id: patient.id,
    name: patient.name,
    species: patient.species,
    ownerFirstName: patient.owner?.name?.trim().split(/\s+/)[0],
  };
}

export function redactPatient(patient) {
  if (!patient) return patient;
  return { ...patient, owner: { name: patient.owner?.name ?? null } };
}

export async function listPatientsForModel(store) {
  return (await store.listPatients()).slice(0, MAX_LIST_RESULTS).map(summarizePatient);
}

export async function findPatientForModel(store, query) {
  return redactPatient(await store.findPatient(query));
}

export async function listVisitsForModel(store, patientId) {
  const visits = await store.listVisits();
  return (patientId ? visits.filter((v) => v.patientId === patientId) : visits).slice(0, MAX_LIST_RESULTS);
}
