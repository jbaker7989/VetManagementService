// Point-in-time snapshots of patients.json + visits.json and an append-only log of
// every record change, so an admin can restore the data or undo a single change
// (see scripts/restore.js). Callers serialize writes through the store's file locks.

import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { readJson, writeJson } from "./jsonFile.js";

const SNAPSHOT_PREFIX = "snapshot-";
// Matches the ids snapshot() generates; anything else could escape the backups directory.
const SNAPSHOT_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[0-9a-f]{6}$/;

export function createBackups({
  patientsPath,
  visitsPath,
  dir,
  maxSnapshots = Number(process.env.BACKUP_MAX_SNAPSHOTS) || 100,
  maxChanges = Number(process.env.BACKUP_MAX_CHANGES) || 5000,
}) {
  const changesPath = path.join(dir, "changes.jsonl");
  const olderChangesPath = path.join(dir, "changes.1.jsonl");
  const pathsByType = { patient: patientsPath, visit: visitsPath };
  let lastKey = null;

  const snapshotPath = (id) => path.join(dir, `${SNAPSHOT_PREFIX}${id}.json`);

  async function listSnapshotIds() {
    try {
      const names = await fs.readdir(dir);
      return names
        .filter((n) => n.startsWith(SNAPSHOT_PREFIX) && n.endsWith(".json"))
        .map((n) => n.slice(SNAPSHOT_PREFIX.length, -".json".length))
        .sort();
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }

  async function readSnapshot(id) {
    try {
      return JSON.parse(await fs.readFile(snapshotPath(id), "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") throw new Error(`No snapshot with id ${id}`);
      throw err;
    }
  }

  // Resolves to the new snapshot id, or null when nothing changed since the last one.
  async function snapshot(trigger) {
    const [patients, visits] = await Promise.all([readJson(patientsPath), readJson(visitsPath)]);
    const key = JSON.stringify({ patients, visits });
    if (key === lastKey) return null;

    await fs.mkdir(dir, { recursive: true });
    const createdAt = new Date().toISOString();
    const id = `${createdAt.replace(/:/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
    await writeJson(snapshotPath(id), { id, createdAt, trigger, patients, visits });
    lastKey = key;

    for (const old of (await listSnapshotIds()).slice(0, -maxSnapshots)) await fs.rm(snapshotPath(old), { force: true });
    return id;
  }

  async function listSnapshots() {
    const snapshots = await Promise.all((await listSnapshotIds()).map(readSnapshot));
    return snapshots.map(({ id, createdAt, trigger, patients, visits }) => ({
      id,
      createdAt,
      trigger,
      patients: patients.length,
      visits: visits.length,
    }));
  }

  async function recordChange({ source, sessionId }, type, before, after) {
    const entry = {
      id: crypto.randomBytes(4).toString("hex"),
      at: new Date().toISOString(),
      source: source ?? "unknown",
      sessionId: sessionId ?? null,
      type,
      recordId: after.id,
      before,
      after,
    };
    await fs.mkdir(dir, { recursive: true });
    if ((await readChangeLines(changesPath)).length >= maxChanges) await fs.rename(changesPath, olderChangesPath);
    await fs.appendFile(changesPath, JSON.stringify(entry) + "\n", "utf8");
  }

  async function readChangeLines(file) {
    try {
      return (await fs.readFile(file, "utf8")).split("\n").filter(Boolean);
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }

  // The log rotates once into changes.1.jsonl, so this covers the newest maxChanges to 2 * maxChanges entries.
  async function listChanges() {
    const lines = [...(await readChangeLines(olderChangesPath)), ...(await readChangeLines(changesPath))];
    return lines.map((line) => JSON.parse(line));
  }

  // Replaces both data files with the snapshot's contents; returns the safety snapshot of what was there.
  async function restoreSnapshot(id) {
    if (!SNAPSHOT_ID.test(id)) throw new Error(`Invalid snapshot id ${id}`);
    const { patients, visits } = await readSnapshot(id);
    const safetyId = await snapshot("before-restore");
    await writeJson(patientsPath, patients);
    await writeJson(visitsPath, visits);
    return safetyId;
  }

  // Puts the record back as it was before the change (or removes it if the change created it).
  async function revertChange(id, { force = false } = {}) {
    const change = (await listChanges()).find((c) => c.id === id);
    if (!change) throw new Error(`No change with id ${id}`);

    const file = pathsByType[change.type];
    const records = await readJson(file);
    const idx = records.findIndex((r) => r.id === change.recordId);
    if (!force && !isDeepStrictEqual(records[idx] ?? null, change.after)) {
      throw new Error(`${change.type} ${change.recordId} has changed since change ${id}; use --force to revert it anyway`);
    }

    const safetyId = await snapshot("before-revert");
    if (change.before && idx === -1) records.push(change.before);
    else if (change.before) records[idx] = change.before;
    else if (idx !== -1) records.splice(idx, 1);
    await writeJson(file, records);
    return safetyId;
  }

  return { snapshot, listSnapshots, recordChange, listChanges, restoreSnapshot, revertChange };
}
