// Flags text that reads like instructions to an AI agent. It only flags (for
// staff review and audit alerts); it never blocks a write.

const PATTERNS = {
  ignore_instructions: /\b(ignore|disregard|forget)\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|your)\b/i,
  role_change: /\byou\s+are\s+now\b/i,
  system_prompt: /\bsystem\s+prompt\b/i,
  tool_call: /\b(call|invoke|run|use)\s+(the\s+)?(upsert_|list_patients|list_visits|find_patient)/i,
  bulk_listing: /\blist\s+all\s+(the\s+)?(patients|owners|records|visits)\b/i,
};

function* strings(value) {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const item of value) yield* strings(item);
  else if (value && typeof value === "object") for (const item of Object.values(value)) yield* strings(item);
}

// Accepts a string or any JSON-like record; returns the names of the patterns found.
export function findInstructionLike(value) {
  const found = new Set();
  for (const text of strings(value)) {
    for (const [name, pattern] of Object.entries(PATTERNS)) if (pattern.test(text)) found.add(name);
  }
  return [...found];
}
