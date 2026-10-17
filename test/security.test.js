import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveListenHost, assertSafeAgentSettings } from "../lib/startupChecks.js";
import { startTestApp } from "./helpers/app.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function request(url, { method = "GET", headers = {}, body } = {}) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method,
        headers: { Host: target.host, ...headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

test("listen host defaults to loopback and accepts private addresses", () => {
  assert.equal(resolveListenHost({}), "127.0.0.1");
  assert.equal(resolveListenHost({ HOST: "localhost" }), "localhost");
  assert.equal(resolveListenHost({ HOST: "192.168.1.20" }), "192.168.1.20");
  assert.equal(resolveListenHost({ HOST: "10.0.0.2" }), "10.0.0.2");
});

test("listen host rejects wildcard, public, and unknown hosts unless explicitly allowed", () => {
  for (const HOST of ["0.0.0.0", "::", "8.8.8.8", "clinic.example"]) {
    assert.throws(() => resolveListenHost({ HOST }), /Refusing to bind/);
    assert.equal(resolveListenHost({ HOST, ALLOW_PUBLIC_BIND: "true" }), HOST);
  }
});

test("agent settings reject blanket project trust and repository settings pass", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vet-settings-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "settings.json");
  await writeFile(file, JSON.stringify({ defaultProjectTrust: "always" }));
  assert.throws(() => assertSafeAgentSettings(file), /defaultProjectTrust/);
  assert.doesNotThrow(() => assertSafeAgentSettings(path.join(root, "agent-home/settings.json")));
});

test("request guard rejects disallowed hosts and untrusted API origins", async (t) => {
  const app = await startTestApp();
  t.after(() => app.close());
  const body = JSON.stringify({ message: "hello" });
  const post = {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "vet-agent" },
    body,
  };
  assert.equal((await request(app.url, { headers: { Host: "attacker.example" } })).status, 403);
  assert.equal(
    (await request(app.url, { ...post, headers: { ...post.headers, Host: "attacker.example" } })).status,
    403,
  );
  for (const headers of [
    { Origin: "https://attacker.example" },
    { Referer: "https://attacker.example/page" },
    { Origin: "null" },
  ]) {
    assert.equal(
      (await request(`${app.url}/api/patients`, { headers: { Host: new URL(app.url).host, ...headers } })).status,
      403,
    );
    assert.equal(
      (await request(`${app.url}/api/chat`, { ...post, headers: { ...post.headers, ...headers } })).status,
      403,
    );
  }
  assert.equal(
    (
      await request(`${app.url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: app.url },
        body,
      })
    ).status,
    403,
  );
  const valid = await request(`${app.url}/api/chat`, { ...post, headers: { ...post.headers, Origin: app.url } });
  assert.equal(valid.status, 200);
  assert.equal(
    Object.keys(valid.headers).some((name) => name.startsWith("access-control-allow-")),
    false,
  );
  const preflight = await request(`${app.url}/api/chat`, {
    method: "OPTIONS",
    headers: { Origin: "https://attacker.example", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(preflight.status, 403);
  assert.equal(
    Object.keys(preflight.headers).some((name) => name.startsWith("access-control-allow-")),
    false,
  );
});

test("browser stream requests include the required custom header", async () => {
  const source = await readFile(path.join(root, "public/app.js"), "utf8");
  assert.match(source, /async function streamRequest[\s\S]*?"X-Requested-With": "vet-agent"/);
});

test("MCP source omits freeform chat and documents opt-in use", async () => {
  const source = await readFile(path.join(root, "agent-home/mcp/server.js"), "utf8");
  assert.doesNotMatch(source, /vet_agent_chat/);
  for (const name of ["list_patients", "find_patient", "upsert_patient", "list_visits", "upsert_visit", "bulk_intake"])
    assert.match(source, new RegExp(`\\"${name}\\"`));
  const [skill, readme] = await Promise.all([
    readFile(path.join(root, "agent-home/mcp/SKILL.md"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
  ]);
  assert.match(skill, /opt-in|optional/i);
  assert.match(readme, /opt-in|standalone/i);
});
