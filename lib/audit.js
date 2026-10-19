import crypto from "node:crypto";
import { findInstructionLike } from "./injectionDetector.js";

// One JSON line per tool call, plus level "alert" lines for anomalies. Lines go
// to stdout; retention and rotation are the operator's concern (see README).

const READ_TOOLS = ["list_patients", "find_patient", "list_visits"];
const MUTATION_TOOLS = ["upsert_patient", "upsert_visit"];
const HASHED_KEYS = ["email", "phone", "address"];
const OMITTED_KEYS = ["note", "instructions", "reasonForVisit", "diagnosis", "distinguishingCharacteristics", "content"];
// Emails and phone numbers in any other string field are hashed in place.
const PII_VALUE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

// Hashes are salted per process: they correlate repeats in one log, not across runs.
const salt = crypto.randomBytes(16);
const hash = (text) => `hash:${crypto.createHmac("sha256", salt).update(text).digest("hex").slice(0, 12)}`;

function maskArgs(value, key) {
  if (typeof value === "string") {
    if (HASHED_KEYS.includes(key)) return hash(value);
    if (OMITTED_KEYS.includes(key)) return `[${value.length} chars]`;
    return value.replace(PII_VALUE, hash);
  }
  if (Array.isArray(value)) return value.map((item) => maskArgs(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskArgs(v, k)]));
  }
  return value;
}

export function createAudit({
  sink = (entry) => console.log(JSON.stringify(entry)),
  now = Date.now,
  windowMs = 60 * 1000,
  bulkReadThreshold = 20,
  mutationThreshold = 5,
} = {}) {
  const recent = new Map(); // `${kind}:${sessionId}` -> timestamps inside the window

  const log = (level, event, fields) => sink({ ts: new Date(now()).toISOString(), level, event, ...fields });

  function countRecent(kind, sessionId) {
    const key = `${kind}:${sessionId}`;
    const stamps = [...(recent.get(key) ?? []).filter((t) => now() - t < windowMs), now()];
    recent.set(key, stamps);
    return stamps.length;
  }

  return {
    toolCall({ tool, args, sessionId, ip, source }) {
      log("info", "tool_call", { tool, args: maskArgs(args), sessionId, ip, source });
      if (READ_TOOLS.includes(tool) && countRecent("read", sessionId) > bulkReadThreshold) {
        log("alert", "bulk_reads", { sessionId, ip, source, threshold: bulkReadThreshold, windowMs });
      }
      if (MUTATION_TOOLS.includes(tool) && countRecent("mutation", sessionId) > mutationThreshold) {
        log("alert", "repeated_mutation_proposals", { sessionId, ip, source, threshold: mutationThreshold, windowMs });
      }
    },

    approvalRejected({ sessionId, ip, actionId }) {
      log("alert", "approval_rejected", { sessionId, ip, actionId });
    },

    // Logs which patterns matched, never the text itself.
    screenText({ text, sessionId, ip, source }) {
      const patterns = findInstructionLike(text);
      if (patterns.length) log("alert", "injection_phrase", { patterns, sessionId, ip, source });
    },
  };
}
