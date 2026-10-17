import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createApp } from "../../server.js";
import { createStore } from "../../lib/store.js";

export async function createTempStore({ patients = [], visits = [] } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vet-agent-test-"));
  const memory = path.join(directory, "memory");
  await mkdir(memory);
  const patientsPath = path.join(memory, "patients.json");
  const visitsPath = path.join(memory, "visits.json");
  await Promise.all([
    writeFile(patientsPath, JSON.stringify(patients, null, 2)),
    writeFile(visitsPath, JSON.stringify(visits, null, 2)),
  ]);

  return {
    directory,
    patientsPath,
    visitsPath,
    store: createStore({ patientsPath, visitsPath }),
    async close() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export async function startTestApp({
  patients = [],
  visits = [],
  response = "Stub response",
  pendingIntakes,
  approvals,
} = {}) {
  const temp = await createTempStore({ patients, visits });
  const sessions = [];
  const app = createApp({
    dataStore: temp.store,
    pendingIntakes,
    approvals,
    getSession: async (sessionId) => {
      const listeners = new Set();
      const session = { sessionId, prompts: [] };
      sessions.push(session);
      return {
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        async prompt(message) {
          session.prompts.push(message);
          for (const listener of listeners) {
            listener({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: response } });
          }
        },
      };
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    sessions,
    ...temp,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      await temp.close();
    },
  };
}
