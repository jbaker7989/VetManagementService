import test from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./helpers/app.js";

test("GET /api/patients reads patients from the temporary store", async (t) => {
  const app = await startTestApp({ patients: [{ id: "p-0001", name: "Miso", species: "cat", flagged: false }] });
  t.after(() => app.close());

  const response = await fetch(`${app.url}/api/patients`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ id: "p-0001", name: "Miso", species: "cat", flagged: false }]);
});

test("POST /api/chat streams the stub session response", async (t) => {
  const app = await startTestApp({ response: "Hello from the test agent" });
  t.after(() => app.close());

  const response = await fetch(`${app.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "vet-agent" },
    body: JSON.stringify({ sessionId: app.sessionId, message: "Hi" }),
  });
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/x-ndjson");
  assert.deepEqual(events[0], { type: "session", sessionId: app.sessionId });
  assert.equal(
    events
      .filter((event) => event.type === "text")
      .map((event) => event.delta)
      .join(""),
    "Hello from the test agent",
  );
  assert.deepEqual(events.at(-1), { type: "done" });
  assert.deepEqual(app.sessions, [{ sessionId: app.sessionId, prompts: ["Hi"] }]);
});
