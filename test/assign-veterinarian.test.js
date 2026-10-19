import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createVeterinarianRoster } from "../lib/veterinarians.js";
import { createBackups } from "../lib/backups.js";
import { startTestApp } from "./helpers/app.js";

const vets = [
  { id: "vet-a", name: "Dr. A Example" },
  { id: "vet-b", name: "Dr. B Example" },
  { id: "vet-x", name: "Dr. <img src=x onerror=alert(1)>" },
];
const XSS = "<img src=x onerror=alert(1)>";
const rex = { id: "p-0001", name: "Rex", species: "dog", owner: { name: "Sam Owner", phone: "555-0100", email: "sam@example.com", address: "1 Secret St" } };
const visit = (over) => ({ id: "v-0001", patientId: "p-0001", status: "checked-in", reasonForVisit: "Limp", assignedVeterinarian: null, ...over });

async function setup(t, { visits = [], patients = [rex] } = {}) {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const dir = await mkdtemp(path.join(os.tmpdir(), "vet-roster-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const rosterPath = path.join(dir, "veterinarians.json");
  await writeFile(rosterPath, JSON.stringify(vets));
  const app = await startTestApp({ patients, visits, veterinarians: createVeterinarianRoster({ path: rosterPath }) });
  t.after(() => app.close());
  return app;
}

const assign = (app, id, body, headers = {}) =>
  fetch(`${app.url}/api/patients/${id}/assign-veterinarian`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "vet-agent", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const visitsOf = async (app) => JSON.parse(await readFile(app.visitsPath, "utf8"));

test("AC3: assigning updates the open visit and stores the roster NAME, not the id", async (t) => {
  const app = await setup(t, { visits: [visit()] });
  const res = await assign(app, "p-0001", { veterinarianId: "vet-a" });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.equal(saved.id, "v-0001");
  assert.equal(saved.assignedVeterinarian, "Dr. A Example");
  const stored = await visitsOf(app);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].assignedVeterinarian, "Dr. A Example");
  assert.equal(stored[0].reasonForVisit, "Limp", "other fields untouched");
});

test("AC3: reassigning replaces the vet and clearing with null unassigns, on the same visit", async (t) => {
  const app = await setup(t, { visits: [visit({ assignedVeterinarian: "Dr. A Example" })] });
  assert.equal((await (await assign(app, "p-0001", { veterinarianId: "vet-b" })).json()).assignedVeterinarian, "Dr. B Example");
  const cleared = await assign(app, "p-0001", { veterinarianId: null });
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json()).assignedVeterinarian, null);
  const stored = await visitsOf(app);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].assignedVeterinarian, null);
});

test("AC3: a closed visit is never updated; the pet is checked in on a NEW visit", async (t) => {
  const app = await setup(t, { visits: [visit({ status: "closed", assignedVeterinarian: "Dr. B Example" })] });
  const res = await assign(app, "p-0001", { veterinarianId: "vet-a", reasonForVisit: "Vaccines" });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.notEqual(saved.id, "v-0001");
  assert.equal(saved.status, "checked-in");
  assert.equal(saved.reasonForVisit, "Vaccines");
  const stored = await visitsOf(app);
  assert.equal(stored.length, 2);
  assert.equal(stored[0].assignedVeterinarian, "Dr. B Example", "closed visit untouched");
  assert.equal(stored[0].status, "closed");
});

test("AC3: with no visits at all, check-in creates a checked-in visit with reason and vet", async (t) => {
  const app = await setup(t);
  const res = await assign(app, "p-0001", { veterinarianId: "vet-b", reasonForVisit: "Itchy ear" });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.deepEqual(
    { patientId: saved.patientId, status: saved.status, reasonForVisit: saved.reasonForVisit, assignedVeterinarian: saved.assignedVeterinarian },
    { patientId: "p-0001", status: "checked-in", reasonForVisit: "Itchy ear", assignedVeterinarian: "Dr. B Example" },
  );
});

test("AC3: when the latest visit is closed but an older one is open, the older open visit is updated (no new visit)", async (t) => {
  const app = await setup(t, {
    visits: [visit({ id: "v-0001", status: "in-treatment" }), visit({ id: "v-0002", status: "closed", reasonForVisit: "Later, closed" })],
  });
  const res = await assign(app, "p-0001", { veterinarianId: "vet-a" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, "v-0001");
  const stored = await visitsOf(app);
  assert.equal(stored.length, 2);
  assert.equal(stored[1].assignedVeterinarian, null);
});

test("AC3: with several open visits the most recent open one is updated", async (t) => {
  const app = await setup(t, { visits: [visit({ id: "v-0001" }), visit({ id: "v-0002" })] });
  assert.equal((await (await assign(app, "p-0001", { veterinarianId: "vet-a" })).json()).id, "v-0002");
});

test("AC3: another pet's open visit is not touched", async (t) => {
  const app = await setup(t, { patients: [rex, { id: "p-0002", name: "Miso", species: "cat" }], visits: [visit({ patientId: "p-0002", id: "v-0001" })] });
  const res = await assign(app, "p-0001", { veterinarianId: "vet-a", reasonForVisit: "Checkup" });
  assert.equal(res.status, 200);
  const stored = await visitsOf(app);
  assert.equal(stored.length, 2);
  assert.equal(stored[0].assignedVeterinarian, null);
});

test("AC3: validation errors return 400 and change nothing", async (t) => {
  const app = await setup(t, { visits: [visit({ status: "closed" })] });
  const cases = [
    ["check-in without a reason", { veterinarianId: "vet-a" }],
    ["check-in with a blank reason", { veterinarianId: "vet-a", reasonForVisit: "   " }],
    ["null with no open visit", { veterinarianId: null }],
    ["unknown veterinarianId", { veterinarianId: "vet-nope", reasonForVisit: "x" }],
    ["numeric veterinarianId", { veterinarianId: 7, reasonForVisit: "x" }],
    ["missing veterinarianId", { reasonForVisit: "x" }],
    ["reason over 1000 chars", { veterinarianId: "vet-a", reasonForVisit: "x".repeat(1001) }],
    ["non-string reason", { veterinarianId: "vet-a", reasonForVisit: { a: 1 } }],
    ["array body", []],
    ["empty body", {}],
  ];
  for (const [label, body] of cases) {
    const res = await assign(app, "p-0001", body);
    assert.equal(res.status, 400, label);
    assert.equal(typeof (await res.json()).error, "string", label);
  }
  assert.equal((await visitsOf(app)).length, 1, "no visit was created by any rejected request");
});

test("AC3: malformed JSON body is rejected with a 4xx, not a crash", async (t) => {
  const app = await setup(t);
  const res = await assign(app, "p-0001", "{nope");
  assert.equal(res.status, 400);
});

test("AC3: unknown patient returns 404, checked before any write", async (t) => {
  const app = await setup(t);
  const res = await assign(app, "p-9999", { veterinarianId: "vet-a", reasonForVisit: "x" });
  assert.equal(res.status, 404);
  assert.deepEqual(await visitsOf(app), []);
});

test("AC3: requests without X-Requested-With or from a foreign Origin get 403 and change nothing", async (t) => {
  const app = await setup(t, { visits: [visit()] });
  const noHeader = await fetch(`${app.url}/api/patients/p-0001/assign-veterinarian`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ veterinarianId: "vet-a" }),
  });
  assert.equal(noHeader.status, 403);
  const foreign = await assign(app, "p-0001", { veterinarianId: "vet-a" }, { Origin: "http://evil.example" });
  assert.equal(foreign.status, 403);
  assert.equal((await visitsOf(app))[0].assignedVeterinarian, null);
});

test("AC3: submitting the same check-in twice in sequence updates the visit instead of duplicating it", async (t) => {
  const app = await setup(t);
  const body = { veterinarianId: "vet-a", reasonForVisit: "Limp" };
  assert.equal((await assign(app, "p-0001", body)).status, 200);
  assert.equal((await assign(app, "p-0001", body)).status, 200);
  assert.equal((await visitsOf(app)).length, 1);
});

test("AC3: two simultaneous check-ins (double click) create only one visit", async (t) => {
  const app = await setup(t);
  const body = { veterinarianId: "vet-a", reasonForVisit: "Limp" };
  await Promise.all([assign(app, "p-0001", body), assign(app, "p-0001", body)]);
  assert.equal((await visitsOf(app)).length, 1, "concurrent check-ins must not duplicate the visit");
});

test("AC3: the assignment is recorded in the change log with source 'ui', and revert restores the prior state", async (t) => {
  const app = await setup(t, { visits: [visit()] });
  await assign(app, "p-0001", { veterinarianId: "vet-a" });
  const backupDir = path.join(path.dirname(app.patientsPath), "backups");
  const backups = createBackups({ patientsPath: app.patientsPath, visitsPath: app.visitsPath, dir: backupDir });
  const changes = await backups.listChanges();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].source, "ui");
  assert.equal(changes[0].type, "visit");
  assert.equal(changes[0].before.assignedVeterinarian, null);
  assert.equal(changes[0].after.assignedVeterinarian, "Dr. A Example");
  const snapshots = await backups.listSnapshots();
  assert.equal(snapshots.length, 1, "a before-change snapshot was taken");
  assert.equal(JSON.parse(await readFile(path.join(backupDir, `snapshot-${snapshots[0].id}.json`), "utf8")).visits[0].assignedVeterinarian, null);
});

test("AC6: assigning creates no pending agent action and starts no agent prompt; chat and approvals still work", async (t) => {
  const app = await setup(t, { visits: [visit()] });
  await assign(app, "p-0001", { veterinarianId: "vet-a" });
  const actions = await (await fetch(`${app.url}/api/actions?sessionId=${app.sessionId}`)).json();
  assert.deepEqual(actions, []);
  assert.deepEqual(app.sessions, [], "no agent session was prompted");
  const chat = await fetch(`${app.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "vet-agent" },
    body: JSON.stringify({ sessionId: app.sessionId, message: "Hi" }),
  });
  assert.equal(chat.status, 200);
  const deltas = (await chat.text()).trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.type === "text");
  assert.equal(deltas.map((e) => e.delta).join(""), "Stub response");
});

test("AC6: roster names and reasons containing HTML round-trip as inert JSON strings (escaping is the UI's job)", async (t) => {
  const app = await setup(t);
  const res = await assign(app, "p-0001", { veterinarianId: "vet-x", reasonForVisit: XSS });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/json/);
  const saved = await res.json();
  assert.equal(saved.reasonForVisit, XSS);
  assert.equal(saved.assignedVeterinarian, `Dr. ${XSS}`);
  const listed = await (await fetch(`${app.url}/api/visits`)).json();
  assert.equal(listed[0].assignedVeterinarian, `Dr. ${XSS}`);
  const roster = await fetch(`${app.url}/api/veterinarians`);
  assert.match(roster.headers.get("content-type"), /application\/json/);
});

test("AC6: GET /api/patients and /api/visits still never expose owner phone, email, or address", async (t) => {
  const app = await setup(t, { visits: [visit()] });
  await assign(app, "p-0001", { veterinarianId: "vet-a" });
  const text = (await (await fetch(`${app.url}/api/patients`)).text()) + (await (await fetch(`${app.url}/api/visits`)).text());
  for (const secret of ["555-0100", "sam@example.com", "1 Secret St"]) assert.equal(text.includes(secret), false, secret);
});
