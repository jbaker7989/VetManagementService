// Simple JSON-file-backed data store for patients + visits.
// All reads/writes are serialized per-file so concurrent tool calls / requests can't race.

import { promises as fs } from "node:fs";

const locks = new Map();

function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

async function readJson(path) {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeJson(path, data) {
  await fs.writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function nextId(records, prefix) {
  let max = 0;
  for (const r of records) {
    const m = /^[a-z]+-(\d+)$/i.exec(r.id || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

export function createStore({ patientsPath, visitsPath }) {
  function listPatients() {
    return withLock(patientsPath, () => readJson(patientsPath));
  }

  function listVisits() {
    return withLock(visitsPath, () => readJson(visitsPath));
  }

  async function findPatient({ id, name, ownerName }) {
    const patients = await listPatients();
    if (id) return patients.find((p) => p.id === id) || null;
    if (name) {
      const nameLower = name.toLowerCase();
      const ownerLower = (ownerName || "").toLowerCase();
      return (
        patients.find(
          (p) =>
            p.name.toLowerCase() === nameLower &&
            (!ownerName || (p.owner?.name || "").toLowerCase() === ownerLower),
        ) || null
      );
    }
    return null;
  }

  async function upsertPatient(fields) {
    return withLock(patientsPath, async () => {
      const patients = await readJson(patientsPath);
      const now = new Date().toISOString();
      let record;

      if (fields.id) {
        const idx = patients.findIndex((p) => p.id === fields.id);
        if (idx === -1) throw new Error(`No patient with id ${fields.id}`);
        record = { ...patients[idx], ...fields, owner: { ...patients[idx].owner, ...(fields.owner || {}) } };
        record.updatedAt = now;
        if (Object.prototype.hasOwnProperty.call(fields, "isActive")) {
          record.deathDate = fields.isActive ? null : fields.deathDate || now;
        }
        patients[idx] = record;
      } else {
        record = {
          id: nextId(patients, "p"),
          name: fields.name,
          species: fields.species,
          breed: fields.breed ?? "mixed/unknown",
          sex: fields.sex ?? "unknown",
          neutered: fields.neutered ?? false,
          dateOfBirth: fields.dateOfBirth ?? null,
          approximateAge: fields.approximateAge ?? null,
          weightKg: fields.weightKg ?? null,
          distinguishingCharacteristics: fields.distinguishingCharacteristics ?? null,
          owner: {
            name: fields.owner?.name ?? null,
            phone: fields.owner?.phone ?? null,
            email: fields.owner?.email ?? null,
            address: fields.owner?.address ?? null,
          },
          createdAt: now,
          updatedAt: now,
          isActive: true,
          deathDate: null,
        };
        patients.push(record);
      }

      await writeJson(patientsPath, patients);
      return record;
    });
  }

  async function upsertVisit(fields) {
    return withLock(visitsPath, async () => {
      const visits = await readJson(visitsPath);
      const now = new Date().toISOString();
      let record;

      const costs = fields.costs ?? undefined;
      const totalCost = costs ? costs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) : undefined;

      if (fields.id) {
        const idx = visits.findIndex((v) => v.id === fields.id);
        if (idx === -1) throw new Error(`No visit with id ${fields.id}`);
        const existing = visits[idx];
        record = {
          ...existing,
          ...fields,
          treatmentLog: fields.treatmentLog ? [...(existing.treatmentLog || []), ...fields.treatmentLog] : existing.treatmentLog,
          medications: fields.medications ? [...(existing.medications || []), ...fields.medications] : existing.medications,
          costs: costs ?? existing.costs,
          totalCost: totalCost ?? existing.totalCost,
          followUp: fields.followUp ? { ...existing.followUp, ...fields.followUp } : existing.followUp,
        };
        record.updatedAt = now;
        visits[idx] = record;
      } else {
        record = {
          id: nextId(visits, "v"),
          patientId: fields.patientId,
          intakeType: fields.intakeType ?? "walk-in",
          scheduledAt: fields.scheduledAt ?? null,
          checkedInAt: fields.checkedInAt ?? now,
          assignedVeterinarian: fields.assignedVeterinarian ?? null,
          reasonForVisit: fields.reasonForVisit ?? null,
          diagnosis: fields.diagnosis ?? null,
          status: fields.status ?? "checked-in",
          treatmentLog: fields.treatmentLog ?? [],
          medications: fields.medications ?? [],
          costs: costs ?? [],
          totalCost: totalCost ?? 0,
          followUp: fields.followUp ?? { scheduled: false, date: null, reason: null },
          createdAt: now,
          updatedAt: now,
        };
        visits.push(record);
      }

      await writeJson(visitsPath, visits);
      return record;
    });
  }

  return { listPatients, listVisits, findPatient, upsertPatient, upsertVisit };
}
