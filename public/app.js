const chatScroll = document.getElementById("chatScroll");
const composer = document.getElementById("composer");
const composerInput = document.getElementById("composerInput");
const sendBtn = document.getElementById("sendBtn");
const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const uploadStatus = document.getElementById("uploadStatus");
const patientsList = document.getElementById("patientsList");
const refreshBtn = document.getElementById("refreshBtn");

let sessionId = localStorage.getItem("vetAgentSessionId") || null;
let streaming = false;

function setStatus(state, label) {
  statusDot.className = "pulse-dot" + (state ? ` ${state}` : "");
  statusLabel.textContent = label;
}

function persistSession(id) {
  if (!id || id === sessionId) return;
  sessionId = id;
  localStorage.setItem("vetAgentSessionId", id);
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
  el.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span> ${toolLabel(toolName)}`;
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

async function streamRequest(url, body, { onText, onToolStart, onToolEnd, onDone, onError }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    onError(text || `Request failed (${res.status})`);
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
    { sessionId, message: text },
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

async function handleFile(file) {
  if (!/\.(csv|json)$/i.test(file.name)) {
    setUploadStatus("Please upload a .csv or .json file.", "error");
    return;
  }
  setUploadStatus(`Reading ${file.name}…`);
  const content = await file.text();

  setUploadStatus(`Sending ${file.name} to the agent for intake…`);
  let summary = "";
  let sawError = null;

  await streamRequest(
    "/api/upload",
    { sessionId, filename: file.name, content },
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
    },
  );

  if (sawError) setUploadStatus(`Upload failed: ${sawError}`, "error");
  else setUploadStatus(summary || "Done.", "success");
  refreshPatients();
}

// ---------- Patients list ----------

async function refreshPatients() {
  try {
    const res = await fetch("/api/patients");
    const patients = await res.json();
    renderPatients(patients);
  } catch {
    patientsList.innerHTML = `<p class="empty-hint">Couldn't load patients.</p>`;
  }
}

function speciesEmoji(species) {
  const map = { dog: "🐶", cat: "🐱", bird: "🐦", rabbit: "🐰", fish: "🐠", reptile: "🦎", horse: "🐴" };
  return map[(species || "").toLowerCase()] || "🐾";
}

function renderPatients(patients) {
  if (!patients.length) {
    patientsList.innerHTML = `<p class="empty-hint">No patients on file yet.</p>`;
    return;
  }
  patientsList.innerHTML = "";
  patients
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .forEach((p) => {
      const row = document.createElement("div");
      row.className = "patient-row" + (p.isActive === false ? " inactive" : "");
      row.innerHTML = `
        <div class="avatar">${speciesEmoji(p.species)}</div>
        <div class="info">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="meta">${escapeHtml(p.breed || p.species || "")} · ${escapeHtml(p.owner?.name || "no owner on file")}</div>
        </div>`;
      patientsList.appendChild(row);
    });
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

refreshBtn.addEventListener("click", refreshPatients);

// ---------- Init ----------

setStatus("ready", "ready");
refreshPatients();
