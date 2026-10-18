import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runId = `vet-agent-pipeline-${process.pid}-${randomBytes(4).toString("hex")}`;
const testRepo = `qa-${randomBytes(4).toString("hex")}/vet-agent`;
const image = `ghcr.io/${testRepo}:sha-test`;
const project = runId.toLowerCase();
const hasDaemon = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

function docker(args, options = {}) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function compose(args, options = {}) {
  return docker(["compose", "-p", project, ...args], options);
}

function configResult(file, env) {
  return spawnSync("docker", ["compose", "-f", file, "config", "--format", "json"], {
    cwd: path.dirname(file),
    encoding: "utf8",
    env: { ...process.env, IMAGE_REPO: "", IMAGE_TAG: "", ...env },
  });
}

if (!hasDaemon) console.log("SKIP Docker pipeline tier: docker info failed; no usable Docker daemon is available.");

test("Story 4/5/6: actionlint accepts the GitHub Actions workflows", { skip: !hasDaemon, timeout: 300000 }, () => {
  docker(["run", "--rm", "-v", `${root}:/repo:ro`, "-w", "/repo", "rhysd/actionlint:1.7.12", "-color"]);
});

test("Story 6/9: deploy Compose requires image inputs and resolves locked-down runtime settings", { skip: !hasDaemon }, async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vet-compose-config-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "docker-compose.deploy.yml");
  await writeFile(file, await readFile(path.join(root, "docker-compose.deploy.yml"), "utf8"));
  await writeFile(path.join(dir, ".env"), "");

  for (const env of [{}, { IMAGE_TAG: "sha-abc1234" }, { IMAGE_REPO: "owner/repo" }]) {
    const result = configResult(file, env);
    assert.notEqual(result.status, 0, `compose config unexpectedly accepted ${JSON.stringify(env)}`);
    assert.match(result.stderr, /IMAGE_(?:TAG|REPO)/);
  }
  const config = configResult(file, { IMAGE_REPO: "owner/repo", IMAGE_TAG: "sha-abc1234" });
  assert.equal(config.status, 0, config.stderr);
  const service = JSON.parse(config.stdout).services.app;
  assert.equal(service.image, "ghcr.io/owner/repo:sha-abc1234");
  assert.equal(service.ports[0].host_ip, "127.0.0.1");
  assert.ok(service.volumes.some((volume) => volume.target === "/app/agent-home/memory"));
  assert.equal(service.environment.HOST, "0.0.0.0");
  assert.equal(service.environment.ALLOW_PUBLIC_BIND, "true");
  assert.equal(service.stop_grace_period, "15s");
  const server = await readFile(path.join(root, "server.js"), "utf8");
  assert.match(server, /shutdownTimeoutMs\s*=\s*Number\(process\.env\.SHUTDOWN_TIMEOUT_MS\)\s*\|\|\s*10\s*\*\s*1000/);
});

test("Story 6: deployed Compose project starts, serves health, and records the old image tag", { skip: !hasDaemon, timeout: 300000 }, async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vet-compose-deploy-"));
  const composeFile = path.join(dir, "docker-compose.deploy.yml");
  const overrideFile = path.join(dir, "ports.yml");
  const envFile = path.join(dir, ".env");
  const secondTag = `ghcr.io/${testRepo}:sha-second`;
  let composeStarted = false;
  t.after(async () => {
    const containers = docker(["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`])
      .trim().split(/\r?\n/).filter(Boolean);
    if (containers.length) docker(["rm", "-f", "-v", ...containers]);
    if (composeStarted) {
      try { compose(["-f", composeFile, "-f", overrideFile, "down", "-v", "--remove-orphans"]); } catch {}
    }
    const volumes = docker(["volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`])
      .trim().split(/\r?\n/).filter(Boolean);
    if (volumes.length) docker(["volume", "rm", "-f", ...volumes]);
    const networks = docker(["network", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`])
      .trim().split(/\r?\n/).filter(Boolean);
    if (networks.length) docker(["network", "rm", ...networks]);
    try { docker(["image", "rm", "-f", image, secondTag]); } catch {}
    await rm(dir, { recursive: true, force: true });
  });

  await writeFile(composeFile, await readFile(path.join(root, "docker-compose.deploy.yml"), "utf8"));
  await writeFile(overrideFile, "services:\n  app:\n    ports:\n      - \"127.0.0.1:0:3000\"\n");
  await writeFile(envFile, `OPENROUTER_API_KEY=${runId}-dummy\nALLOW_PUBLIC_BIND=true\n`);
  const env = { ...process.env, IMAGE_REPO: testRepo, IMAGE_TAG: "sha-test" };
  docker(["build", "--label", `vet-agent-test=${runId}`, "-t", image, "."]);
  composeStarted = true;
  compose(["-f", composeFile, "-f", overrideFile, "up", "-d", "--wait"], { env });

  const container = compose(["ps", "-q", "app"], { env }).trim();
  assert.ok(container, "Compose did not create the app container");
  const ports = JSON.parse(docker(["inspect", "--format", "{{json .NetworkSettings.Ports}}", container]));
  const port = ports["3000/tcp"][0].HostPort;
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });

  docker(["tag", image, secondTag]);
  const previousImage = docker(["inspect", "--format", "{{.Config.Image}}", container]).trim();
  assert.equal(previousImage, image, "the deploy switch reads this value before bringing up the second tag");
  assert.equal(previousImage.split(":").at(-1), "sha-test");
  compose(["-f", composeFile, "-f", overrideFile, "up", "-d", "--wait"], {
    env: { ...env, IMAGE_TAG: "sha-second" },
  });
  const redeployed = compose(["ps", "-q", "app"], { env: { ...env, IMAGE_TAG: "sha-second" } }).trim();
  assert.equal(docker(["inspect", "--format", "{{.Config.Image}}", redeployed]).trim(), secondTag);
});
