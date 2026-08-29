import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";

import { getOrCreateSession, store } from "./lib/agentSession.js";
import { parseCsv } from "./lib/csv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- Read-only data views (bypass the agent; safe direct reads for the UI) ---

app.get("/api/patients", async (_req, res) => {
  try {
    res.json(await store.listPatients());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/visits", async (req, res) => {
  try {
    const visits = await store.listVisits();
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

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Session-Id", sessionId);

  const send = (obj) => res.write(JSON.stringify(obj) + "\n");

  try {
    const session = await getOrCreateSession(sessionId);

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

// --- Upload: parse CSV/JSON client-side-selected file, hand rows to the agent ---

app.post("/api/upload", async (req, res) => {
  const { filename, content } = req.body || {};
  const sessionId = req.body?.sessionId || crypto.randomUUID();

  if (typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  let records;
  try {
    if (/\.json$/i.test(filename || "") || content.trim().startsWith("[") || content.trim().startsWith("{")) {
      const parsed = JSON.parse(content);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      records = parseCsv(content);
    }
  } catch (err) {
    res.status(400).json({ error: `Could not parse ${filename || "file"}: ${err.message}` });
    return;
  }

  if (records.length === 0) {
    res.status(400).json({ error: "No records found in file" });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Session-Id", sessionId);
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");

  const prompt =
    `A staff member uploaded ${records.length} pet/owner record(s) from "${filename || "an upload"}" for intake. ` +
    `Follow the intake workflow in brain.md for each one: look up whether the patient already exists, ` +
    `create or update the patient record with upsert_patient, and use reasonable judgement for any field ` +
    `not present in the data (ask only if something essential like the pet's name is missing and can't be ` +
    `inferred). Do not invent an owner or veterinarian. When done, summarize what was created/updated.\n\n` +
    `Records (JSON):\n${JSON.stringify(records, null, 2)}`;

  try {
    const session = await getOrCreateSession(sessionId);
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
    send({ type: "parsed", count: records.length });
    await session.prompt(prompt);
    unsubscribe();
    send({ type: "done" });
  } catch (err) {
    send({ type: "error", message: err.message });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Vet clinic agent front end running at http://localhost:${PORT}`);
});
