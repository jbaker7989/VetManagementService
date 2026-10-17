import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeJson } from "../lib/jsonFile.js";
import { createBackups } from "../lib/backups.js";
import { commitIntake, planIntake } from "../lib/intake.js";
import { createApprovalGate } from "../lib/approvalGate.js";
import { createStore } from "../lib/store.js";
import { createTempStore } from "./helpers/app.js";

const repo = path.resolve(new URL("..", import.meta.url).pathname);
const cli = path.join(repo, "scripts/restore.js");

async function runCli(dataDir, ...args) {
  const child = spawn(process.execPath, [cli, "--data-dir", dataDir, ...args]);
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const [status, signal] = await once(child, "close");
  return { status, signal, stdout, stderr };
}

test("each store mutation and committed intake snapshots pre-change state and logs its source", async (t) => {
  const temp = await createTempStore({ patients: [{ id: "p-0001", name: "Miso", species: "cat" }] });
  t.after(() => temp.close());
  await temp.store.upsertPatient({ id: "p-0001", name: "Miso Updated" }, { source: "chat", sessionId: "s1" });
  await temp.store.upsertVisit({ patientId: "p-0001", diagnosis: "checkup" }, { source: "mcp", sessionId: "s2" });
  const plan = await planIntake(temp.store, [{ name: "Pip", species: "dog" }]);
  await commitIntake(temp.store, plan, { source: "upload-confirm", sessionId: "s3" });
  const gate = createApprovalGate({ store: temp.store, timeoutMs: 1000 });
  const pending = gate.propose("s4", "upsert_patient", { name: "Approved", species: "cat" }, "chat");
  const [action] = gate.list("s4");
  await gate.approve("s4", action.id);
  await pending;
  const intakeProposal = gate.propose("s5", "upsert_patient", { name: "Fallback", species: "cat" }, "intake");
  const [intakeAction] = gate.list("s5");
  await gate.approve("s5", intakeAction.id);
  await intakeProposal;

  const changes = await temp.store.snapshot();
  assert.ok(changes, "scheduled snapshot records mutations since the pre-change snapshot");
  const changesPath = path.join(path.dirname(temp.patientsPath), "backups/changes.jsonl");
  const entriesText = (await readFile(changesPath, "utf8")).trim().split("\n").join(",");
  const entries = JSON.parse(`[${entriesText}]`);
  assert.deepEqual(entries.map(({ source, sessionId, type }) => ({ source, sessionId, type })), [
    { source: "chat", sessionId: "s1", type: "patient" },
    { source: "mcp", sessionId: "s2", type: "visit" },
    { source: "upload-confirm", sessionId: "s3", type: "patient" },
    { source: "chat", sessionId: "s4", type: "patient" },
    { source: "intake", sessionId: "s5", type: "patient" },
  ]);
  assert.deepEqual(entries.map(({ before }) => before), [
    { id: "p-0001", name: "Miso", species: "cat" },
    null,
    null,
    null,
    null,
  ]);
  assert.deepEqual(
    entries.map(({ after }) => after.name ?? after.patientId),
    ["Miso Updated", "p-0001", "Pip", "Approved", "Fallback"],
  );
  const snapshots = await temp.store.snapshot();
  assert.equal(snapshots, null, "scheduled snapshot skips data unchanged since the prior snapshot");
  const names = await readdir(path.join(path.dirname(temp.patientsPath), "backups"));
  assert.equal(names.some((name) => name.endsWith(".tmp")), false);
});

test("snapshot content is captured before each mutation and retention keeps newest snapshots", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vet-backup-retention-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const patientsPath = path.join(dir, "patients.json");
  const visitsPath = path.join(dir, "visits.json");
  await writeFile(patientsPath, "[]");
  await writeFile(visitsPath, "[]");
  const store = createStore({ patientsPath, visitsPath });
  await store.upsertPatient({ name: "First", species: "cat" });
  const backupDir = path.join(dir, "backups");
  const firstName = (await readdir(backupDir)).find((name) => name.endsWith(".json"));
  const firstSnapshot = JSON.parse(await readFile(path.join(backupDir, firstName), "utf8"));
  assert.deepEqual(firstSnapshot.patients, []);
  await store.upsertPatient({ name: "Second", species: "dog" });
  assert.ok(await store.snapshot());
  assert.equal(await store.snapshot(), null);

  const { createBackups } = await import("../lib/backups.js");
  const backups = createBackups({ patientsPath, visitsPath, dir: backupDir, maxSnapshots: 1 });
  await backups.snapshot("scheduled");
  await writeFile(visitsPath, JSON.stringify([{ id: "v1" }]));
  await backups.snapshot("scheduled");
  assert.equal((await backups.listSnapshots()).length, 1);
});

test("JSON writes leave no temporary file on success and preserve existing data when rename fails", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vet-json-atomic-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "data.json");
  await writeJson(file, [{ value: "old" }]);
  assert.equal((await readdir(dir)).some((name) => name.endsWith(".tmp")), false);

  const blocked = path.join(dir, "blocked");
  await mkdir(blocked);
  await writeFile(path.join(blocked, "marker"), "original");
  await assert.rejects(writeJson(blocked, [{ value: "new" }]));
  assert.equal(await readFile(path.join(blocked, "marker"), "utf8"), "original");
  assert.equal(
    (await readdir(dir)).some((name) => name.endsWith(".tmp")),
    false,
    "failed writes clean up their temporary file",
  );
});

test("parallel writes and snapshots leave valid JSON and preserve every patient", async (t) => {
  const temp = await createTempStore();
  t.after(() => temp.close());
  await Promise.all(Array.from({ length: 24 }, async (_, i) => {
    await temp.store.upsertPatient({ name: `Pet ${i}`, species: "cat" }, { source: "test", sessionId: `s${i}` });
    await temp.store.snapshot();
  }));
  const patients = JSON.parse(await readFile(temp.patientsPath, "utf8"));
  const visits = JSON.parse(await readFile(temp.visitsPath, "utf8"));
  assert.equal(patients.length, 24);
  assert.equal(new Set(patients.map(({ name }) => name)).size, 24);
  assert.deepEqual(visits, []);
  assert.equal((await temp.store.snapshot()), null);
});

test("restore, revert, refusal, forced revert, and command errors work through the recovery CLI", async (t) => {
  const temp = await createTempStore({ patients: [{ id: "p-0001", name: "Before", species: "cat" }] });
  t.after(() => temp.close());
  await temp.store.upsertPatient({ id: "p-0001", name: "After" }, { source: "chat", sessionId: "restore-test" });
  const backupDir = path.join(path.dirname(temp.patientsPath), "backups");
  const snapshotName = (await readdir(backupDir)).find((name) => name.endsWith(".json"));
  const snapshotId = snapshotName.replace(/^snapshot-/, "").replace(/\.json$/, "");
  assert.ok(await temp.store.snapshot());
  const listedSnapshots = await runCli(path.dirname(temp.patientsPath), "list-snapshots");
  const listedChanges = await runCli(path.dirname(temp.patientsPath), "list-changes");
  assert.equal(listedSnapshots.status, 0, listedSnapshots.stderr);
  assert.match(listedSnapshots.stdout, new RegExp(snapshotId));
  assert.equal(listedChanges.status, 0);
  const backups = createBackups({
    patientsPath: temp.patientsPath,
    visitsPath: temp.visitsPath,
    dir: backupDir,
  });
  const changeId = (await backups.listChanges())[0].id;
  const restore = await runCli(path.dirname(temp.patientsPath), "restore", snapshotId);
  assert.equal(restore.status, 0, restore.stderr || "restore command failed");
  assert.equal(JSON.parse(await readFile(temp.patientsPath, "utf8"))[0].name, "Before");
  assert.match(restore.stdout, /previous state saved as snapshot/);
  const safetyNames = (await readdir(backupDir)).filter((name) => name.endsWith(".json"));
  const safetySnapshots = await Promise.all(safetyNames.map(async (name) =>
    JSON.parse(await readFile(path.join(backupDir, name), "utf8")),
  ));
  assert.ok(
    safetySnapshots.some((snapshot) => snapshot.patients[0]?.name === "After"),
    "restore snapshots the replaced state first",
  );

  await temp.store.upsertPatient({ id: "p-0001", name: "Changed again" }, { source: "chat", sessionId: "s" });
  const refusal = await runCli(path.dirname(temp.patientsPath), "revert", changeId);
  assert.equal(refusal.status, 1);
  assert.match(refusal.stderr, /has changed since change/);
  assert.equal((await runCli(path.dirname(temp.patientsPath), "revert", changeId, "--force")).status, 0);
  assert.equal(JSON.parse(await readFile(temp.patientsPath, "utf8"))[0].name, "Before");
  assert.equal((await runCli(path.dirname(temp.patientsPath), "restore", "unknown")).status, 1);
  assert.equal((await runCli(path.dirname(temp.patientsPath), "nonsense")).status, 2);

  await temp.store.upsertPatient(
    { name: "Created for revert", species: "cat" },
    { source: "chat", sessionId: "create-revert" },
  );
  const createChange = (await backups.listChanges()).find((change) => change.after.name === "Created for revert");
  assert.equal((await runCli(path.dirname(temp.patientsPath), "revert", createChange.id)).status, 0);
  assert.equal((await temp.store.listPatients()).some(({ name }) => name === "Created for revert"), false);
});

test("CLI can rehearse recovery from an approved malicious-looking mutation", async (t) => {
  const before = [{ id: "p-0001", name: "Miso", species: "cat", isActive: true, notes: "healthy" }];
  const temp = await createTempStore({
    patients: before,
    visits: [{ id: "v-0001", patientId: "p-0001", medications: [] }],
  });
  t.after(() => temp.close());
  const priorContent = JSON.parse(await readFile(temp.patientsPath, "utf8"));
  await temp.store.upsertPatient(
    { id: "p-0001", isActive: false, notes: "false clinical alert" },
    { source: "chat", sessionId: "incident" },
  );
  await temp.store.upsertVisit(
    {
      id: "v-0001",
      medications: [{ name: "Injected drug", dosage: "1000", frequency: "hourly", route: "oral" }],
    },
    { source: "chat", sessionId: "incident" },
  );
  assert.equal(JSON.parse(await readFile(temp.patientsPath, "utf8"))[0].isActive, false);

  const backupDir = path.join(path.dirname(temp.patientsPath), "backups");
  const snapshotNames = (await readdir(backupDir)).filter((name) => name.endsWith(".json"));
  const snapshots = await Promise.all(snapshotNames.map(async (name) => ({
    name,
    contents: JSON.parse(await readFile(path.join(backupDir, name), "utf8")),
  })));
  const matchingSnapshot = snapshots.find(
    ({ contents }) => JSON.stringify(contents.patients) === JSON.stringify(priorContent),
  );
  const snapshot = matchingSnapshot?.name.replace(/^snapshot-/, "").replace(/\.json$/, "");
  assert.ok(snapshot, "a snapshot contains the exact pre-incident state");
  const recovered = await runCli(path.dirname(temp.patientsPath), "restore", snapshot);
  assert.equal(recovered.status, 0, recovered.stderr || "restore command failed");
  assert.deepEqual(JSON.parse(await readFile(temp.patientsPath, "utf8")), priorContent);
  assert.deepEqual(
    JSON.parse(await readFile(temp.visitsPath, "utf8")),
    [{ id: "v-0001", patientId: "p-0001", medications: [] }],
  );
});

test("CLI restore rejects snapshot identifiers that escape the backups directory", async (t) => {
  const temp = await createTempStore({ patients: [{ id: "p-0001", name: "Original", species: "cat" }] });
  t.after(() => temp.close());
  const escapedSnapshot = path.join(temp.directory, "escape.json");
  await writeFile(
    escapedSnapshot,
    JSON.stringify({ patients: [{ id: "p-9999", name: "Injected", species: "cat" }], visits: [] }),
  );

  const result = await runCli(path.dirname(temp.patientsPath), "restore", "../../../../escape");
  assert.equal(result.status, 1);
  assert.deepEqual(
    JSON.parse(await readFile(temp.patientsPath, "utf8")),
    [{ id: "p-0001", name: "Original", species: "cat" }],
  );
});
