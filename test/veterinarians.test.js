import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVeterinarianRoster } from "../lib/veterinarians.js";
import { startTestApp } from "./helpers/app.js";

const realRosterPath = path.resolve(new URL("../agent-home/veterinarians.json", import.meta.url).pathname);

async function tempRoster(t, content) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vet-roster-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "veterinarians.json");
  if (content !== undefined) await writeFile(file, typeof content === "string" ? content : JSON.stringify(content));
  return file;
}

const vets = [
  { id: "vet-a", name: "Dr. A Example", specialty: "General" },
  { id: "vet-b", name: "Dr. B Example" },
];

test("AC1: the shipped roster has exactly 5 valid, unique 'Dr.' veterinarians", async () => {
  const roster = createVeterinarianRoster({ path: realRosterPath });
  const list = await roster.list();
  assert.equal(list.length, 5);
  assert.equal(new Set(list.map((v) => v.id)).size, 5, "ids are unique");
  assert.equal(new Set(list.map((v) => v.name)).size, 5, "names are unique");
  for (const vet of list) assert.match(vet.name, /^Dr\. \S/, `${vet.id} name starts with 'Dr. '`);
  assert.equal(JSON.parse(await readFile(realRosterPath, "utf8")).length, 5, "no entries dropped by the loader");
});

test("AC2: roster loader returns a valid file and get() finds by id or returns null", async (t) => {
  const roster = createVeterinarianRoster({ path: await tempRoster(t, vets) });
  assert.deepEqual(await roster.list(), vets);
  assert.deepEqual(await roster.get("vet-b"), vets[1]);
  assert.equal(await roster.get("vet-zzz"), null);
});

test("AC2: a missing roster file throws and names the problem instead of returning an empty list", async (t) => {
  const roster = createVeterinarianRoster({ path: await tempRoster(t) });
  await assert.rejects(roster.list(), /Cannot read veterinarian roster/);
  await assert.rejects(roster.get("vet-a"), /Cannot read veterinarian roster/);
});

test("AC2: malformed JSON, wrong shape, and duplicate ids are rejected", async (t) => {
  await assert.rejects(createVeterinarianRoster({ path: await tempRoster(t, "{not json") }).list(), /Cannot read veterinarian roster/);
  await assert.rejects(createVeterinarianRoster({ path: await tempRoster(t, { id: "vet-a" }) }).list(), /Invalid veterinarian roster/);
  await assert.rejects(createVeterinarianRoster({ path: await tempRoster(t, [{ id: "vet-a" }]) }).list(), /Invalid veterinarian roster/);
  await assert.rejects(createVeterinarianRoster({ path: await tempRoster(t, [{ id: "", name: "Dr. X" }]) }).list(), /Invalid veterinarian roster/);
  await assert.rejects(
    createVeterinarianRoster({ path: await tempRoster(t, [vets[0], { ...vets[1], id: "vet-a" }]) }).list(),
    /ids must be unique/,
  );
});

test("AC2: the roster is re-read on every call so an administrator's edit applies without restart", async (t) => {
  const file = await tempRoster(t, [vets[0]]);
  const roster = createVeterinarianRoster({ path: file });
  assert.equal((await roster.list()).length, 1);
  await writeFile(file, JSON.stringify(vets));
  assert.equal((await roster.list()).length, 2);
});

test("AC2: GET /api/veterinarians returns 200 with the injected roster", async (t) => {
  const roster = createVeterinarianRoster({ path: await tempRoster(t, vets) });
  const app = await startTestApp({ veterinarians: roster });
  t.after(() => app.close());
  const response = await fetch(`${app.url}/api/veterinarians`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), vets);
});

test("AC2: GET /api/veterinarians with the real roster file serves the 5 shipped vets", async (t) => {
  const app = await startTestApp();
  t.after(() => app.close());
  const response = await fetch(`${app.url}/api/veterinarians`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).length, 5);
});

test("AC2: a broken roster file yields a clear 500, never an empty list, and does not leak a filesystem path", async (t) => {
  const file = await tempRoster(t, "{not json");
  const app = await startTestApp({ veterinarians: createVeterinarianRoster({ path: file }) });
  t.after(() => app.close());
  const response = await fetch(`${app.url}/api/veterinarians`);
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.match(body.error, /veterinarian roster/);
  assert.deepEqual(Object.keys(body), ["error"]);
  // Info disclosure: the loader embeds the absolute path in its message and the route echoes it.
  assert.equal(body.error.includes(file) || /\/(tmp|var|Users|home)\//.test(body.error), false, `response leaks a filesystem path: ${body.error}`);
});
