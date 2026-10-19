import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, cp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runId = `vet-agent-test-${process.pid}-${randomBytes(4).toString("hex")}`;
const image = `${runId}:phase-a`;
const project = runId;
const apiKey = `docker-qa-${randomBytes(12).toString("hex")}`;
const hasDaemon = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
let tempDir;
let envFile;

function docker(args, options = {}) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function dockerResult(args) {
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function inspect(name) {
  return JSON.parse(docker(["inspect", name]))[0];
}

function labeledRunArgs(name) {
  return ["run", "-d", "--name", name, "--label", `vet-agent-test=${runId}`];
}

async function waitFor(check, message, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    try {
      lastValue = await check();
      if (lastValue) return lastValue;
    } catch (error) {
      lastValue = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`${message}; last result: ${lastValue}`);
}

async function startApp(name, publishPort = false) {
  const args = labeledRunArgs(name);
  args.push("--env-file", envFile);
  if (publishPort) args.push("-p", "127.0.0.1::3000");
  args.push(image);
  docker(args);
  await waitFor(
    () => inspect(name).State.Health?.Status === "healthy",
    `${name} did not become healthy`,
  );
  return inspect(name);
}

async function cleanupByLabel() {
  for (const resource of ["container", "volume", "network"]) {
    const listFlags = resource === "container" ? "-aq" : "-q";
    const ids = docker([resource, "ls", listFlags, "--filter", `label=vet-agent-test=${runId}`])
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    if (ids.length) {
      const flags = resource === "container" ? ["-f", "-v"] : resource === "volume" ? ["-f"] : [];
      docker([resource, "rm", ...flags, ...ids]);
    }
  }
  const images = docker(["image", "ls", "-aq", "--filter", `label=vet-agent-test=${runId}`])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (images.length) docker(["image", "rm", "-f", ...images]);
  try {
    docker(["image", "rm", "-f", image]);
  } catch {}
}

if (!hasDaemon) {
  console.log("SKIP Docker tier: docker info failed; no usable Docker daemon is available.");
}

describe("DEVOPS-001 Docker acceptance", { skip: !hasDaemon, concurrency: false }, () => {

  before(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), `${runId}-`));
    envFile = path.join(tempDir, "runtime.env");
    await writeFile(
      envFile,
      `OPENROUTER_API_KEY=${apiKey}\nHOST=0.0.0.0\nALLOW_PUBLIC_BIND=true\n`,
    );
    docker(["build", "--label", `vet-agent-test=${runId}`, "-t", image, "."]);
  });

  after(async () => {
    await cleanupByLabel();
    const remaining = docker([
      "volume", "ls", "-q", "--filter", `label=vet-agent-test=${runId}`,
    ]).trim();
    assert.equal(remaining, "", "test volumes remain after cleanup");
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("Story 1: runs as non-root", () => {
    const metadata = JSON.parse(docker(["image", "inspect", image]))[0];
    assert.equal(metadata.Config.User, "node");
    assert.notEqual(docker([
      "run", "--rm", "--entrypoint", "sh", image, "-c", "id -u",
    ]).trim(), "0");
  });

  it("Story 1: excludes development and secret files", () => {
    const files = docker([
      "run", "--rm", "--entrypoint", "sh", image,
      "-c", "find /app -maxdepth 2 -print",
    ]).split("\n");
    for (const forbidden of [
      "/app/test", "/app/docs", "/app/.git", "/app/.env", "/app/node_modules/@types",
    ]) {
      assert.ok(!files.includes(forbidden), `${forbidden} was included in the image`);
    }
  });

  it("Story 2: declares persistent data volume", () => {
    const metadata = JSON.parse(docker(["image", "inspect", image]))[0];
    assert.ok(metadata.Config.Volumes["/app/agent-home/memory"]);
  });

  it("Story 2: preserves data across down and up, then removes it with down -v", async () => {
    const baseConfig = JSON.parse(docker([
      "compose", "-f", path.join(root, "docker-compose.yml"), "config", "--format", "json",
    ]));
    assert.equal(baseConfig.services.app.ports[0].host_ip, "127.0.0.1");
    assert.equal(baseConfig.services.app.ports[0].published, "3000");

    const safeConfig = structuredClone(baseConfig);
    safeConfig.services.app.ports = [{ target: 3000, published: "0", host_ip: "127.0.0.1" }];
    safeConfig.services.app.image = image;
    delete safeConfig.services.app.build;
    safeConfig.services.app.labels = { ...safeConfig.services.app.labels, "vet-agent-test": runId };
    safeConfig.volumes["vet-memory"].labels = {
      ...safeConfig.volumes["vet-memory"].labels,
      "vet-agent-test": runId,
    };
    safeConfig.networks.default.labels = {
      ...safeConfig.networks.default.labels,
      "vet-agent-test": runId,
    };
    const composeFile = path.join(tempDir, "compose-safe.json");
    await writeFile(composeFile, JSON.stringify(safeConfig));
    const compose = ["compose", "-p", project, "-f", composeFile];

    docker([...compose, "up", "-d", "--wait"]);
    const appId = docker([...compose, "ps", "-q", "app"]).trim();
    docker(["exec", appId, "sh", "-c", "printf persisted > /app/agent-home/memory/qa-marker"]);
    docker([...compose, "down"]);
    docker([...compose, "up", "-d", "--wait"]);
    const restartedId = docker([...compose, "ps", "-q", "app"]).trim();
    assert.equal(docker(["exec", restartedId, "cat", "/app/agent-home/memory/qa-marker"]).trim(), "persisted");
    docker([...compose, "down", "-v"]);

    const volumes = docker(["volume", "ls", "-q", "--filter", `label=vet-agent-test=${runId}`]);
    assert.equal(volumes.trim(), "", "down -v should remove the labeled data volume");
  });

  it("Story 2: dev override enables watch mode and source bind mount", () => {
    const devConfig = JSON.parse(docker([
      "compose",
      "-f", path.join(root, "docker-compose.yml"),
      "-f", path.join(root, "docker-compose.dev.yml"),
      "config", "--format", "json",
    ]));
    assert.deepEqual(devConfig.services.app.command, ["node", "--watch", "server.js"]);
    assert.ok(devConfig.services.app.volumes.some((volume) => volume.type === "bind" && volume.target === "/app"));
  });

  it("Story 3: starts healthy and serves health endpoint", async () => {
    const name = `${runId}-health`;
    const app = await startApp(name, true);
    assert.equal(docker(["exec", name, "printenv", "OPENROUTER_API_KEY"]).trim(), apiKey);
    const hostPort = app.NetworkSettings.Ports["3000/tcp"][0].HostPort;
    const response = await fetch(`http://127.0.0.1:${hostPort}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  it("Story 3: SIGTERM exits cleanly", async () => {
    const name = `${runId}-term`;
    await startApp(name);
    docker(["stop", "--time", "15", name]);
    const app = inspect(name);
    assert.equal(app.State.ExitCode, 0);
    assert.match(docker(["logs", name]), /shutdown: complete/);
  });

  it("Story 3: SIGINT exits cleanly", async () => {
    const name = `${runId}-int`;
    await startApp(name);
    docker(["kill", "--signal=SIGINT", name]);
    await waitFor(() => inspect(name).State.Status === "exited", "SIGINT did not stop container");
    assert.equal(inspect(name).State.ExitCode, 0);
    assert.match(docker(["logs", name]), /shutdown: complete/);
  });

  it("Story 7: runtime key is present but absent from image metadata and layers", async () => {
    const name = `${runId}-secret`;
    await startApp(name);
    assert.equal(docker(["exec", name, "printenv", "OPENROUTER_API_KEY"]).trim(), apiKey);

    const inspectData = docker(["image", "inspect", image]);
    const history = docker(["history", "--no-trunc", image]);
    assert.ok(!inspectData.includes(apiKey), "runtime key appears in image config");
    assert.ok(!history.includes(apiKey), "runtime key appears in image history");

    const archive = path.join(tempDir, "image.tar");
    docker(["image", "save", "-o", archive, image]);
    const manifest = execFileSync("tar", ["-xOf", archive, "manifest.json"], { encoding: "utf8" });
    const layers = JSON.parse(manifest)[0].Layers;
    for (const layer of layers) {
      const compressedLayer = execFileSync("tar", ["-xOf", archive, layer], {
        maxBuffer: 256 * 1024 * 1024,
      });
      const isGzip = compressedLayer[0] === 0x1f && compressedLayer[1] === 0x8b;
      const layerContents = isGzip
        ? gunzipSync(compressedLayer, { maxOutputLength: 512 * 1024 * 1024 })
        : compressedLayer;
      assert.ok(!layerContents.includes(Buffer.from(apiKey)), `runtime key appears in layer ${layer}`);
    }
  });

  it("Story 8: image fits the 650 MB budget and has expected launch config", () => {
    const metadata = JSON.parse(docker(["image", "inspect", image]))[0];
    const sizeMb = metadata.Size / 1_000_000;
    console.log(`Story 8 measured image size: ${sizeMb.toFixed(1)} MB (650 MB budget).`);
    assert.ok(metadata.Size <= 650_000_000, `image is ${sizeMb.toFixed(1)} MB`);
    assert.deepEqual(metadata.Config.Cmd, ["node", "server.js"]);
    assert.ok(metadata.Config.ExposedPorts["3000/tcp"]);
    assert.ok(!metadata.Config.Env.some((entry) => entry.startsWith("OPENROUTER_API_KEY=")));
  });

  it("Story 8: reuses npm ci layer after only public file changes", async () => {
    const context = path.join(tempDir, "cache-context");
    await cp(root, context, {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}.git`) && !source.includes(`${path.sep}node_modules`),
    });
    const publicDir = path.join(context, "public");
    const publicFiles = (await readdir(publicDir)).filter((name) => name.endsWith(".js"));
    assert.ok(publicFiles.length > 0, "public directory has no JavaScript file to touch");
    const publicFile = path.join(publicDir, publicFiles[0]);
    const original = await readFile(publicFile, "utf8");
    await writeFile(publicFile, `${original}\n// cache regression probe\n`);

    const output = dockerResult([
      "build", "--progress=plain", "--label", `vet-agent-test=${runId}`,
      "-t", `${runId}:cache-check`, context,
    ]);
    assert.match(output, /\[deps [^\]]+\] RUN npm ci[^\n]*\n[^\n]*CACHED/i);
    const cachedImage = JSON.parse(docker(["image", "inspect", `${runId}:cache-check`]))[0];
    assert.ok(cachedImage.Size <= 650_000_000);
  });

  it("Story 10: app logs go to Docker and it creates no .log files", async () => {
    const name = `${runId}-logs`;
    const app = await startApp(name, true);
    const beforeRequest = docker(["diff", name]);
    const hostPort = app.NetworkSettings.Ports["3000/tcp"][0].HostPort;
    const response = await fetch(`http://127.0.0.1:${hostPort}/health`);
    assert.equal(response.status, 200);
    const changes = docker(["diff", name]);
    const logChanges = changes.split(/\r?\n/).filter((line) => /\.log(?:$|\/)/i.test(line));
    assert.deepEqual(logChanges, [], `container added or changed log paths (before: ${beforeRequest})`);
    assert.match(docker(["logs", name]), /^\d{4}-\d\d-\d\dT[\d:.]+Z Vet clinic agent front end running/m);
  });
});
