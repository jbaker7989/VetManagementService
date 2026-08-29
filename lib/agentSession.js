import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { createVetTools } from "./tools.js";
import { createStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AGENT_DIR = path.join(ROOT, "agent-home");

export const store = createStore({
  patientsPath: path.join(AGENT_DIR, "memory", "patients.json"),
  visitsPath: path.join(AGENT_DIR, "memory", "visits.json"),
});

const TOOL_NAMES = ["list_patients", "find_patient", "upsert_patient", "list_visits", "upsert_visit"];

let modelRuntimePromise;
function getModelRuntime() {
  if (!modelRuntimePromise) modelRuntimePromise = ModelRuntime.create();
  return modelRuntimePromise;
}

// Sessions have no filesystem/shell access at all — brain.md's data-model text
// is inlined into the system prompt so the agent doesn't need a `read` tool to
// find it, and every read/write goes through the typed tools in lib/tools.js.
async function buildResourceLoader() {
  const brainPath = path.join(AGENT_DIR, "brain", "brain.md");
  const brainContent = await fs.readFile(brainPath, "utf8");

  const loader = new DefaultResourceLoader({
    cwd: AGENT_DIR,
    agentDir: AGENT_DIR,
    agentsFilesOverride: (current) => ({
      agentsFiles: [...current.agentsFiles, { path: brainPath, content: brainContent }],
    }),
    // The send-email / web-fetch skills describe capabilities this deployment
    // doesn't wire up (no SMTP, no outbound web tool) — drop them so the agent
    // doesn't claim it can do things it can't.
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
  });
  await loader.reload();
  return loader;
}

let resourceLoaderPromise;
function getResourceLoader() {
  if (!resourceLoaderPromise) resourceLoaderPromise = buildResourceLoader();
  return resourceLoaderPromise;
}

const sessions = new Map(); // sessionId -> { session, lastUsed }
const IDLE_TTL_MS = 60 * 60 * 1000;

export async function getOrCreateSession(sessionId) {
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.session;
  }

  const [modelRuntime, resourceLoader] = await Promise.all([getModelRuntime(), getResourceLoader()]);
  const customTools = createVetTools(store);

  const { session } = await createAgentSession({
    cwd: AGENT_DIR,
    agentDir: AGENT_DIR,
    modelRuntime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(AGENT_DIR),
    tools: TOOL_NAMES,
    customTools,
  });

  sessions.set(sessionId, { session, lastUsed: Date.now() });
  return session;
}

export function disposeSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  entry.session.dispose();
  sessions.delete(sessionId);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastUsed > IDLE_TTL_MS) {
      entry.session.dispose();
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();
