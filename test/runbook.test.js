import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runbook = await readFile(path.join(root, "docs/devops/production-runbook.md"), "utf8");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const workflows = await Promise.all(["ci", "cd", "deploy", "production"].map((name) =>
  readFile(path.join(root, ".github/workflows", `${name}.yml`), "utf8")));

test("Story 9: every documented npm run script exists", () => {
  const scripts = [...runbook.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1]);
  assert.ok(scripts.length > 0, "runbook should contain npm run commands");
  for (const script of scripts) assert.ok(packageJson.scripts[script], `missing npm script: ${script}`);
});

test("Story 9: repository paths referenced by the runbook exist", async () => {
  const references = [...runbook.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  const paths = new Set(references.filter((value) =>
    /^(?:\.github\/|docker-compose[^ ]*\.yml$|docs\/|scripts\/|\.env\.example$|README\.md$)/.test(value)));
  for (const reference of paths) {
    const expanded = reference.includes("{")
      ? [".github/workflows/ci.yml", ".github/workflows/cd.yml", ".github/workflows/deploy.yml", ".github/workflows/production.yml"]
      : [reference];
    for (const relative of expanded) {
      await assert.doesNotReject(access(path.join(root, relative)), `${relative} referenced by runbook is missing`);
    }
  }
});

test("Story 9: deploy secrets and variables match the runbook setup table", () => {
  const workflowText = workflows.join("\n");
  const usedSecrets = new Set([...workflowText.matchAll(/secrets\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]));
  const usedVariables = new Set([...workflowText.matchAll(/vars\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]));
  const documentedSettings = [...runbook.matchAll(/^\s*\|\s*(?:Secret|Variable)\s*\|\s*`([A-Z][A-Z0-9_]*)`/gm)];
  const documented = new Set(documentedSettings.map((match) => match[1]));
  for (const name of [...usedSecrets, ...usedVariables]) {
    if (name !== "GITHUB_TOKEN") assert.ok(documented.has(name), `${name} is used by workflow but absent from runbook`);
  }
  for (const name of documented) {
    assert.ok(usedSecrets.has(name) || usedVariables.has(name), `${name} is documented as a GitHub setting but no workflow uses it`);
  }
});

test("Story 9: documented runtime environment variables exist in .env.example", async () => {
  const example = await readFile(path.join(root, ".env.example"), "utf8");
  const exampleNames = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]));
  const documentedRuntimeNames = new Set([...runbook.matchAll(/`([A-Z][A-Z0-9_]*)`/g)]
    .map((match) => match[1])
    .filter((name) => /^(?:OPENROUTER|ALLOWED_HOSTS|BACKUP_|SHUTDOWN_|APPROVAL_|HOST$|PORT$)/.test(name)));
  for (const name of documentedRuntimeNames) assert.ok(exampleNames.has(name), `${name} missing from .env.example`);
});

test("Story 9: runbook has rollback, backup, restore, and rotation procedures", () => {
  for (const heading of ["Roll back", "Backup and restore", "Secret rotation"]) {
    assert.match(runbook, new RegExp(`^## ${heading}`, "m"), `missing ${heading} section`);
  }
  assert.match(runbook, /^## Backup and restore/m);
});
