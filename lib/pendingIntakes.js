import crypto from "node:crypto";

// Holds previewed intakes server-side until staff confirm them. Entries are
// single-use, expire, and only the session that created one can claim it.
export function createPendingIntakes({ ttlMs = 10 * 60 * 1000 } = {}) {
  const pending = new Map(); // id -> { sessionId, plan, expiresAt }

  function prune() {
    const now = Date.now();
    for (const [id, entry] of pending) if (entry.expiresAt <= now) pending.delete(id);
  }

  return {
    add(sessionId, plan) {
      prune();
      const id = crypto.randomUUID();
      pending.set(id, { sessionId, plan, expiresAt: Date.now() + ttlMs });
      return id;
    },
    take(sessionId, id) {
      prune();
      const entry = pending.get(id);
      if (!entry || entry.sessionId !== sessionId) return null;
      pending.delete(id);
      return entry.plan;
    },
  };
}
