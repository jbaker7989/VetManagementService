import crypto from "node:crypto";

// Holds items server-side (previewed intakes, agent-proposed changes) until
// staff decide on them. Entries are single-use, expire, and only the session
// that created one can claim it. A session may hold at most maxPerSession.
export function createPendingStore({ ttlMs = 10 * 60 * 1000, maxPerSession = Infinity } = {}) {
  const pending = new Map(); // id -> { sessionId, item, expiresAt }

  function prune() {
    const now = Date.now();
    for (const [id, entry] of pending) if (entry.expiresAt <= now) pending.delete(id);
  }

  return {
    // Returns the new id, or null when the session is at its cap.
    add(sessionId, item) {
      prune();
      if (this.list(sessionId).length >= maxPerSession) return null;
      const id = crypto.randomUUID();
      pending.set(id, { sessionId, item, expiresAt: Date.now() + ttlMs });
      return id;
    },
    list(sessionId) {
      prune();
      return [...pending].filter(([, entry]) => entry.sessionId === sessionId).map(([id, entry]) => ({ id, item: entry.item }));
    },
    take(sessionId, id) {
      prune();
      const entry = pending.get(id);
      if (!entry || entry.sessionId !== sessionId) return null;
      pending.delete(id);
      return entry.item;
    },
  };
}
