// No browser or jsdom is available, so these are static checks on public/app.js. They guard the
// specific wiring that UI-001 depends on; behavior is covered by the API tests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

// Returns the source of a top-level function declaration (up to the next top-level closing brace).
function fn(name) {
  const start = source.search(new RegExp(`^(async )?function ${name}\\(`, "m"));
  assert.notEqual(start, -1, `function ${name} exists`);
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end + 3);
}

const assignFn = fn("assignVeterinarian");
const renderFn = fn("renderPatients");
const selectFn = fn("vetSelect");

// Every ${...} inside template literals of the given code, excluding the escapeHtml(...) wrapped ones.
function unescapedInterpolations(code) {
  const out = [];
  for (const m of code.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
    const expr = m[1].trim();
    if (!/^escapeHtml\(/.test(expr)) out.push(expr);
  }
  return out;
}

test("AC4: the assign POST sends the X-Requested-With header the request guard requires, as JSON", () => {
  assert.match(assignFn, /fetch\(`\/api\/patients\/\$\{encodeURIComponent\(patient\.id\)\}\/assign-veterinarian`/);
  assert.match(assignFn, /method:\s*"POST"/);
  assert.match(assignFn, /"X-Requested-With":\s*"vet-agent"/);
  assert.match(assignFn, /"Content-Type":\s*"application\/json"/);
});

test("AC4: an empty selection is sent as null so staff can clear the veterinarian", () => {
  assert.match(assignFn, /select"\)\.value \|\| null/);
});

test("AC4: Save is disabled while the request is in flight and re-enabled only on failure", () => {
  const disable = assignFn.indexOf("button.disabled = true");
  const request = assignFn.indexOf("await fetch(");
  assert.ok(disable !== -1 && disable < request, "button disabled before the request is sent");
  const catchBlock = assignFn.slice(assignFn.indexOf("catch"));
  assert.match(catchBlock, /button\.disabled = false/);
  assert.equal((assignFn.match(/button\.disabled = false/g) ?? []).length, 1, "success path relies on the re-render, not on re-enabling");
});

test("AC4: failures show the server's error message in an error-styled status; success shows a message after reload", () => {
  assert.match(assignFn, /if \(!res\.ok\) throw new Error\(body\.error\)/);
  assert.match(assignFn, /status\.className = "assign-status error"/);
  assert.match(assignFn, /status\.textContent = err\.message/);
  assert.match(assignFn, /refreshPatients\(\{ patientId: patient\.id, message:/);
  assert.match(renderFn, /status\.classList\.add\("success"\)/);
});

test("AC4/AC5: the patient list loads patients, visits and the roster, and derives the open visit like the server does", () => {
  const refresh = fn("refreshPatients");
  for (const url of ["/api/patients", "/api/visits", "/api/veterinarians"]) assert.ok(refresh.includes(`"${url}"`), url);
  assert.match(source, /findLast\(\(v\) => v\.patientId === patientId && v\.status !== "closed"\)/);
});

test("AC4: a pet with no open visit gets a required reason input (maxlength 1000) and a 'Check in for care' button", () => {
  assert.match(renderFn, /<input type="text" required maxlength="1000"/);
  assert.match(renderFn, /Check in for care/);
  assert.match(assignFn, /reasonForVisit: reason\.value/);
});

test("AC4: every assignment select and the reason input have an accessible name", () => {
  assert.match(selectFn, /<select aria-label="/);
  assert.match(renderFn, /<input[^>]*aria-label="/);
  assert.match(renderFn, /class="assign-status" role="status"/);
});

test("AC6: every server-derived string interpolated into innerHTML in the new rendering code goes through escapeHtml", () => {
  // Only template-literal pieces that are safe by construction may be unescaped: the emoji lookup,
  // and the locally-built fragments (care/assign/select markup) that are themselves escaped above.
  const allowed = new Set(['v.name === selectedName ? " selected" : ""', "speciesEmoji(p.species)", "care", "assign", "options", "p.flagged ? ' <span class=\"risk-flag\" title=\"Contains text that looks like instructions to the AI agent. Review this record.\">⚠ review</span>' : \"\""]);
  for (const code of [renderFn, selectFn]) {
    for (const expr of unescapedInterpolations(code)) {
      assert.ok(allowed.has(expr) || /^(escapeHtml|vetSelect)\(/.test(expr), `unescaped interpolation in innerHTML code: \${${expr}}`);
    }
  }
  // The values attackers can control must each appear inside escapeHtml().
  for (const value of ["visit.reasonForVisit", "visit.status", "visit.assignedVeterinarian", "v.name", "v.id", "p.name", "label"]) {
    assert.match(renderFn + selectFn, new RegExp(`escapeHtml\\([^)]*${value.replace(".", "\\.")}`), `${value} is escaped`);
  }
  // vetSelect() escapes its label, ids, and names itself (checked above).
  assert.match(selectFn, /aria-label="\$\{escapeHtml\(label\)\}"/);
  // The locally built fragments contain only escaped data: no raw vet/visit/patient field is spliced in.
  assert.equal(/\$\{(visit|v|p|vet)\.[a-zA-Z]+\}/.test((renderFn + selectFn).replace(/vetSelect\([^`]*`[^`]*`[^)]*\)/g, "").replace(/escapeHtml\([^)]*\)/g, "")), false);
});

test("AC6: error and notice text is written with textContent, never innerHTML", () => {
  assert.equal(/status\.innerHTML/.test(assignFn + renderFn), false);
  assert.match(assignFn, /status\.textContent = err\.message/);
  assert.match(renderFn, /status\.textContent = notice\.message/);
});

test("AC6: existing features are still wired: contact reveal uses its own class, refresh button, chat and pending actions untouched", () => {
  assert.match(renderFn, /row\.querySelector\("\.contact-btn"\)\.addEventListener\("click"/);
  assert.match(renderFn, /class="ghost-btn contact-btn" type="button">Show contact info/);
  assert.match(source, /refreshBtn\.addEventListener\("click", \(\) => refreshPatients\(\)\)/);
  assert.match(source, /\/api\/chat/);
  assert.match(source, /\/api\/actions/);
  assert.match(source, /\/api\/upload/);
});
