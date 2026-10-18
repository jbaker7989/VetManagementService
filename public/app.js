const chatScroll = document.getElementById("chatScroll");
const composer = document.getElementById("composer");
const composerInput = document.getElementById("composerInput");
const sendBtn = document.getElementById("sendBtn");
const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const uploadStatus = document.getElementById("uploadStatus");
const uploadActions = document.getElementById("uploadActions");
const confirmBtn = document.getElementById("confirmBtn");
const cancelBtn = document.getElementById("cancelBtn");
const patientsList = document.getElementById("patientsList");
const refreshBtn = document.getElementById("refreshBtn");
const pendingActions = document.getElementById("pendingActions");

let sessionId = localStorage.getItem("vetAgentSessionId") || null;
let streaming = false;
let pendingIntakeId = null;

function setStatus(state, label) {
  statusDot.className = "pulse-dot" + (state ? ` ${state}` : "");
  statusLabel.textContent = label;
}

function persistSession(id) {
  if (!id || id === sessionId) return;
  sessionId = id;
  localStorage.setItem("vetAgentSessionId", id);
}

// The server issues every session id; a stored one is resumed only if it is still valid.
async function ensureSession() {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "vet-agent" },
    body: JSON.stringify({ sessionId }),
  });
  persistSession((await res.json()).sessionId);
}

function scrollToBottom() {
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

function addMessage(role, text) {
  const row = document.createElement("div");
  row.className = `msg msg-${role}`;
  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = role === "user" ? "🧑" : "🐾";
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;
  row.append(avatar, bubble);
  chatScroll.appendChild(row);
  scrollToBottom();
  return bubble;
}

function addToolBadge(toolName) {
  const el = document.createElement("div");
  el.className = "msg-tool";
  el.dataset.tool = toolName;
  const dots = document.createElement("span");
  dots.className = "typing-dots";
  dots.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
  el.append(dots, ` ${toolLabel(toolName)}`);
  chatScroll.appendChild(el);
  scrollToBottom();
  return el;
}

function toolLabel(name) {
  const labels = {
    list_patients: "Checking patient records…",
    find_patient: "Looking up patient…",
    upsert_patient: "Saving patient record…",
    list_visits: "Checking visit history…",
    upsert_visit: "Saving visit record…",
  };
  return labels[name] || `Running ${name}…`;
}

function settleToolBadge(el, isError) {
  el.innerHTML = isError ? "⚠ tool error" : "✓ done";
  el.classList.toggle("error", !!isError);
}

async function describeFailure(res) {
  if (res.status === 429) return `Too many requests. Try again in ${res.headers.get("Retry-After") || "a few"} seconds.`;
  const text = await res.text().catch(() => "");
  try {
    return JSON.parse(text).error;
  } catch {
    return text || `Request failed (${res.status})`;
  }
}

async function streamRequest(url, body, { onText, onToolStart, onToolEnd, onDone, onError, onEvent }) {
  await ensureSession();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "vet-agent" },
    body: JSON.stringify({ ...body, sessionId }),
  });

  if (!res.ok || !res.body) {
    onError(await describeFailure(res));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let evt;
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }
      if (evt.type === "session") persistSession(evt.sessionId);
      else if (evt.type === "text") onText(evt.delta);
      else if (evt.type === "tool_start") onToolStart(evt.toolName);
      else if (evt.type === "tool_end") onToolEnd(evt.toolName, evt.isError);
      else if (evt.type === "error") onError(evt.message);
      else if (evt.type === "done") onDone();
      else onEvent?.(evt);
    }
  }
}

async function sendMessage(text) {
  if (streaming) return;
  streaming = true;
  sendBtn.disabled = true;
  setStatus(null, "thinking…");

  addMessage("user", text);
  let bubble = null;
  let fullText = "";
  const toolEls = new Map();

  await streamRequest(
    "/api/chat",
    { message: text },
    {
      onText: (delta) => {
        if (!bubble) bubble = addMessage("agent", "");
        fullText += delta;
        bubble.textContent = fullText;
        scrollToBottom();
      },
      onToolStart: (toolName) => {
        toolEls.set(toolName, addToolBadge(toolName));
      },
      onToolEnd: (toolName, isError) => {
        const el = toolEls.get(toolName);
        if (el) settleToolBadge(el, isError);
        if (toolName.startsWith("upsert_")) refreshPatients();
      },
      onError: (message) => {
        if (!bubble) bubble = addMessage("agent", "");
        bubble.textContent = fullText || `Sorry — something went wrong: ${message}`;
        setStatus("error", "error");
      },
      onDone: () => {
        setStatus("ready", "ready");
      },
    },
  );

  streaming = false;
  sendBtn.disabled = false;
  refreshPatients();
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = composerInput.value.trim();
  if (!text) return;
  composerInput.value = "";
  autoGrow();
  sendMessage(text);
});

composerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

function autoGrow() {
  composerInput.style.height = "auto";
  composerInput.style.height = Math.min(composerInput.scrollHeight, 140) + "px";
}
composerInput.addEventListener("input", autoGrow);

// ---------- Upload ----------

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  }),
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  }),
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files?.[0];
  if (file) handleFile(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
  fileInput.value = "";
});

function setUploadStatus(text, kind) {
  uploadStatus.textContent = text;
  uploadStatus.className = "upload-status" + (kind ? ` ${kind}` : "");
}

function hideUploadActions() {
  pendingIntakeId = null;
  uploadActions.hidden = true;
}

function summaryText(headline, { created, updated, rejected }) {
  const lines = [`${headline}: ${created} created, ${updated} updated, ${rejected.length} rejected.`];
  rejected.forEach((r) => lines.push(`Row ${r.row}: ${r.errors.join("; ")}`));
  return lines.join("\n");
}

function showPreview(preview) {
  const lines = [summaryText("Preview", preview)];
  preview.patients.forEach((p) => lines.push(`${p.action === "created" ? "New" : "Update"}: ${p.name}`));
  setUploadStatus(lines.join("\n"));
  if (preview.pendingId) {
    pendingIntakeId = preview.pendingId;
    uploadActions.hidden = false;
  }
}

async function handleFile(file) {
  if (!/\.(csv|json)$/i.test(file.name)) {
    setUploadStatus("Please upload a .csv or .json file.", "error");
    return;
  }
  hideUploadActions();
  setUploadStatus(`Reading ${file.name}…`);
  const content = await file.text();

  setUploadStatus(`Checking ${file.name}…`);
  let summary = "";
  let sawError = null;
  let preview = null;

  await streamRequest(
    "/api/upload",
    { filename: file.name, content },
    {
      onText: (delta) => {
        summary += delta;
        setUploadStatus(summary);
      },
      onToolStart: () => {},
      onToolEnd: (toolName) => {
        if (toolName.startsWith("upsert_")) refreshPatients();
      },
      onError: (message) => {
        sawError = message;
      },
      onDone: () => {},
      onEvent: (evt) => {
        if (evt.type === "preview") preview = evt;
      },
    },
  );

  if (sawError) setUploadStatus(`Upload failed: ${sawError}`, "error");
  else if (preview) showPreview(preview);
  else setUploadStatus(summary || "Done.", "success");
  refreshPatients();
}

confirmBtn.addEventListener("click", async () => {
  const pendingId = pendingIntakeId;
  hideUploadActions();
  setUploadStatus("Importing…");
  let result = null;
  let sawError = null;

  await streamRequest(
    "/api/upload/confirm",
    { pendingId },
    {
      onText: () => {},
      onToolStart: () => {},
      onToolEnd: () => {},
      onError: (message) => {
        sawError = message;
      },
      onDone: () => {},
      onEvent: (evt) => {
        if (evt.type === "summary") result = evt;
      },
    },
  );

  if (sawError) setUploadStatus(`Import failed: ${sawError}`, "error");
  else setUploadStatus(summaryText("Imported", result), "success");
  refreshPatients();
});

cancelBtn.addEventListener("click", () => {
  hideUploadActions();
  setUploadStatus("Import cancelled. Nothing was saved.");
});

// ---------- Patients list ----------

// notice: { patientId, message } of a just-saved assignment, shown on that pet's row after the reload.
async function refreshPatients(notice) {
  try {
    const [patients, visits, roster] = await Promise.all([
      fetchJson("/api/patients"),
      fetchJson("/api/visits").catch(() => null),
      fetchJson("/api/veterinarians").catch(() => null),
    ]);
    renderPatients(patients, visits, roster, notice);
  } catch {
    patientsList.innerHTML = `<p class="empty-hint">Couldn't load patients.</p>`;
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed`);
  return res.json();
}

function speciesEmoji(species) {
  const map = { dog: "🐶", cat: "🐱", bird: "🐦", rabbit: "🐰", fish: "🐠", reptile: "🦎", horse: "🐴" };
  return map[(species || "").toLowerCase()] || "🐾";
}

// The most recent visit that is not closed; the server stores visits oldest first.
const openVisitFor = (visits, patientId) => visits.findLast((v) => v.patientId === patientId && v.status !== "closed");

// Select value for a vet name set outside the roster (e.g. by the chat agent); saving it changes nothing.
function vetSelect(roster, label, selectedName) {
  const offRoster = selectedName && !roster.some((v) => v.name === selectedName);
  const options = (offRoster ? `<option value="__unchanged__" selected>${escapeHtml(selectedName)} (not on roster)</option>` : "") + roster
    .map((v) => `<option value="${escapeHtml(v.id)}"${v.name === selectedName ? " selected" : ""}>${escapeHtml(v.name)}</option>`)
    .join("");
  return `<select aria-label="${escapeHtml(label)}"><option value="">Unassigned</option>${options}</select>`;
}

async function assignVeterinarian(form, patient, roster) {
  const status = form.querySelector(".assign-status");
  const button = form.querySelector("button");
  const reason = form.querySelector("input");
  const veterinarianId = form.querySelector("select").value || null;
  if (veterinarianId === "__unchanged__") {
    status.className = "assign-status";
    status.textContent = "Choose a veterinarian from the roster to replace this name";
    return;
  }
  if (form.querySelector("select").selectedOptions[0].defaultSelected) {
    status.className = "assign-status";
    status.textContent = "No change to save";
    return;
  }
  button.disabled = true;
  status.className = "assign-status";
  status.textContent = "Saving…";
  try {
    const res = await fetch(`/api/patients/${encodeURIComponent(patient.id)}/assign-veterinarian`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "vet-agent" },
      body: JSON.stringify({ veterinarianId, ...(reason && { reasonForVisit: reason.value }) }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    const vet = roster.find((v) => v.id === veterinarianId);
    await refreshPatients({ patientId: patient.id, message: vet ? `Assigned ${vet.name} to ${patient.name}` : `Cleared the veterinarian for ${patient.name}` });
  } catch (err) {
    status.className = "assign-status error";
    status.textContent = err.message;
    button.disabled = false;
  }
}

function renderPatients(patients, visits, roster, notice) {
  if (!patients.length) {
    patientsList.innerHTML = `<p class="empty-hint">No patients on file yet.</p>`;
    return;
  }
  const degraded = !visits || !roster;
  patientsList.innerHTML = degraded ? `<p class="empty-hint" role="status">Veterinarian list unavailable — assignment disabled</p>` : "";
  patients
    .slice()
    .reverse()
    .forEach((p) => {
      const row = document.createElement("div");
      row.className = "patient-row";
      row.dataset.patientId = p.id;
      const visit = visits && openVisitFor(visits, p.id);
      const care = !visits
        ? ""
        : visit
        ? `<div class="care">${escapeHtml(visit.reasonForVisit || "Visit")} · ${escapeHtml(visit.status)} · ${escapeHtml(visit.assignedVeterinarian || "Unassigned")}</div>`
        : `<div class="care">No open visit</div>`;
      let assign = visit
        ? `${vetSelect(roster, `Veterinarian for ${p.name}`, visit.assignedVeterinarian)}<button class="ghost-btn" type="submit">Save</button>`
        : `<input type="text" required maxlength="1000" placeholder="Reason for visit" aria-label="Reason for visit for ${escapeHtml(p.name)}" />${vetSelect(roster, `Veterinarian for ${p.name}`, null)}<button class="ghost-btn" type="submit">Check in for care</button>`;
      assign = degraded ? "" : `<form class="assign-form">${assign}<div class="assign-status" role="status"></div></form>`;
      row.innerHTML = `
        <div class="avatar">${speciesEmoji(p.species)}</div>
        <div class="info">
          <div class="name">${escapeHtml(p.name)}${p.flagged ? ' <span class="risk-flag" title="Contains text that looks like instructions to the AI agent. Review this record.">⚠ review</span>' : ""}</div>
          <div class="meta">${escapeHtml(p.species || "")} · ${escapeHtml(p.ownerFirstName || "no owner on file")}</div>
          ${care}
          <div class="contact" hidden></div>
          ${assign}
        </div>
        <button class="ghost-btn contact-btn" type="button">Show contact info</button>`;
      row.querySelector(".contact-btn").addEventListener("click", (e) => toggleContact(p.id, e.currentTarget, row.querySelector(".contact")));
      const form = row.querySelector(".assign-form");
      if (form && notice?.patientId === p.id) {
        const status = form.querySelector(".assign-status");
        status.classList.add("success");
        status.textContent = notice.message;
      }
      form?.addEventListener("submit", (e) => {
        e.preventDefault();
        assignVeterinarian(form, p, roster);
      });
      patientsList.appendChild(row);
    });
}

async function toggleContact(patientId, button, contactEl) {
  if (!contactEl.hidden) {
    contactEl.hidden = true;
    button.textContent = "Show contact info";
    return;
  }
  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}/contact`);
  if (!res.ok) {
    contactEl.textContent = "Couldn't load contact info.";
  } else {
    const { owner } = await res.json();
    contactEl.innerHTML = ["name", "phone", "email", "address"]
      .map((field) => `${field}: ${escapeHtml(owner?.[field] || "—")}`)
      .join("<br>");
  }
  contactEl.hidden = false;
  button.textContent = "Hide contact info";
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

refreshBtn.addEventListener("click", () => refreshPatients());

// ---------- Pending agent changes (approval gate) ----------

function formatValue(value) {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function renderPendingActions(actions) {
  pendingActions.innerHTML = "";
  actions.forEach((action) => {
    const card = document.createElement("div");
    card.className = "pending-action";
    const rows = action.changes
      .map(
        (c) => `
          <tr class="${c.highRisk ? "high-risk" : ""}">
            <th>${escapeHtml(c.field)}${c.highRisk ? ' <span class="risk-flag">⚠ high risk</span>' : ""}</th>
            <td class="before">${c.appended ? "(added to existing)" : escapeHtml(formatValue(c.before))}</td>
            <td class="after">${escapeHtml(formatValue(c.after))}</td>
          </tr>`,
      )
      .join("");
    card.innerHTML = `
      <div class="pending-title">Agent proposes: ${escapeHtml(action.summary)}</div>
      <table class="diff"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="upload-actions">
        <button class="ghost-btn" data-decision="approve" type="button">Approve</button>
        <button class="ghost-btn" data-decision="reject" type="button">Reject</button>
      </div>`;
    card.querySelectorAll("button").forEach((button) =>
      button.addEventListener("click", async () => {
        card.querySelectorAll("button").forEach((b) => (b.disabled = true));
        await fetch(`/api/actions/${encodeURIComponent(action.id)}/${button.dataset.decision}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "vet-agent" },
          body: JSON.stringify({ sessionId }),
        });
        pollPendingActions();
      }),
    );
    pendingActions.appendChild(card);
  });
}

let lastPendingKey = "";
async function pollPendingActions() {
  if (!sessionId) return;
  try {
    const res = await fetch(`/api/actions?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return;
    const actions = await res.json();
    // Skip identical lists so a card isn't rebuilt under the user's cursor.
    const key = actions.map((a) => a.id).join();
    if (key === lastPendingKey) return;
    lastPendingKey = key;
    renderPendingActions(actions);
    if (actions.length) scrollToBottom();
  } catch {
    // transient; the next poll retries
  }
}
setInterval(pollPendingActions, 1500);

// ---------- Init ----------

setStatus("ready", "ready");
refreshPatients();
ensureSession().catch(() => {});
