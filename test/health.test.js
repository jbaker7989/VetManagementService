import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createApp } from "../server.js";
import { createTempStore } from "./helpers/app.js";
import { once } from "node:events";
import { request } from "node:http";

async function serve(app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

test("Story 3: /health returns ready status without patient data", async (t) => {
  const temp = await createTempStore({ patients: [{ id: "p1", owner: { name: "Sensitive Owner", phone: "555-0100" } }] });
  const running = await serve(createApp({ dataStore: temp.store }));
  t.after(async () => { await running.close(); await temp.close(); });
  const response = await fetch(`${running.url}/health`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), { status: "ok" });
  assert.doesNotMatch(body, /Sensitive Owner|555-0100/);
});

test("Story 3: /health reports unavailable without storage error details", async (t) => {
  const temp = await createTempStore();
  await writeFile(temp.patientsPath, "{ invalid json");
  const running = await serve(createApp({ dataStore: temp.store }));
  t.after(async () => { await running.close(); await temp.close(); });
  const response = await fetch(`${running.url}/health`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
});

test("Story 3: /health honors the allowed Host header", async (t) => {
  const temp = await createTempStore();
  const running = await serve(createApp({ dataStore: temp.store, allowedHosts: ["127.0.0.1"] }));
  t.after(async () => { await running.close(); await temp.close(); });
  const response = await new Promise((resolve, reject) => {
    const req = request(running.url, { headers: { Host: "attacker.invalid" } }, resolve);
    req.on("error", reject);
    req.end();
  });
  response.resume();
  assert.equal(response.statusCode, 403);
});
