import crypto from "node:crypto";

// Session ids are issued here and nowhere else, so a client cannot choose (or
// guess) the id of another client's session. Ids expire after idleMs of
// touch() calls; agent-side cleanup of an expired id is lib/agentSession.js's
// own idle disposal, which uses the same TTL.
export function createSessionRegistry({ idleMs, now = Date.now }) {
  const lastSeen = new Map(); // id -> timestamp

  function prune() {
    for (const [id, seen] of lastSeen) if (now() - seen > idleMs) lastSeen.delete(id);
  }

  function has(id) {
    prune();
    return lastSeen.has(id);
  }

  return {
    issue() {
      prune();
      const id = crypto.randomBytes(16).toString("hex");
      lastSeen.set(id, now());
      return id;
    },
    has,
    // True (and refreshes the idle timer) only for an issued, unexpired id.
    touch(id) {
      if (!has(id)) return false;
      lastSeen.set(id, now());
      return true;
    },
  };
}
