import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";

import { getOrCreateSession, store } from "./lib/agentSession.js";
import { buildTextIntakePrompt, commitIntake, parseUpload, planIntake, previewIntake } from "./lib/intake.js";
import { createPendingIntakes } from "./lib/pendingIntakes.js";
import { createRequestGuard, defaultAllowedHosts } from "./lib/requestGuard.js";
import { assertSafeAgentSettings, resolveListenHost } from "./lib/startupChecks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function openStream(res, sessionId) {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Session-Id", sessionId);
  return (obj) => res.write(JSON.stringify(obj) + "\n");
}

export function createApp({
  dataStore = store,
  getSession = getOrCreateSession,
  allowedHosts = defaultAllowedHosts(),
  pendingIntakes = createPendingIntakes(),
} = {}) {
  const app = express();

  app.use(createRequestGuard({ allowedHosts }));
  app.use(express.json({ limit: "5mb" }));
  app.use(express.static(path.join(__dirname, "public")));

  // --- Read-only data views (bypass the agent; safe direct reads for the UI) ---

  app.get("/api/patients", async (_req, res) => {
    try {
      res.json(await dataStore.listPatients());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/visits", async (req, res) => {
    try {
      const visits = await dataStore.listVisits();
      const filtered = req.query.patientId ? visits.filter((v) => v.patientId === req.query.patientId) : visits;
      res.json(filtered);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Chat: streams NDJSON events from the pi agent session ---

  app.post("/api/chat", async (req, res) => {
    const { message } = req.body || {};
    const sessionId = req.body?.sessionId || crypto.randomUUID();

    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const send = openStream(res, sessionId);

    try {
      const session = await getSession(sessionId);

      const unsubscribe = session.subscribe((event) => {
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
          send({ type: "text", delta: event.assistantMessageEvent.delta });
        } else if (event.type === "tool_execution_start") {
          send({ type: "tool_start", toolName: event.toolName });
        } else if (event.type === "tool_execution_end") {
          send({ type: "tool_end", toolName: event.toolName, isError: event.isError });
        }
      });

      send({ type: "session", sessionId });
      await session.prompt(message);
      unsubscribe();
      send({ type: "done" });
    } catch (err) {
      send({ type: "error", message: err.message });
    } finally {
      res.end();
    }
  });

  // --- Upload: structured CSV/JSON is validated and previewed, then written by code (no LLM) ---

  app.post("/api/upload", async (req, res) => {
    const { filename, content } = req.body || {};
    const sessionId = req.body?.sessionId || crypto.randomUUID();

    if (typeof content !== "string" || !content.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    let upload;
    try {
      upload = parseUpload(filename, content);
    } catch (err) {
      res.status(400).json({ error: `Could not parse ${filename || "file"}: ${err.message}` });
      return;
    }

    if (upload.records?.length === 0) {
      res.status(400).json({ error: "No records found in file" });
      return;
    }

    const send = openStream(res, sessionId);

    try {
      send({ type: "session", sessionId });
      if (upload.records) {
        const plan = await planIntake(dataStore, upload.records);
        const pendingId = plan.items.length ? pendingIntakes.add(sessionId, plan) : null;
        send({ type: "parsed", count: upload.records.length });
        send({ type: "preview", pendingId, ...previewIntake(plan) });
      } else {
        const session = await getSession(sessionId);
        const unsubscribe = session.subscribe((event) => {
          if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
            send({ type: "text", delta: event.assistantMessageEvent.delta });
          } else if (event.type === "tool_execution_start") {
            send({ type: "tool_start", toolName: event.toolName });
          } else if (event.type === "tool_execution_end") {
            send({ type: "tool_end", toolName: event.toolName, isError: event.isError });
          }
        });
        await session.prompt(buildTextIntakePrompt(upload.text));
        unsubscribe();
      }
      send({ type: "done" });
    } catch (err) {
      send({ type: "error", message: err.message });
    } finally {
      res.end();
    }
  });

  app.post("/api/upload/confirm", async (req, res) => {
    const { sessionId, pendingId } = req.body || {};
    const plan = typeof sessionId === "string" && typeof pendingId === "string" ? pendingIntakes.take(sessionId, pendingId) : null;

    if (!plan) {
      res.status(404).json({ error: "No pending intake found for this session (it may have expired)" });
      return;
    }

    const send = openStream(res, sessionId);

    try {
      send({ type: "session", sessionId });
      send({ type: "summary", ...(await commitIntake(dataStore, plan)) });
      send({ type: "done" });
    } catch (err) {
      send({ type: "error", message: err.message });
    } finally {
      res.end();
    }
  });

  return app;
}

export function start() {
  const port = process.env.PORT || 3000;
  const host = resolveListenHost();
  assertSafeAgentSettings();
  return createApp().listen(port, host, () => {
    console.log(`Vet clinic agent front end running at http://${host}:${port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
