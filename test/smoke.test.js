import test from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./helpers/app.js";

test("GET /api/patients reads patients from the temporary store", async (t) => {
  const app = await startTestApp({ patients: [{ id: "p-0001", name: "Miso", species: "cat" }] });
  t.after(() => app.close());

  const response = await fetch(`${app.url}/api/patients`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ id: "p-0001", name: "Miso", species: "cat" }]);
});

test("POST /api/chat streams the stub session response", async (t) => {
  const app = await startTestApp({ response: "Hello from the test agent" });
  t.after(() => app.close());

  const response = await fetch(`${app.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "vet-agent" },
    body: JSON.stringify({ sessionId: "smoke-session", message: "Hi" }),
  });
  const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/x-ndjson");
  assert.deepEqual(events, [
    { type: "session", sessionId: "smoke-session" },
    { type: "text", delta: "Hello from the test agent" },
    { type: "done" },
  ]);
  assert.deepEqual(app.sessions, [{ sessionId: "smoke-session", prompts: ["Hi"] }]);
});
