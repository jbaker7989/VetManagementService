import { createPendingStore } from "./pendingStore.js";

// Every change the LLM proposes is parked here until staff approve or reject it
// over HTTP (see server.js). The agent's tool call awaits the decision, so the
// model has no way to approve its own change.

const HIGH_RISK_FIELDS = ["isActive", "deathDate", "medications", "costs"];
const APPENDED_FIELDS = ["treatmentLog", "medications"];

const TARGETS = {
  upsert_patient: {
    label: "patient",
    find: (store, id) => store.findPatient({ id }),
    apply: (store, params, context) => store.upsertPatient(params, context),
  },
  upsert_visit: {
    label: "visit",
    find: async (store, id) => (await store.listVisits()).find((v) => v.id === id) ?? null,
    apply: (store, params, context) => store.upsertVisit(params, context),
  },
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// One row per proposed field, with nested objects (owner, followUp) flattened to "owner.phone".
function flattenFields(params) {
  return Object.entries(params).flatMap(([key, value]) =>
    key === "id" ? [] : isPlainObject(value) ? Object.entries(value).map(([sub, v]) => [`${key}.${sub}`, v]) : [[key, value]],
  );
}

export function buildDiff(tool, params, existing) {
  const { label } = TARGETS[tool];
  const changes = flattenFields(params).flatMap(([field, after]) => {
    const [root, sub] = field.split(".");
    const appended = APPENDED_FIELDS.includes(field);
    const before = appended ? undefined : sub ? existing?.[root]?.[sub] : existing?.[root];
    if (!appended && JSON.stringify(before) === JSON.stringify(after)) return [];
    return [{ field, before: before ?? null, after, appended, highRisk: HIGH_RISK_FIELDS.includes(root) }];
  });
  const name = existing?.name ?? params.name;
  const summary = `${params.id ? "Update" : "Create"} ${label}${name ? ` ${name}` : ""}${params.id ? ` (${params.id})` : ""}`;
  return { summary, changes };
}

export function createApprovalGate({ store, timeoutMs = 5 * 60 * 1000, maxPending = 5 }) {
  const pending = createPendingStore({ ttlMs: timeoutMs, maxPerSession: maxPending });

  function claim(sessionId, id) {
    const action = pending.take(sessionId, id);
    if (action) clearTimeout(action.timer);
    return action;
  }

  return {
    // Resolves to { approved: true, record } or { approved: false, reason }; never writes without approval.
    // source ("chat" | "intake") is recorded in the change log alongside the session id.
    async propose(sessionId, tool, params, source) {
      const { find, apply } = TARGETS[tool];
      const diff = buildDiff(tool, params, params.id ? await find(store, params.id) : null);
      return new Promise((resolve) => {
        const action = { tool, diff, apply: () => apply(store, params, { source, sessionId }), settle: resolve };
        const id = pending.add(sessionId, action);
        if (id === null) {
          resolve({ approved: false, reason: `${maxPending} changes are already waiting for staff approval; do not propose more until they are decided` });
          return;
        }
        action.timer = setTimeout(() => {
          pending.take(sessionId, id);
          resolve({ approved: false, reason: "staff did not respond before the approval timeout" });
        }, timeoutMs);
      });
    },

    list(sessionId) {
      return pending.list(sessionId).map(({ id, item }) => ({ id, tool: item.tool, ...item.diff }));
    },

    // Both return false when the id is unknown, expired, or belongs to another session.
    async approve(sessionId, id) {
      const action = claim(sessionId, id);
      if (!action) return false;
      try {
        action.settle({ approved: true, record: await action.apply() });
      } catch (err) {
        action.settle({ approved: false, reason: `saving failed: ${err.message}` });
        throw err;
      }
      return true;
    },

    reject(sessionId, id) {
      const action = claim(sessionId, id);
      if (!action) return false;
      action.settle({ approved: false, reason: "staff rejected it" });
      return true;
    },
  };
}
