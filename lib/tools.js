import { Type } from "typebox";
import { z } from "zod";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { patientFields, visitFields } from "./schema.js";

// The agent gets NO filesystem or shell tools — only this narrow, validated
// set of operations on patients.json / visits.json via lib/store.js. This
// keeps a publicly reachable chat box from ever reaching bash/edit/write.

const fromShape = (shape) => Type.Unsafe(toJsonSchemaCompat(z.object(shape)));

export function createVetTools(store) {
  const list_patients = defineTool({
    name: "list_patients",
    label: "List Patients",
    description: "List all patient (pet) records currently on file, including owner info.",
    parameters: Type.Object({}),
    execute: async () => {
      const patients = await store.listPatients();
      return { content: [{ type: "text", text: JSON.stringify(patients, null, 2) }], details: {} };
    },
  });

  const find_patient = defineTool({
    name: "find_patient",
    label: "Find Patient",
    description: "Look up a single patient by id, or by pet name (optionally narrowed by owner name).",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Patient id, e.g. p-0001" })),
      name: Type.Optional(Type.String({ description: "Pet's name" })),
      ownerName: Type.Optional(Type.String({ description: "Owner's name, to disambiguate" })),
    }),
    execute: async (_id, params) => {
      const patient = await store.findPatient(params);
      return { content: [{ type: "text", text: JSON.stringify(patient, null, 2) }], details: {} };
    },
  });

  const upsert_patient = defineTool({
    name: "upsert_patient",
    label: "Create/Update Patient",
    description:
      "Create a new patient record, or update an existing one by passing its id. Omit id to create. " +
      "Follow brain.md: ask for any required field you don't have instead of inventing one.",
    parameters: fromShape(patientFields),
    execute: async (_id, params) => {
      const record = await store.upsertPatient(params);
      return { content: [{ type: "text", text: JSON.stringify(record, null, 2) }], details: {} };
    },
  });

  const list_visits = defineTool({
    name: "list_visits",
    label: "List Visits",
    description: "List all visit records, optionally filtered to a single patient.",
    parameters: Type.Object({
      patientId: Type.Optional(Type.String({ description: "Only return visits for this patient id" })),
    }),
    execute: async (_id, params) => {
      const visits = await store.listVisits();
      const filtered = params.patientId ? visits.filter((v) => v.patientId === params.patientId) : visits;
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }], details: {} };
    },
  });

  const upsert_visit = defineTool({
    name: "upsert_visit",
    label: "Create/Update Visit",
    description:
      "Create a new visit, or update an existing one by passing its id. Omit id to create a new visit " +
      "(intake). treatmentLog/medications entries you pass are APPENDED to the existing log, never replacing it. " +
      "costs, if passed, REPLACES the full cost list and totalCost is recomputed automatically.",
    parameters: fromShape(visitFields),
    execute: async (_id, params) => {
      const record = await store.upsertVisit(params);
      return { content: [{ type: "text", text: JSON.stringify(record, null, 2) }], details: {} };
    },
  });

  return [list_patients, find_patient, upsert_patient, list_visits, upsert_visit];
}
