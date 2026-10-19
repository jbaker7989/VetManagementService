#!/usr/bin/env node
// Local stdio MCP server exposing the clinic's patient/visit data to any
// MCP-speaking client (e.g. Claude Desktop). Reads/writes the same JSON files
// as the Express app, via the same lib/store.js — no HTTP hop, no dependency
// on server.js running. See SKILL.md in this folder for setup and tool docs.

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createAudit } from "../../lib/audit.js";
import { createStore } from "../../lib/store.js";
import { commitIntake, parseUpload, planIntake, sanitizeFilename } from "../../lib/intake.js";
import {
  findPatientForModel,
  listPatientsForModel,
  listVisitsForModel,
  MAX_LIST_RESULTS,
  redactPatient,
  toDataBlock,
} from "../../lib/modelViews.js";
import { patientFields, visitFields } from "../../lib/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.resolve(__dirname, "..");

const store = createStore({
  patientsPath: path.join(AGENT_DIR, "memory", "patients.json"),
  visitsPath: path.join(AGENT_DIR, "memory", "visits.json"),
});

const server = new McpServer({ name: "vet-clinic-mcp", version: "1.0.0" });

const audit = createAudit();
const sessionId = crypto.randomUUID(); // one stdio connection = one session

function textResult(value) {
  return { content: [{ type: "text", text: toDataBlock(value) }] };
}

function errorResult(err) {
  return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
}

// Every tool runs through here so each call is audited the same way.
async function run(tool, args, fn) {
  audit.toolCall({ tool, args, sessionId, source: "mcp" });
  try {
    return textResult(await fn());
  } catch (err) {
    return errorResult(err);
  }
}

server.registerTool(
  "list_patients",
  {
    title: "List Patients",
    description: `List patient (pet) records on file: id, pet name, species and owner first name only, up to ${MAX_LIST_RESULTS}.`,
    inputSchema: {},
  },
  async () => run("list_patients", {}, () => listPatientsForModel(store)),
);

server.registerTool(
  "find_patient",
  {
    title: "Find Patient",
    description:
      "Look up a single patient by id, or by pet name (optionally narrowed by owner name). " +
      "Owner phone, email and address are withheld.",
    inputSchema: {
      id: z.string().describe("Patient id, e.g. p-0001").optional(),
      name: z.string().describe("Pet's name").optional(),
      ownerName: z.string().describe("Owner's name, to disambiguate").optional(),
    },
  },
  async (params) => run("find_patient", params, () => findPatientForModel(store, params)),
);

server.registerTool(
  "upsert_patient",
  {
    title: "Create/Update Patient",
    description:
      "Create a new patient record, or update an existing one by passing its id. Omit id to create. " +
      "Follow the clinic's data model in brain.md: ask for any required field you don't have instead of inventing one.",
    inputSchema: patientFields,
  },
  async (params) => run("upsert_patient", params, async () => redactPatient(await store.upsertPatient(params, { source: "mcp", sessionId }))),
);

server.registerTool(
  "list_visits",
  {
    title: "List Visits",
    description: `List visit records, optionally filtered to a single patient, up to ${MAX_LIST_RESULTS}.`,
    inputSchema: {
      patientId: z.string().describe("Only return visits for this patient id").optional(),
    },
  },
  async (params) => run("list_visits", params, () => listVisitsForModel(store, params.patientId)),
);

server.registerTool(
  "upsert_visit",
  {
    title: "Create/Update Visit",
    description:
      "Create a new visit, or update an existing one by passing its id. Omit id to create a new visit " +
      "(intake). treatmentLog/medications entries you pass are APPENDED to the existing log, never replacing it. " +
      "costs, if passed, REPLACES the full cost list and totalCost is recomputed automatically.",
    inputSchema: visitFields,
  },
  async (params) => run("upsert_visit", params, () => store.upsertVisit(params, { source: "mcp", sessionId })),
);

server.registerTool(
  "bulk_intake",
  {
    title: "Bulk Intake",
    description:
      "Create/update patient records in bulk from already-structured CSV or JSON text (e.g. a spreadsheet export). " +
      "Each row/object is written via upsert_patient as-is — no LLM judgement is applied, so rows must already use " +
      "the patient field names from brain.md (name, species, breed, sex, owner.name, owner.phone, etc.).",
    inputSchema: {
      filename: z.string().describe("Original filename, used only to guess CSV vs JSON").optional(),
      content: z.string().describe("Raw CSV or JSON text content"),
    },
  },
  async ({ filename, content }) => {
    const name = sanitizeFilename(filename);
    return run("bulk_intake", { filename: name, content }, async () => {
      const upload = parseUpload(name, content);
      if (!upload.records) throw new Error("Content is not structured CSV or JSON patient data");
      if (upload.records.length === 0) throw new Error("No records found in file");

      return commitIntake(store, await planIntake(store, upload.records), { source: "mcp", sessionId });
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
