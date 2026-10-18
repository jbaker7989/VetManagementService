import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { approvalGate, getOrCreateSession, IDLE_TTL_MS, store } from "./lib/agentSession.js";
import { createAudit } from "./lib/audit.js";
import { assignVeterinarian } from "./lib/assignment.js";
import { findInstructionLike } from "./lib/injectionDetector.js";
import { buildTextIntakePrompt, commitIntake, MAX_UPLOAD_BYTES, parseUpload, planIntake, previewIntake, sanitizeFilename } from "./lib/intake.js";
import { summarizePatient } from "./lib/modelViews.js";
import { createStreamScrubber } from "./lib/outputFilter.js";
import { createPendingStore } from "./lib/pendingStore.js";
import { createRateLimiter } from "./lib/rateLimiter.js";
import { createRequestGuard, defaultAllowedHosts } from "./lib/requestGuard.js";
import { log, logError } from "./lib/log.js";
import { createSessionRegistry } from "./lib/sessionRegistry.js";
import { installShutdown } from "./lib/shutdown.js";
import { assertSafeAgentSettings, resolveListenHost } from "./lib/startupChecks.js";
import { createVeterinarianRoster } from "./lib/veterinarians.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function openStream(res, sessionId) {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Session-Id", sessionId);
  return (obj) => res.write(JSON.stringify(obj) + "\n");
}

export const DEFAULT_LIMITS = {
  maxMessageChars: 4000,
  maxToolCallsPerTurn: 25,
  chatPerWindow: 20,
  uploadPerWindow: 10,
  rateWindowMs: 60 * 1000,
};

const flagged = (record) => findInstructionLike(record).length > 0;

export function createApp({
  dataStore = store,
  getSession = getOrCreateSession,
  allowedHosts = defaultAllowedHosts(),
  pendingIntakes = createPendingStore(),
  approvals = approvalGate,
  sessions = createSessionRegistry({ idleMs: IDLE_TTL_MS }),
  audit = createAudit(),
  limits = DEFAULT_LIMITS,
  veterinarians = createVeterinarianRoster(),
} = {}) {
  const app = express();

  const rateLimit = (limit) => createRateLimiter({ limit, windowMs: limits.rateWindowMs });
  const chatLimiter = rateLimit(limits.chatPerWindow);
  const uploadLimiter = rateLimit(limits.uploadPerWindow);

  // check is sessions.touch (refreshes the idle timer) or sessions.has.
  const requireSession = (check) => (req, res, next) => {
    if (check(req.body?.sessionId ?? req.query.sessionId)) return next();
    res.status(403).json({ error: "Unknown or expired session; request one from POST /api/session" });
  };
  const activeSession = requireSession(sessions.touch);
  const knownSession = requireSession(sessions.has);

  // Streams one agent turn: scrubs text, audits tool calls, and aborts the
  // turn once it uses more tools than allowed.
  async function streamTurn(session, prompt, send, audited) {
    const scrubber = createStreamScrubber();
    const sendText = (delta) => delta && send({ type: "text", delta });
    let toolCalls = 0;

    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        sendText(scrubber.push(event.assistantMessageEvent.delta));
      } else if (event.type === "tool_execution_start") {
        audit.toolCall({ tool: event.toolName, args: event.args, ...audited });
        send({ type: "tool_start", toolName: event.toolName });
        if (++toolCalls === limits.maxToolCallsPerTurn + 1) session.abort();
      } else if (event.type === "tool_execution_end") {
        send({ type: "tool_end", toolName: event.toolName, isError: event.isError });
      }
    });

    const tooManyToolCalls = () => toolCalls > limits.maxToolCallsPerTurn;
    try {
      await session.prompt(prompt);
    } catch (err) {
      if (!tooManyToolCalls()) throw err;
    } finally {
      unsubscribe();
    }
    sendText(scrubber.flush());
    if (tooManyToolCalls()) throw new Error(`Stopped: the agent tried to use more than ${limits.maxToolCallsPerTurn} tools in one turn`);
  }

  app.use(createRequestGuard({ allowedHosts }));

  // Liveness + readiness for orchestrators: ok only if both data files are readable and parse.
  // Returns no data and no error details; the Host check above still applies.
  app.get("/health", async (_req, res) => {
    try {
      await Promise.all([dataStore.listPatients(), dataStore.listVisits()]);
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use(express.json({ limit: MAX_UPLOAD_BYTES }));
  app.use(express.static(path.join(__dirname, "public")));

  // The only source of session ids. Passing a still-valid id resumes it.
  app.post("/api/session", (req, res) => {
    const requested = req.body?.sessionId;
    res.json({ sessionId: sessions.touch(requested) ? requested : sessions.issue() });
  });

  // --- Read-only data views (bypass the agent; safe direct reads for the UI) ---

  app.get("/api/patients", async (_req, res) => {
    try {
      res.json((await dataStore.listPatients()).map((p) => ({ ...summarizePatient(p), flagged: flagged(p) })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // The only way to see owner phone/email/address; it never passes through the model.
  app.get("/api/patients/:id/contact", async (req, res) => {
    try {
      const patient = await dataStore.findPatient({ id: req.params.id });
      if (!patient) {
        res.status(404).json({ error: "Patient not found" });
        return;
      }
      console.log(`contact: viewed owner contact info for patient ${patient.id}`);
      res.json({ id: patient.id, owner: patient.owner });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/visits", async (req, res) => {
    try {
      const visits = await dataStore.listVisits();
      const filtered = req.query.patientId ? visits.filter((v) => v.patientId === req.query.patientId) : visits;
      res.json(filtered.map((v) => ({ ...v, flagged: flagged(v) })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Only errors flagged `expose` show their message to the client; everything else is logged and sent generically.
  const failVeterinarianRequest = (res, err) => {
    if (err.cause || !err.expose) console.error(`veterinarians: ${err.message}${err.cause ? ` (${err.cause.message})` : ""}`);
    res.status(err.status ?? 500).json({ error: err.expose ? err.message : "Internal server error" });
  };

  app.get("/api/veterinarians", async (_req, res) => {
    try {
      res.json(await veterinarians.list());
    } catch (err) {
      failVeterinarianRequest(res, err);
    }
  });

  // --- Staff action: picking a vet in the UI is human-initiated, so it skips the agent and the approval gate ---

  app.post("/api/patients/:id/assign-veterinarian", async (req, res) => {
    try {
      res.json(await assignVeterinarian({ dataStore, roster: veterinarians, patientId: req.params.id, input: req.body, context: { source: "ui" } }));
    } catch (err) {
      failVeterinarianRequest(res, err);
    }
  });

  // --- Chat: streams NDJSON events from the pi agent session ---

  app.post("/api/chat", chatLimiter, activeSession, async (req, res) => {
    const { message, sessionId } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    if (message.length > limits.maxMessageChars) {
      res.status(413).json({ error: `message is too long (limit ${limits.maxMessageChars} characters)` });
      return;
    }

    const send = openStream(res, sessionId);
    const audited = { sessionId, ip: req.ip, source: "chat" };
    audit.screenText({ text: message, ...audited });

    try {
      const session = await getSession(sessionId, "chat");
      send({ type: "session", sessionId });
      await streamTurn(session, message, send, audited);
      send({ type: "done" });
    } catch (err) {
      send({ type: "error", message: err.message });
    } finally {
      res.end();
    }
  });

  // --- Approval gate: changes the agent proposes wait here until staff decide ---

  app.get("/api/actions", knownSession, (req, res) => {
    res.json(approvals.list(req.query.sessionId));
  });

  for (const decision of ["approve", "reject"]) {
    app.post(`/api/actions/:id/${decision}`, knownSession, async (req, res) => {
      const { sessionId } = req.body;
      try {
        const found = await approvals[decision](sessionId, req.params.id);
        if (found && decision === "reject") audit.approvalRejected({ sessionId, ip: req.ip, actionId: req.params.id });
        if (found) res.json({ status: decision === "approve" ? "approved" : "rejected" });
        else res.status(404).json({ error: "No pending action found for this session (it may have expired)" });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  }

  // --- Upload: structured CSV/JSON is validated and previewed, then written by code (no LLM) ---

  app.post("/api/upload", uploadLimiter, activeSession, async (req, res) => {
    const { content, sessionId } = req.body;
    const filename = sanitizeFilename(req.body.filename);

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
        const session = await getSession(sessionId, "intake");
        const audited = { sessionId, ip: req.ip, source: "intake" };
        audit.screenText({ text: upload.text, ...audited });
        await streamTurn(session, buildTextIntakePrompt(upload.text), send, audited);
      }
      send({ type: "done" });
    } catch (err) {
      send({ type: "error", message: err.message });
    } finally {
      res.end();
    }
  });

  app.post("/api/upload/confirm", knownSession, async (req, res) => {
    const { sessionId, pendingId } = req.body;
    const plan = typeof pendingId === "string" ? pendingIntakes.take(sessionId, pendingId) : null;

    if (!plan) {
      res.status(404).json({ error: "No pending intake found for this session (it may have expired)" });
      return;
    }

    const send = openStream(res, sessionId);

    try {
      send({ type: "session", sessionId });
      send({ type: "summary", ...(await commitIntake(dataStore, plan, { source: "upload-confirm", sessionId })) });
      send({ type: "done" });
    } catch (err) {
      send({ type: "error", message: err.message });
    } finally {
      res.end();
    }
  });

  app.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status ?? 500).json({ error: err.expose ? err.message : "Internal server error" });
  });

  return app;
}

export function start({
  snapshotIntervalMs = Number(process.env.BACKUP_INTERVAL_MS) || 60 * 60 * 1000,
  shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10 * 1000,
} = {}) {
  const port = process.env.PORT || 3000;
  const host = resolveListenHost();
  assertSafeAgentSettings();
  setInterval(() => store.snapshot().catch((err) => logError(`backup: scheduled snapshot failed: ${err.message}`)), snapshotIntervalMs).unref();
  const server = createApp().listen(port, host, () => {
    log(`Vet clinic agent front end running at http://${host}:${port}`);
  });
  installShutdown(server, { snapshot: () => store.snapshot(), timeoutMs: shutdownTimeoutMs });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
