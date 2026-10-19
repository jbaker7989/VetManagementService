import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowDir = path.join(root, ".github/workflows");
const workflows = Object.fromEntries(await Promise.all(
  ["ci", "cd", "deploy", "production"].map(async (name) => [
    name,
    await readFile(path.join(workflowDir, `${name}.yml`), "utf8"),
  ]),
));

// Small indentation-aware reader for the subset we assert: top-level keys, jobs, and run blocks.
function section(source, key, indent = 0) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${" ".repeat(indent)}${key}:`).test(line));
  if (start < 0) return "";
  const result = [lines[start]];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() && !line.startsWith(" ".repeat(indent + 1)) && !line.startsWith("\t")) break;
    result.push(line);
  }
  return result.join("\n");
}

function jobNames(source) {
  return [...section(source, "jobs").matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]);
}

function runBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)run:\s*[|>]\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].startsWith(" ".repeat(indent + 1)))) {
      body.push(lines[++i].slice(Math.min(indent + 2, lines[i].length)));
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}

function stepRun(source, id) {
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim() === `- id: ${id}`);
  assert.notEqual(index, -1, `missing step id ${id}`);
  const runIndex = lines.findIndex((line, lineIndex) => lineIndex > index && /^\s+run:/.test(line));
  assert.notEqual(runIndex, -1, `step ${id} has no multiline run block`);
  const inline = lines[runIndex].match(/^\s+run:\s*(.+)$/);
  if (inline && !/^[|>]$/.test(inline[1])) return inline[1];
  const indent = lines[runIndex].match(/^\s*/)[0].length;
  const body = [];
  for (let cursor = runIndex + 1; cursor < lines.length; cursor++) {
    if (lines[cursor].trim() && lines[cursor].match(/^\s*/)[0].length <= indent) break;
    body.push(lines[cursor].slice(Math.min(indent + 2, lines[cursor].length)));
  }
  return body.join("\n");
}

test("Story 4: CI triggers and required check names match the runbook", async () => {
  const ci = workflows.ci;
  const triggers = section(ci, "on");
  assert.match(triggers, /^  pull_request:\n    branches: \[main\]/m);
  assert.match(triggers, /^  workflow_call:/m);
  assert.doesNotMatch(triggers, /^  push:/m);
  assert.deepEqual(jobNames(ci).sort(), ["docker", "test"]);
  const runbook = await readFile(path.join(root, "docs/devops/production-runbook.md"), "utf8");
  const required = runbook.match(/selecting \*\*`([^`]+)`\*\* and \*\*`([^`]+)`\*\*/);
  assert.ok(required, "runbook must name the required branch protection checks");
  assert.deepEqual(required.slice(1).sort(), jobNames(ci).sort());
});

test("Story 4/5/6/9: workflow jobs have time limits and least-privilege permissions", () => {
  const missingTimeouts = [];
  const missingPermissions = [];
  for (const [name, source] of Object.entries(workflows)) {
    for (const job of jobNames(source)) {
      const body = section(source, job, 2);
      // Jobs that call a reusable workflow cannot set timeout-minutes; the called jobs carry their own.
      if (/^    uses:/m.test(body)) continue;
      if (!/^    timeout-minutes:\s*\d+/m.test(body)) missingTimeouts.push(`${name}.${job}`);
    }
    if (!/^  contents: read$/m.test(section(source, "permissions"))) missingPermissions.push(name);
    assert.doesNotMatch(source, /pull_request_target/);
    for (const [, uses] of source.matchAll(/^\s+-?\s*uses:\s*([^\s#]+)/gm)) {
      if (uses.startsWith("./")) continue;
      const ref = uses.slice(uses.lastIndexOf("@") + 1);
      assert.ok(/^(?:v\d+(?:\.\d+)*|[a-f0-9]{40})$/i.test(ref), `${name} action is not pinned: ${uses}`);
    }
  }
  assert.deepEqual(
    { missingTimeouts, missingPermissions },
    { missingTimeouts: [], missingPermissions: [] },
    "every job needs timeout-minutes and every workflow needs workflow-level contents: read",
  );
  const packagesWrite = [...Object.entries(workflows)].flatMap(([name, source]) =>
    [...source.matchAll(/^\s+packages:\s*write\s*$/gm)].map(() => name));
  assert.deepEqual(packagesWrite, ["cd"]);
  assert.match(section(workflows.cd, "publish", 2), /^      packages: write$/m);
});

test("Story 5: CD publishes expected tags, uses GITHUB_TOKEN, and stages main only", async () => {
  const cd = workflows.cd;
  assert.match(section(cd, "on"), /^  push:\n    branches: \[main\]\n    tags: \["v\*"\]/m);
  assert.match(section(cd, "publish", 2), /^    needs: ci$/m);
  assert.match(section(cd, "deploy-staging", 2), /^    needs: publish$/m);
  assert.match(section(cd, "deploy-staging", 2), /^    if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(cd, /password:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.doesNotMatch(cd, /secrets\.(?!GITHUB_TOKEN)[A-Z0-9_]+/);
  const metadata = cd.split(/^          tags: \|\n/m)[1]?.split(/^      - id: build/m)[0] ?? "";
  assert.match(metadata, /type=sha,format=short/);
  assert.match(metadata, /type=raw,value=latest,enable=\{\{is_default_branch\}\}/);
  assert.match(metadata, /type=semver,pattern=\{\{version\}\}/);

  const script = stepRun(cd, "sha-tag");
  const output = await mkdtemp(path.join(os.tmpdir(), "devops-sha-output-"));
  try {
    const outputFile = path.join(output, "github-output");
    const result = spawnSync(process.env.BASH ?? "bash", ["-c", script], {
      encoding: "utf8",
      env: { ...process.env, TAGS: "ghcr.io/o/r:sha-abc1234\nghcr.io/o/r:latest", GITHUB_OUTPUT: outputFile },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(outputFile, "utf8"), /^tag=sha-abc1234$/m);

    const semverOutput = path.join(output, "semver-output");
    const semver = spawnSync(process.env.BASH ?? "bash", ["-c", script], {
      encoding: "utf8",
      env: { ...process.env, TAGS: "ghcr.io/o/r:1.2.3\nghcr.io/o/r:1.2", GITHUB_OUTPUT: semverOutput },
    });
    assert.equal(semver.status, 0, semver.stderr);
    assert.match(await readFile(semverOutput, "utf8"), /^tag=$/m, "semver metadata currently yields an empty staging sha tag");
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("Story 6/9: deploy scripts take untrusted values from environment and keep SSH host checking", () => {
  const deploy = workflows.deploy;
  for (const script of runBlocks(deploy)) assert.doesNotMatch(script, /\$\{\{[\s\S]*?\}\}/);
  for (const mapping of [
    "ENVIRONMENT: ${{ inputs.environment }}",
    "IMAGE_TAG: ${{ inputs.image-tag }}",
    "DEPLOY_HOST: ${{ vars.DEPLOY_HOST }}",
    "DEPLOY_USER: ${{ vars.DEPLOY_USER }}",
    "APP_URL: ${{ vars.APP_URL }}",
    "DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}",
    "DEPLOY_KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}",
    "REGISTRY_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
  ]) assert.ok(deploy.includes(mapping), `untrusted deploy value must be passed through env: ${mapping}`);
  assert.doesNotMatch(deploy, /StrictHostKeyChecking\s+no|UserKnownHostsFile=\/dev\/null/i);
  assert.match(deploy, /StrictHostKeyChecking yes/);
  assert.match(section(deploy, "deploy", 2), /concurrency:[\s\S]*?group: deploy-\$\{\{ inputs\.environment \}\}[\s\S]*?cancel-in-progress: false/);
  assert.match(section(workflows.production, "on"), /^  workflow_dispatch:/m);
  assert.doesNotMatch(section(workflows.production, "on"), /^  (?:push|schedule):/m);
  assert.match(workflows.production, /environment: production/);
});

test("Story 6: deploy target script validates its tag and reports configured state", async (t) => {
  const script = stepRun(workflows.deploy, "target");
  const dir = await mkdtemp(path.join(os.tmpdir(), "devops-deploy-script-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  async function execute(overrides = {}) {
    const output = path.join(dir, `out-${Math.random()}`);
    const envFile = path.join(dir, `env-${Math.random()}`);
    const env = {
      ...process.env,
      IMAGE_TAG: "sha-1a2b3c4",
      DEPLOY_HOST: "",
      DEPLOY_USER: "deploy",
      APP_URL: "https://clinic.internal",
      ENVIRONMENT: "staging",
      GITHUB_REPOSITORY: "Owner/Repo",
      GITHUB_OUTPUT: output,
      GITHUB_ENV: envFile,
      ...overrides,
    };
    const result = spawnSync(process.env.BASH ?? "bash", ["-c", script], { encoding: "utf8", env });
    return { result, output: await readFile(output, "utf8").catch(() => ""), env: await readFile(envFile, "utf8").catch(() => "") };
  }

  const skipped = await execute();
  assert.equal(skipped.result.status, 0, skipped.result.stderr);
  assert.match(skipped.result.stdout, /::notice title=Deploy skipped::/);
  assert.doesNotMatch(skipped.output, /configured=true/);
  for (const IMAGE_TAG of ["x; rm -rf /", "-bad", "", "a".repeat(129)]) {
    const invalid = await execute({ IMAGE_TAG });
    assert.notEqual(invalid.result.status, 0, `accepted invalid IMAGE_TAG ${IMAGE_TAG}`);
  }
  for (const IMAGE_TAG of ["sha-1a2b3c4", "1.2.3", "latest"]) {
    const valid = await execute({ IMAGE_TAG });
    assert.equal(valid.result.status, 0, `${IMAGE_TAG}: ${valid.result.stderr}`);
  }
  for (const missing of [{ DEPLOY_USER: "" }, { APP_URL: "" }]) {
    const invalid = await execute({ DEPLOY_HOST: "vm.example", ...missing });
    assert.notEqual(invalid.result.status, 0);
  }
  if (Number((spawnSync("bash", ["--version"], { encoding: "utf8" }).stdout.match(/version (\d+)/)?.[1] ?? "0")) < 4) {
    t.diagnostic("configured-case assertion not executed: lowercase expansion requires Bash 4+, this host provides Bash 3");
    return;
  }
  const configured = await execute({ DEPLOY_HOST: "vm.example" });
  assert.equal(configured.result.status, 0, configured.result.stderr);
  assert.match(configured.output, /^configured=true$/m);
  assert.match(configured.env, /^IMAGE_REPO=owner\/repo$/m);
});
