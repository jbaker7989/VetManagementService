#!/usr/bin/env node
// Local stdio MCP server exposing the clinic's patient/visit data to any
// MCP-speaking client (e.g. Claude Desktop). Reads/writes the same JSON files
// as the Express app, via the same lib/store.js — no HTTP hop, no dependency
// on server.js running. See SKILL.md in this folder for setup and tool docs.

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createStore } from "../../lib/store.js";
import { parseCsv } from "../../lib/csv.js";
import { getOrCreateSession } from "../../lib/agentSession.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.resolve(__dirname, "..");

const store = createStore({
  patientsPath: path.join(AGENT_DIR, "memory", "patients.json"),
  visitsPath: path.join(AGENT_DIR, "memory", "visits.json"),
});

const server = new McpServer({ name: "vet-clinic-mcp", version: "1.0.0" });

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function errorResult(err) {
  return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
}

const OwnerInput = {
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
};

server.registerTool(
  "list_patients",
  {
    title: "List Patients",
    description: "List all patient (pet) records currently on file, including owner info.",
    inputSchema: {},
  },
  async () => {
    try {
      return textResult(await store.listPatients());
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "find_patient",
  {
    title: "Find Patient",
    description: "Look up a single patient by id, or by pet name (optionally narrowed by owner name).",
    inputSchema: {
      id: z.string().describe("Patient id, e.g. p-0001").optional(),
      name: z.string().describe("Pet's name").optional(),
      ownerName: z.string().describe("Owner's name, to disambiguate").optional(),
    },
  },
  async (params) => {
    try {
      return textResult(await store.findPatient(params));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "upsert_patient",
  {
    title: "Create/Update Patient",
    description:
      "Create a new patient record, or update an existing one by passing its id. Omit id to create. " +
      "Follow the clinic's data model in brain.md: ask for any required field you don't have instead of inventing one.",
    inputSchema: {
      id: z.string().describe("Existing patient id to update; omit to create new").optional(),
      name: z.string().optional(),
      species: z.string().optional(),
      breed: z.string().optional(),
      sex: z.enum(["male", "female", "unknown"]).optional(),
      neutered: z.boolean().optional(),
      dateOfBirth: z.string().nullable().optional(),
      approximateAge: z.string().nullable().optional(),
      weightKg: z.number().nullable().optional(),
      distinguishingCharacteristics: z.string().nullable().optional(),
      owner: z.object(OwnerInput).optional(),
      isActive: z.boolean().describe("Set false if the pet has died").optional(),
      deathDate: z.string().nullable().optional(),
    },
  },
  async (params) => {
    try {
      return textResult(await store.upsertPatient(params));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "list_visits",
  {
    title: "List Visits",
    description: "List all visit records, optionally filtered to a single patient.",
    inputSchema: {
      patientId: z.string().describe("Only return visits for this patient id").optional(),
    },
  },
  async (params) => {
    try {
      const visits = await store.listVisits();
      const filtered = params.patientId ? visits.filter((v) => v.patientId === params.patientId) : visits;
      return textResult(filtered);
    } catch (err) {
      return errorResult(err);
    }
  },
);

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

server.registerTool(
  "upsert_visit",
  {
    title: "Create/Update Visit",
    description:
      "Create a new visit, or update an existing one by passing its id. Omit id to create a new visit " +
      "(intake). treatmentLog/medications entries you pass are APPENDED to the existing log, never replacing it. " +
      "costs, if passed, REPLACES the full cost list and totalCost is recomputed automatically.",
    inputSchema: {
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
    },
  },
  async (params) => {
    try {
      return textResult(await store.upsertVisit(params));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "bulk_intake",
  {
    title: "Bulk Intake",
    description:
      "Create/update patient records in bulk from already-structured CSV or JSON text (e.g. a spreadsheet export). " +
      "Each row/object is written via upsert_patient as-is — no LLM judgement is applied, so rows must already use " +
      "the patient field names from brain.md (name, species, breed, sex, owner.name, owner.phone, etc.). " +
      "For loosely-formatted or ambiguous data, use vet_agent_chat instead so a human-in-the-loop model can interpret it.",
    inputSchema: {
      filename: z.string().describe("Original filename, used only to guess CSV vs JSON").optional(),
      content: z.string().describe("Raw CSV or JSON text content"),
    },
  },
  async ({ filename, content }) => {
    try {
      let records;
      if (/\.json$/i.test(filename || "") || content.trim().startsWith("[") || content.trim().startsWith("{")) {
        const parsed = JSON.parse(content);
        records = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        records = parseCsv(content);
      }

      if (records.length === 0) {
        return errorResult(new Error("No records found in file"));
      }

      const results = [];
      for (const record of records) {
        const patient = await store.upsertPatient(record);
        results.push({ id: patient.id, name: patient.name });
      }
      return textResult({ count: results.length, patients: results });
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "vet_agent_chat",
  {
    title: "Ask the Vet Clinic Agent",
    description:
      "Hand a natural-language instruction to the clinic's pi-coding-agent, which can call list_patients, " +
      "find_patient, upsert_patient, list_visits, and upsert_visit on your behalf and follows the clinic's " +
      "ground rules (never guesses a diagnosis/dosage, asks for missing required fields). Use this for loosely " +
      "specified requests ('check in Bella for a walk-in, ear infection') instead of calling the CRUD tools " +
      "directly. Requires KIMI_API_KEY to be set in the environment.",
    inputSchema: {
      message: z.string().describe("Natural-language instruction or question for the clinic agent"),
      sessionId: z
        .string()
        .describe("Reuse an existing conversation by id to keep context across calls; omit to start a new one")
        .optional(),
    },
  },
  async ({ message, sessionId }) => {
    try {
      const id = sessionId || `mcp-${Date.now()}`;
      const session = await getOrCreateSession(id);
      let text = "";
      const unsubscribe = session.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
          text += event.assistantMessageEvent.delta;
        }
      });
      await session.prompt(message);
      unsubscribe();
      return { content: [{ type: "text", text }, { type: "text", text: `\n\n(sessionId: ${id})` }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
