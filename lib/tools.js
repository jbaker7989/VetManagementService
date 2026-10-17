import { Type } from "typebox";
import { z } from "zod";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  findPatientForModel,
  listPatientsForModel,
  listVisitsForModel,
  MAX_LIST_RESULTS,
  redactPatient,
  toDataBlock,
} from "./modelViews.js";
import { patientFields, visitFields } from "./schema.js";

// The agent gets NO filesystem or shell tools — only this narrow, validated
// set of operations on patients.json / visits.json via lib/store.js. This
// keeps a publicly reachable chat box from ever reaching bash/edit/write.
// TOOL_NAMES is the single allowlist per session context: intake sessions
// (free-text uploads) can only propose changes, so injected text has no way to
// read records back out. Writes always go through the approval gate.
export const TOOL_NAMES = {
  chat: ["list_patients", "find_patient", "upsert_patient", "list_visits", "upsert_visit"],
  intake: ["upsert_patient", "upsert_visit"],
};

const fromShape = (shape) => Type.Unsafe(toJsonSchemaCompat(z.object(shape)));

const result = (value) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : toDataBlock(value) }],
  details: {},
});

// propose(tool, params) -> { approved, record } | { approved, reason }, see lib/approvalGate.js
export function createVetTools(store, propose, context) {
  const outcomeResult = (outcome, view = (record) => record) =>
    result(outcome.approved ? view(outcome.record) : `Change cancelled: ${outcome.reason}. Nothing was saved.`);

  const list_patients = defineTool({
    name: "list_patients",
    label: "List Patients",
    description:
      `List patient (pet) records on file: id, pet name, species and owner first name only, up to ${MAX_LIST_RESULTS}. ` +
      "Use find_patient for one patient's full record.",
    parameters: Type.Object({}),
    execute: async () => result(await listPatientsForModel(store)),
  });

  const find_patient = defineTool({
    name: "find_patient",
    label: "Find Patient",
    description:
      "Look up a single patient by id, or by pet name (optionally narrowed by owner name). " +
      "Owner phone, email and address are withheld.",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Patient id, e.g. p-0001" })),
      name: Type.Optional(Type.String({ description: "Pet's name" })),
      ownerName: Type.Optional(Type.String({ description: "Owner's name, to disambiguate" })),
    }),
    execute: async (_id, params) => result(await findPatientForModel(store, params)),
  });

  const upsert_patient = defineTool({
    name: "upsert_patient",
    label: "Create/Update Patient",
    description:
      "Propose creating a new patient record, or updating an existing one by passing its id. Omit id to create. " +
      "Staff must approve the change before it is saved; the result says whether they did. " +
      "Follow brain.md: ask for any required field you don't have instead of inventing one.",
    parameters: fromShape(patientFields),
    execute: async (_id, params) => outcomeResult(await propose("upsert_patient", params), redactPatient),
  });

  const list_visits = defineTool({
    name: "list_visits",
    label: "List Visits",
    description: `List visit records, optionally filtered to a single patient, up to ${MAX_LIST_RESULTS}.`,
    parameters: Type.Object({
      patientId: Type.Optional(Type.String({ description: "Only return visits for this patient id" })),
    }),
    execute: async (_id, params) => result(await listVisitsForModel(store, params.patientId)),
  });

  const upsert_visit = defineTool({
    name: "upsert_visit",
    label: "Create/Update Visit",
    description:
      "Propose creating a new visit, or updating an existing one by passing its id. Omit id to create a new visit " +
      "(intake). Staff must approve the change before it is saved; the result says whether they did. " +
      "treatmentLog/medications entries you pass are APPENDED to the existing log, never replacing it. " +
      "costs, if passed, REPLACES the full cost list and totalCost is recomputed automatically.",
    parameters: fromShape(visitFields),
    execute: async (_id, params) => outcomeResult(await propose("upsert_visit", params)),
  });

  return [list_patients, find_patient, upsert_patient, list_visits, upsert_visit].filter((tool) =>
    TOOL_NAMES[context].includes(tool.name),
  );
}
