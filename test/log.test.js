import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Story 10: stdout and stderr log lines start with ISO-8601 timestamps", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", 'import("./lib/log.js").then(({ log, logError }) => { log("startup"); logError("failure"); });'], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z startup$/);
  assert.match(result.stderr.trim(), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z failure$/);
});
