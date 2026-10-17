#!/usr/bin/env node
// Admin-only recovery tool for the clinic data files; deliberately not exposed over HTTP.
// Stop the server before restoring or reverting (see README, "Backups and recovery").

import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createBackups } from "../lib/backups.js";

const USAGE = `Usage: npm run restore -- <command> [--data-dir <dir>]
  list-snapshots                list point-in-time snapshots
  list-changes                  list recorded record changes
  restore <snapshot-id>         restore both data files from a snapshot
  revert <change-id> [--force]  undo one change (refuses if the record changed since)`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "data-dir": { type: "string", default: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "agent-home", "memory") },
    force: { type: "boolean", default: false },
  },
});
const [command, id] = positionals;
const dataDir = path.resolve(values["data-dir"]);
const backups = createBackups({
  patientsPath: path.join(dataDir, "patients.json"),
  visitsPath: path.join(dataDir, "visits.json"),
  dir: path.join(dataDir, "backups"),
});

try {
  if (command === "list-snapshots") {
    for (const s of await backups.listSnapshots()) {
      console.log(`${s.id}  ${s.createdAt}  ${s.trigger}  ${s.patients} patients, ${s.visits} visits`);
    }
  } else if (command === "list-changes") {
    for (const c of await backups.listChanges()) {
      console.log(`${c.id}  ${c.at}  ${c.source}  session=${c.sessionId ?? "-"}  ${c.before ? "updated" : "created"} ${c.type} ${c.recordId}`);
    }
  } else if (command === "restore" && id) {
    console.log(`Restored snapshot ${id}; previous state saved as snapshot ${await backups.restoreSnapshot(id)}`);
  } else if (command === "revert" && id) {
    console.log(`Reverted change ${id}; previous state saved as snapshot ${await backups.revertChange(id, { force: values.force })}`);
  } else {
    console.error(USAGE);
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
}
