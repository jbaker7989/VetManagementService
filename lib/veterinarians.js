// The clinic's veterinarian roster: reference data an administrator edits by hand in
// agent-home/veterinarians.json. It is re-read on every call so edits apply without a restart.
// Unlike the patient/visit files, a missing or malformed roster is an error, never an empty list.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const DEFAULT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "agent-home", "veterinarians.json");

const Roster = z
  .array(
    z.object({
      id: z.string().min(1).max(50),
      name: z.string().min(1).max(200),
      specialty: z.string().max(200).optional(),
    }),
  )
  .refine((vets) => new Set(vets.map((v) => v.id)).size === vets.length, { message: "veterinarian ids must be unique" });

// Clients see only the message; the cause carries the file path and parse details for server logs.
const rosterError = (message, cause) => Object.assign(new Error(message, { cause }), { status: 500, expose: true });

export function createVeterinarianRoster({ path: rosterPath = DEFAULT_PATH } = {}) {
  async function list() {
    let parsed;
    try {
      parsed = Roster.safeParse(JSON.parse(await fs.readFile(rosterPath, "utf8")));
    } catch (err) {
      throw rosterError("Cannot read veterinarian roster", new Error(`${rosterPath}: ${err.message}`));
    }
    if (!parsed.success) {
      throw rosterError(`Invalid veterinarian roster: ${parsed.error.issues.map((i) => i.message).join("; ")}`, new Error(rosterPath));
    }
    return parsed.data;
  }

  async function get(id) {
    return (await list()).find((v) => v.id === id) ?? null;
  }

  return { list, get };
}
