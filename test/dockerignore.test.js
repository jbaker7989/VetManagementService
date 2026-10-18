import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Story 7: Dockerfile copy sources cannot include .env and .dockerignore excludes it", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
  const ignore = await readFile(new URL("../.dockerignore", import.meta.url), "utf8");
  const copySources = dockerfile.split(/\r?\n/).filter((line) => /^COPY\b/.test(line));
  assert.ok(copySources.length > 0);
  assert.ok(copySources.every((line) => !/(^|\s)(?:\.env|\.env\.\*|\.env\.[^\s]+)/.test(line)), "Docker COPY source must not select environment files");
  const rules = ignore.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.ok(rules.includes(".env"));
  assert.ok(rules.includes(".env.*"));
  assert.ok(rules.includes("!.env.example"));
});

test("Story 8: .dockerignore removes specified build context categories", async () => {
  const ignore = await readFile(new URL("../.dockerignore", import.meta.url), "utf8");
  const rules = ignore.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const rule of ["node_modules", ".git", ".pi", "docs", "test", "agent-home/memory"]) {
    assert.ok(rules.includes(rule), `expected precise ignore rule ${rule}`);
  }
});
