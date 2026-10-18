import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function jsFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await jsFiles(file));
    else if (entry.isFile() && file.endsWith(".js")) result.push(file);
  }
  return result;
}

test("Story 7: .env.example documents every runtime env variable used by app, libraries, and scripts", async () => {
  const files = [path.join(root, "server.js"), ...await jsFiles(path.join(root, "lib")), ...await jsFiles(path.join(root, "scripts"))];
  const referenced = new Set();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) referenced.add(match[1]);
  }
  referenced.delete("NODE_ENV");
  const example = await readFile(path.join(root, ".env.example"), "utf8");
  const documented = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]));
  assert.deepEqual([...referenced].filter((name) => !documented.has(name)).sort(), []);
});

test("Story 7: .env.example contains placeholders rather than secret values", async () => {
  const example = await readFile(path.join(root, ".env.example"), "utf8");
  const entries = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)];
  assert.ok(entries.length > 0, "expected documented environment variables");
  for (const [line, key, value] of entries) {
    if (key === "OPENROUTER_API_KEY") continue;
    assert.doesNotMatch(value, /^(?:sk-|sk_|gh[pousr]_|AKIA|Bearer\s)\S+/i, `secret-like value for ${key}: ${line}`);
  }
  const key = entries.find(([, name]) => name === "OPENROUTER_API_KEY");
  assert.ok(key, "OPENROUTER_API_KEY must be documented");
  assert.ok(!key[2] || /placeholder|your-|<|\*/i.test(key[2]), "API key example must be empty or an explicit placeholder");
});
