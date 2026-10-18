import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createApp } from "../server.js";
import { installShutdown } from "../lib/shutdown.js";

const signals = ["SIGTERM", "SIGINT"];
function baseline() { return Object.fromEntries(signals.map((signal) => [signal, process.listeners(signal)])); }
function cleanup(before) {
  for (const signal of signals) {
    const prior = new Set(before[signal]);
    for (const listener of process.listeners(signal)) if (!prior.has(listener)) process.removeListener(signal, listener);
  }
}
function fakeServer({ closeEvent = true } = {}) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    close() { if (closeEvent) queueMicrotask(() => emitter.emit("close")); },
    closeIdleConnections() {},
  });
}
function completion() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("Story 3: shutdown wiring and signal handling", async (t) => {
  const initial = baseline();
  createApp();
  assert.deepEqual(baseline(), initial, "createApp must not install process handlers");

  await t.test("SIGTERM closes server, snapshots, then exits successfully", async (t) => {
    const before = baseline(); t.after(() => cleanup(before));
    const order = [];
    const done = completion();
    installShutdown(fakeServer(), { snapshot: async () => { order.push("snapshot"); }, timeoutMs: 1000, exit: (code) => { order.push(`exit:${code}`); done.resolve(); } });
    assert.equal(process.listenerCount("SIGTERM"), before.SIGTERM.length + 1);
    process.emit("SIGTERM");
    await done.promise;
    assert.deepEqual(order, ["snapshot", "exit:0"]);
  });

  await t.test("failed final snapshot exits with status 1", async (t) => {
    const before = baseline(); t.after(() => cleanup(before));
    const done = completion();
    installShutdown(fakeServer(), { snapshot: async () => { throw new Error("snapshot failed"); }, timeoutMs: 1000, exit: (code) => done.resolve(code) });
    process.emit("SIGTERM");
    assert.equal(await done.promise, 1);
  });

  await t.test("shutdown deadline exits with status 1 when close never completes", async (t) => {
    const before = baseline(); t.after(() => cleanup(before));
    const done = completion();
    installShutdown(fakeServer({ closeEvent: false }), { snapshot: async () => {}, timeoutMs: 15, exit: (code) => done.resolve(code) });
    process.emit("SIGTERM");
    assert.equal(await done.promise, 1);
  });

  await t.test("second shutdown signal is ignored", async (t) => {
    const before = baseline(); t.after(() => cleanup(before));
    const done = completion();
    const snapshotDone = completion();
    const snapshotStarted = completion();
    let snapshots = 0;
    installShutdown(fakeServer(), { snapshot: async () => { snapshots++; snapshotStarted.resolve(); await snapshotDone.promise; }, timeoutMs: 1000, exit: (code) => done.resolve(code) });
    process.emit("SIGTERM");
    await snapshotStarted.promise;
    process.emit("SIGINT");
    assert.equal(snapshots, 1);
    snapshotDone.resolve();
    assert.equal(await done.promise, 0);
  });
});
