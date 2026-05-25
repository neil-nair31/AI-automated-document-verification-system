// app.js
// -----------------------------------------------------------------------------
// View routing, app state, and per-view wiring for the Document Verification
// Platform frontend.
//
// Architecture, exactly as specced:
//   - One central appState object. Every view reads from it; only api.js and
//     this file write to it.
//   - All view-switching goes through renderView(name, params). No URL
//     routing library. window.location.hash drives navigation so the
//     browser's back/forward buttons work.
//   - All data access through api.js. mockData.js is imported only for the
//     STAGES label lookup.
//   - RBAC enforced inside onHashChange / renderView, not just by hiding the
//     nav button. An OPERATOR pasting #rules into the URL bar is bounced.
// -----------------------------------------------------------------------------

import * as api from "./api.js";
import { STAGES } from "./mockData.js";

// ===========================================================================
// State
// ===========================================================================

const appState = {
  currentUser: null,
  currentVerificationId: null,
  uploadForm: createEmptyUploadForm(),
  rulesEdit: null,
};

function createEmptyUploadForm() {
  return { country: "", files: [], submitting: false };
}

// ===========================================================================
// Boot
// ===========================================================================

function init() {
  wireTopBar();
  wireLogin();
  wireUpload();
  window.addEventListener("hashchange", onHashChange);
  // First render based on whatever hash is in the URL (likely "" → #login).
  onHashChange();
}

document.addEventListener("DOMContentLoaded", init);

// ===========================================================================
// View routing
// ===========================================================================

const VIEW_NAMES = ["login", "upload", "result", "rules"];

function parseHash() {
  const raw = (location.hash || "#login").replace(/^#/, "");
  const [name, ...params] = raw.split("/");
  return { name: name || "login", params };
}

function setHash(name, ...params) {
  const next = "#" + [name, ...params].filter(Boolean).join("/");
  if (location.hash === next) {
    onHashChange();
  } else {
    location.hash = next;
  }
}

async function onHashChange() {
  const { name, params } = parseHash();

  // Auth gate. Every view except #login requires a signed-in user. Hard
  // refresh from a post-login screen lands here with currentUser === null
  // (in-memory session lost), which is the expected behaviour.
  if (name !== "login" && !appState.currentUser) {
    return setHash("login");
  }
  // Already signed in but visiting #login? Bounce to #upload.
  if (name === "login" && appState.currentUser) {
    return setHash("upload");
  }
  // RBAC redirect.
  if (name === "rules" && appState.currentUser?.role !== "ADMIN") {
    return setHash("upload");
  }

  if (!VIEW_NAMES.includes(name)) {
    return setHash(appState.currentUser ? "upload" : "login");
  }

  await renderView(name, params);
}

async function renderView(name, params = []) {
  // Hide all views. Single visible view at a time.
  for (const v of VIEW_NAMES) {
    document.getElementById(`view-${v}`).hidden = true;
  }
  // Top bar visibility + active-nav indicator.
  document.getElementById("topbar").hidden = (name === "login");
  for (const link of document.querySelectorAll(".topbar__nav-link")) {
    link.classList.toggle("is-active", link.dataset.nav === name);
  }
  document.querySelector('[data-nav="rules"]').hidden =
    appState.currentUser?.role !== "ADMIN";

  // Reset transient form state when leaving a view. Prevents the upload
  // form being re-submitted via back-button after a successful submit.
  if (name !== "upload") {
    appState.uploadForm = createEmptyUploadForm();
    resetUploadView();
  }
  if (name !== "rules") {
    appState.rulesEdit = null;
  }

  document.getElementById(`view-${name}`).hidden = false;

  switch (name) {
    case "login": resetLoginView(); break;
    case "upload": renderUploadView(); break;
    case "result": await renderResultView(params[0]); break;
    case "rules": await renderRulesView(); break;
  }
}

// ===========================================================================
// Top bar
// ===========================================================================

function wireTopBar() {
  document.getElementById("signout-btn").addEventListener("click", onSignOut);
}

async function onSignOut() {
  await api.logout();
  appState.currentUser = null;
  appState.currentVerificationId = null;
  appState.uploadForm = createEmptyUploadForm();
  appState.rulesEdit = null;
  setHash("login");
}

function renderTopBar() {
  const u = appState.currentUser;
  document.getElementById("topbar-user-name").textContent = u ? u.displayName : "";
  document.getElementById("topbar-user-email").textContent = u ? u.email : "";
}

// ===========================================================================
// Login
// ===========================================================================

function wireLogin() {
  document.getElementById("login-btn").addEventListener("click", onLoginClick);
}

async function onLoginClick() {
  const btn = document.getElementById("login-btn");
  // Double-click guard: disable on first click; stay disabled until the
  // promise settles. Without this a fast clicker can fire loginWithEntra
  // multiple times before currentSession is set.
  if (btn.disabled) return;
  btn.disabled = true;
  setLoginButtonState("loading");
  hideLoginError();

  // DECISION: if no role is picked from the dev dropdown (only possible if
  // someone deletes the default selected option via DOM tampering), default
  // to OPERATOR. OPERATOR is the more restrictive role; defaulting to it
  // means we cannot accidentally grant ADMIN during dev.
  const dropdown = document.getElementById("dev-role");
  const roleHint = (dropdown && dropdown.value) || "OPERATOR";

  try {
    await api.loginWithEntra(roleHint);
    appState.currentUser = await api.getCurrentUser();
    renderTopBar();
    setHash("upload");
  } catch (err) {
    showLoginError(err.message || "Sign-in failed. Try again.");
    btn.disabled = false;
    setLoginButtonState("idle");
  }
}

function setLoginButtonState(state) {
  const btn = document.getElementById("login-btn");
  const label = btn.querySelector(".btn-ms__label");
  if (state === "loading") {
    btn.classList.add("is-loading");
    label.textContent = "Redirecting to Microsoft…";
  } else {
    btn.classList.remove("is-loading");
    label.textContent = "Sign in with Microsoft";
  }
}

function resetLoginView() {
  document.getElementById("login-btn").disabled = false;
  setLoginButtonState("idle");
  hideLoginError();
}

function showLoginError(msg) {
  const el = document.getElementById("login-error");
  el.textContent = msg;
  el.hidden = false;
}

function hideLoginError() {
  const el = document.getElementById("login-error");
  el.textContent = "";
  el.hidden = true;
}

// ===========================================================================
// Upload view
// ===========================================================================

const DOC_TYPE_OPTIONS = [
  { value: "PASSPORT", label: "Passport" },
  { value: "EAD_I766", label: "Work Permit / EAD" },
  { value: "DRIVERS_LICENSE", label: "Driver's License" },
  { value: "RESUME", label: "Résumé" },
  { value: "DEGREE", label: "Degree" },
];

let _uploadFileCounter = 0;

function wireUpload() {
  document.getElementById("upload-country").addEventListener("change", onCountryChange);
  document.getElementById("upload-files-input").addEventListener("change", onFileInputChange);
  document.getElementById("upload-form").addEventListener("submit", onUploadSubmit);
  wireDropzone();
}

function wireDropzone() {
  const dz = document.getElementById("dropzone");
  for (const evt of ["dragenter", "dragover"]) {
    dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.add("is-dragover"); });
  }
  for (const evt of ["dragleave", "drop"]) {
    dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.remove("is-dragover"); });
  }
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) addUploadFiles(files.map((f) => f.name));
  });
}

function onCountryChange(e) {
  appState.uploadForm.country = e.target.value;
  clearFieldError("upload-country-error");
  refreshSubmitButton();
}

function onFileInputChange(e) {
  const files = Array.from(e.target.files || []);
  if (files.length) addUploadFiles(files.map((f) => f.name));
  // Reset the input so the user can re-add a file with the same name later.
  e.target.value = "";
}

function addUploadFiles(filenames) {
  for (const name of filenames) {
    appState.uploadForm.files.push({
      id: `f${++_uploadFileCounter}`,
      filename: name,
      documentType: "",
    });
  }
  renderUploadFiles();
  refreshSubmitButton();
}

function removeUploadFile(id) {
  appState.uploadForm.files = appState.uploadForm.files.filter((f) => f.id !== id);
  renderUploadFiles();
  refreshSubmitButton();
}

function setUploadFileType(id, type) {
  const file = appState.uploadForm.files.find((f) => f.id === id);
  if (file) file.documentType = type;
  renderUploadFiles();
  refreshSubmitButton();
}

function renderUploadView() {
  // Restore visible state from appState (so back-button to #upload is
  // consistent with whatever the user had picked).
  document.getElementById("upload-country").value = appState.uploadForm.country || "";
  renderUploadFiles();
  refreshSubmitButton();
}

function resetUploadView() {
  document.getElementById("upload-country").value = "";
  document.getElementById("filelist").innerHTML = "";
  document.getElementById("files-card").hidden = true;
  clearFieldError("upload-country-error");
  hideFilelistError();
  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  btn.textContent = "Submit verification";
  document.getElementById("submit-hint").textContent =
    "Pick a country and add at least one tagged file to enable submission.";
}

function renderUploadFiles() {
  const list = document.getElementById("filelist");
  const card = document.getElementById("files-card");
  const files = appState.uploadForm.files;
  if (files.length === 0) {
    list.innerHTML = "";
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const dupTypes = computeDuplicateTypes(files);
  list.innerHTML = files.map((f) => renderUploadFileRow(f, dupTypes)).join("");
  for (const row of list.querySelectorAll(".filelist__row")) {
    const id = row.dataset.fileId;
    row.querySelector(".filelist__type").addEventListener("change", (e) => setUploadFileType(id, e.target.value));
    row.querySelector(".filelist__remove").addEventListener("click", () => removeUploadFile(id));
  }
}

function computeDuplicateTypes(files) {
  const counts = {};
  for (const f of files) {
    if (f.documentType) counts[f.documentType] = (counts[f.documentType] || 0) + 1;
  }
  return new Set(Object.keys(counts).filter((t) => counts[t] > 1));
}

function renderUploadFileRow(file, dupTypes) {
  const missing = !file.documentType;
  const duplicate = file.documentType && dupTypes.has(file.documentType);
  const rowClass = ["filelist__row", missing ? "filelist__row--invalid" : "", duplicate ? "filelist__row--warn" : ""].filter(Boolean).join(" ");
  const optionsHtml = DOC_TYPE_OPTIONS.map((opt) =>
    `<option value="${escapeHtml(opt.value)}" ${file.documentType === opt.value ? "selected" : ""}>${escapeHtml(opt.label)}</option>`
  ).join("");
  return `
    <li class="${rowClass}" data-file-id="${escapeHtml(file.id)}">
      <span class="filelist__name">${escapeHtml(file.filename)}</span>
      <select class="filelist__type" aria-label="Document type for ${escapeHtml(file.filename)}">
        <option value="" ${file.documentType ? "" : "selected"} disabled>Type…</option>
        ${optionsHtml}
      </select>
      <button type="button" class="filelist__remove" aria-label="Remove ${escapeHtml(file.filename)}">Remove</button>
      ${missing ? `<span class="filelist__rowerror">Type required</span>` : ""}
      ${duplicate ? `<span class="filelist__rowwarn">Multiple files tagged as same type</span>` : ""}
    </li>
  `;
}

function refreshSubmitButton() {
  const { country, files, submitting } = appState.uploadForm;
  const allTagged = files.length > 0 && files.every((f) => f.documentType);
  const canSubmit = country && allTagged && !submitting;
  const btn = document.getElementById("submit-btn");
  btn.disabled = !canSubmit;

  const hint = document.getElementById("submit-hint");
  if (canSubmit) {
    const fileWord = files.length === 1 ? "file" : "files";
    hint.textContent = `${files.length} ${fileWord} ready. Click Submit to run verification.`;
  } else if (!country && files.length === 0) {
    hint.textContent = "Pick a country and add at least one tagged file to enable submission.";
  } else if (!country) {
    hint.textContent = "Pick a country to enable submission.";
  } else if (files.length === 0) {
    hint.textContent = "Add at least one file to enable submission.";
  } else {
    const untagged = files.filter((f) => !f.documentType).length;
    const fileWord = untagged === 1 ? "file" : "files";
    hint.textContent = `${untagged} ${fileWord} still missing a document type.`;
  }
}

async function onUploadSubmit(e) {
  e.preventDefault();
  // Defensive: refreshSubmitButton already disables the button when invalid,
  // but if a user hits Enter on a form field the submit can fire anyway.
  if (appState.uploadForm.submitting) return;

  const { country, files } = appState.uploadForm;
  let valid = true;
  hideFilelistError();
  clearFieldError("upload-country-error");

  if (!country) {
    showFieldError("upload-country-error", "Please select a country before submitting.");
    valid = false;
  }
  const untagged = files.filter((f) => !f.documentType);
  if (untagged.length > 0) {
    const word = untagged.length === 1 ? "file is" : "files are";
    showFilelistError(`${untagged.length} ${word} missing a document type. Tag every file before submitting.`);
    renderUploadFiles(); // re-render so the row markers update
    valid = false;
  }
  if (!valid) return;

  appState.uploadForm.submitting = true;
  refreshSubmitButton();
  const btn = document.getElementById("submit-btn");
  btn.textContent = "Submitting…";

  try {
    const payload = {
      country,
      files: files.map(({ filename, documentType }) => ({ filename, documentType })),
    };
    const result = await api.submitVerification(payload);
    appState.currentVerificationId = result.verificationId;
    // renderView() resets uploadForm when leaving #upload, so back-button
    // here lands the user on a fresh upload form rather than the stale one.
    setHash("result", result.verificationId);
  } catch (err) {
    showFilelistError(err.message || "Submission failed. Please try again.");
    appState.uploadForm.submitting = false;
    btn.textContent = "Submit verification";
    refreshSubmitButton();
  }
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.hidden = false;
}
function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ""; el.hidden = true; }
}
function showFilelistError(msg) {
  const el = document.getElementById("filelist-error");
  el.textContent = msg;
  el.hidden = false;
}
function hideFilelistError() {
  const el = document.getElementById("filelist-error");
  if (el) { el.textContent = ""; el.hidden = true; }
}

// ===========================================================================
// Result view
// ===========================================================================

async function renderResultView(verificationId) {
  const root = document.getElementById("view-result");
  root.innerHTML = `<div class="page page--wide"><div class="result-loading">Loading verification…</div></div>`;

  if (!verificationId) {
    root.innerHTML = renderResultNotFound("(no id in URL)");
    return;
  }

  let verification;
  try {
    verification = await api.getVerification(verificationId);
  } catch (err) {
    root.innerHTML = renderResultNotFound(err.message || verificationId);
    return;
  }

  if (!verification) {
    root.innerHTML = renderResultNotFound(verificationId);
    return;
  }

  appState.currentVerificationId = verification.verificationId;
  root.innerHTML = `
    <div class="page page--wide">
      ${renderResultHeader(verification)}
      ${renderVerdictPanel(verification)}
      ${renderPipelineStrip(verification)}
      ${renderDocumentsSection(verification)}
      ${renderAuditLog(verification)}
    </div>
  `;
}

function renderResultNotFound(idOrMessage) {
  return `
    <div class="page page--wide">
      <div class="card result-notfound">
        <h2 class="result-notfound__title">Verification not found</h2>
        <p class="result-notfound__hint">No verification matches the ID <code>${escapeHtml(idOrMessage)}</code>.</p>
        <a class="btn btn--primary" href="#upload">Back to upload</a>
      </div>
    </div>
  `;
}

function renderResultHeader(v) {
  return `
    <header class="result-header">
      <div class="result-header__meta">
        <div class="result-header__title-row">
          <h1 class="result-header__title">Verification result</h1>
          <code class="result-id" id="result-id">${escapeHtml(v.verificationId)}</code>
        </div>
        <dl class="result-header__details">
          <div class="result-header__field"><dt>Submitted by</dt><dd>${escapeHtml(v.submittedBy || "—")}</dd></div>
          <div class="result-header__field"><dt>Country</dt><dd>${escapeHtml(v.country || "—")}</dd></div>
          <div class="result-header__field"><dt>Submitted</dt><dd>${escapeHtml(formatDateTime(v.submittedAt))}</dd></div>
        </dl>
      </div>
      <a class="btn btn--secondary" href="#upload">New verification</a>
    </header>
  `;
}

const VERDICT_MODIFIER = {
  GENUINE: "genuine",
  REVIEW: "review",
  HIGH_RISK: "highrisk",
  INSUFFICIENT: "insufficient",
};
const ESCALATION_DESCRIPTION = {
  "auto-approve": "Document set cleared for onboarding.",
  "manual review": "Routed to reviewer for human validation.",
  "compliance escalation": "Flagged for compliance team review.",
  "request resubmission": "Operator must request updated documents.",
};

function renderVerdictPanel(v) {
  const mod = VERDICT_MODIFIER[v.verdict] || "insufficient";
  const escLabel = capitalizeFirst(v.escalationAction || "Unknown");
  const escDesc = ESCALATION_DESCRIPTION[v.escalationAction] || "";
  const score = (typeof v.riskScore === "number") ? String(v.riskScore) : "—";
  return `
    <section class="verdict-panel verdict-panel--${mod}" aria-label="Verdict summary">
      <div class="verdict-panel__col verdict-panel__col--badge">
        <span class="verdict-badge verdict-badge--${mod}">${escapeHtml(v.verdict || "INSUFFICIENT")}</span>
      </div>
      <div class="verdict-panel__col verdict-panel__col--score">
        <span class="verdict-score verdict-score--${mod}">${escapeHtml(score)}</span>
        <span class="verdict-score__label">Risk Score</span>
        <span class="verdict-score__scale">out of 100</span>
      </div>
      <div class="verdict-panel__col verdict-panel__col--escalation">
        <span class="escalation__label">${escapeHtml(escLabel)}</span>
        <span class="escalation__desc">${escapeHtml(escDesc)}</span>
      </div>
    </section>
  `;
}

const PIPELINE_STAGES = ["DOCUMENT_PROCESSING", "CROSS_DOCUMENT", "EXTERNAL", "RISK_SCORING"];

function renderPipelineStrip(v) {
  const byStage = groupChecksByStage(v);
  const steps = PIPELINE_STAGES.map((stage) => {
    const checks = byStage[stage] || [];
    const failed = checks.filter((c) => !c.passed).length;
    const ok = checks.length > 0 && failed === 0;
    return { stage, label: STAGES[stage], ok, total: checks.length, failed };
  });

  const parts = [];
  steps.forEach((step, idx) => {
    if (idx > 0) {
      const prevOk = steps[idx - 1].ok;
      const cls = prevOk ? "" : "pipeline-step__connector--fail";
      parts.push(`<div class="pipeline-step__connector ${cls}" aria-hidden="true"></div>`);
    }
    parts.push(`
      <div class="pipeline-step pipeline-step--${step.ok ? "pass" : "fail"}">
        <span class="pipeline-step__icon" aria-hidden="true">${step.ok ? svgCheck() : svgWarning()}</span>
        <span class="pipeline-step__label">${escapeHtml(step.label)}</span>
        <span class="pipeline-step__sub">${escapeHtml(pipelineStepSummary(step))}</span>
      </div>
    `);
  });
  return `<section class="pipeline-strip" aria-label="Pipeline progress">${parts.join("")}</section>`;
}

function pipelineStepSummary(step) {
  if (step.total === 0) return "No checks run";
  if (step.failed === 0) return `${step.total}/${step.total} checks passed`;
  const word = step.total === 1 ? "check" : "checks";
  return `${step.failed} of ${step.total} ${word} failed`;
}

function groupChecksByStage(v) {
  const out = {};
  for (const doc of v.documents || []) {
    for (const check of doc.checks || []) {
      (out[check.stage] = out[check.stage] || []).push(check);
    }
  }
  return out;
}

function renderDocumentsSection(v) {
  const docs = v.documents || [];
  if (docs.length === 0) {
    return `
      <section class="documents-section">
        <h2 class="section-title">Documents</h2>
        <div class="card"><p class="kv-empty">No documents in this verification.</p></div>
      </section>
    `;
  }
  return `
    <section class="documents-section" aria-label="Documents">
      <h2 class="section-title">Documents</h2>
      ${docs.map(renderDocumentCard).join("")}
    </section>
  `;
}

const DOC_TYPE_LABELS = {
  PASSPORT: "Passport",
  EAD_I766: "Work Permit / EAD",
  DRIVERS_LICENSE: "Driver's License",
  RESUME: "Résumé",
  DEGREE: "Degree",
  TRANSCRIPT: "Transcript",
};

function formatDocType(t) {
  return DOC_TYPE_LABELS[t] || (t ? String(t) : "Document");
}

function renderDocumentCard(doc) {
  const typeLabel = formatDocType(doc.documentType);
  const fields = doc.extractedFields || {};
  const checks = doc.checks || [];
  const fieldEntries = Object.entries(fields);

  // INSUFFICIENT edge case: doc couldn't be processed at all.
  if (fieldEntries.length === 0 && checks.length === 0) {
    return `
      <article class="doc-card doc-card--empty">
        <header class="doc-card__head">
          <h3 class="doc-card__type">${escapeHtml(typeLabel)}</h3>
          <code class="doc-card__filename">${escapeHtml(doc.filename || "(no filename)")}</code>
        </header>
        <div class="doc-card__empty" role="status">Document could not be processed.</div>
      </article>
    `;
  }

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.length - passed;
  const countLabel = failed === 0 ? `${passed} passed` : `${passed} passed · ${failed} failed`;

  return `
    <article class="doc-card">
      <header class="doc-card__head">
        <h3 class="doc-card__type">${escapeHtml(typeLabel)}</h3>
        <code class="doc-card__filename">${escapeHtml(doc.filename || "(no filename)")}</code>
      </header>
      <div class="doc-card__body">
        <div class="doc-card__panel">
          <h4 class="doc-card__subtitle">Extracted fields</h4>
          ${renderKvList(fieldEntries)}
        </div>
        <div class="doc-card__panel">
          <h4 class="doc-card__subtitle">Checks <span class="doc-card__count">${escapeHtml(countLabel)}</span></h4>
          ${renderCheckList(checks)}
        </div>
      </div>
    </article>
  `;
}

function renderKvList(entries) {
  if (entries.length === 0) {
    return `<p class="kv-empty">No fields extracted.</p>`;
  }
  return `<dl class="kv-list">${entries.map(renderKvItem).join("")}</dl>`;
}

function renderKvItem([key, value]) {
  const isMono = /mrz/i.test(key);
  return `
    <div class="kv-item ${isMono ? "kv-item--mono" : ""}">
      <dt>${escapeHtml(formatFieldName(key))}</dt>
      <dd>${escapeHtml(formatFieldValue(value))}</dd>
    </div>
  `;
}

function renderCheckList(checks) {
  if (checks.length === 0) {
    return `<p class="kv-empty">No checks run on this document.</p>`;
  }
  return `<ul class="check-list" role="list">${checks.map(renderCheckItem).join("")}</ul>`;
}

function renderCheckItem(c) {
  // Hide confidence label when null/undefined (deterministic checks). Showing
  // 'null%' or '0%' would be misleading.
  const hasConfidence = (typeof c.confidence === "number") && !Number.isNaN(c.confidence);
  const confidenceHtml = hasConfidence
    ? `<span class="check-item__confidence">${Math.round(c.confidence * 100)}% confidence</span>`
    : "";
  const stageBadgeClass = stageBadgeModifier(c.stage);
  const stageLabel = STAGES[c.stage] || c.stage || "Check";
  return `
    <li class="check-item check-item--${c.passed ? "pass" : "fail"}">
      <span class="check-item__icon" aria-hidden="true">${c.passed ? svgCheck() : svgCross()}</span>
      <div class="check-item__body">
        <div class="check-item__head">
          <span class="check-item__name">${escapeHtml(c.checkName || "Check")}</span>
          ${confidenceHtml}
        </div>
        <p class="check-item__reason">${escapeHtml(c.reason || "No reason provided.")}</p>
        <span class="stage-badge ${stageBadgeClass}">${escapeHtml(stageLabel)}</span>
      </div>
    </li>
  `;
}

function stageBadgeModifier(stage) {
  switch (stage) {
    case "DOCUMENT_PROCESSING": return "stage-badge--processing";
    case "CROSS_DOCUMENT":      return "stage-badge--cross";
    case "EXTERNAL":            return "stage-badge--external";
    case "RISK_SCORING":        return "stage-badge--risk";
    default:                    return "";
  }
}

function renderAuditLog(v) {
  const log = v.auditLog || [];
  if (log.length === 0) {
    return `
      <section class="audit-section" aria-label="Audit log">
        <div class="audit-details audit-details--empty">
          <div class="audit-summary audit-summary--static">
            <span class="audit-summary__title">Audit log</span>
            <span class="audit-summary__count">No entries</span>
          </div>
          <p class="audit-empty">No actions recorded yet.</p>
        </div>
      </section>
    `;
  }
  const rows = log.map((e) => `
    <li class="audit-entry">
      <span class="audit-entry__time">${escapeHtml(formatTime(e.timestamp))}</span>
      <span class="audit-entry__actor">${escapeHtml(e.actor || "system")}</span>
      <span class="audit-entry__action">${escapeHtml(e.action || "")}</span>
    </li>
  `).join("");
  return `
    <section class="audit-section" aria-label="Audit log">
      <details class="audit-details">
        <summary class="audit-summary">
          <span class="audit-summary__title">Audit log</span>
          <span class="audit-summary__count">${log.length} entries</span>
          <span class="audit-summary__hint">Click to expand</span>
        </summary>
        <ol class="audit-list">${rows}</ol>
      </details>
    </section>
  `;
}

// ----- Inline status icons (no external assets) ----------------------------

function svgCheck() {
  return `<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7.5" fill="#1E8E5C"/><path d="M4.2 8.4 L6.8 11 L11.8 5.6" stroke="#FFFFFF" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function svgCross() {
  return `<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7.5" fill="#C0392B"/><path d="M5 5 L11 11 M11 5 L5 11" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}
function svgWarning() {
  return `<svg viewBox="0 0 16 16" width="20" height="20"><path d="M8 1 L15 14 L1 14 Z" fill="#D99A23"/><path d="M8 5.5 L8 9.5" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.8" r="0.9" fill="#FFFFFF"/></svg>`;
}

// ===========================================================================
// Rules view (ADMIN only — RBAC enforced upstream in onHashChange)
// ===========================================================================

const SEVERITY_OPTIONS = ["low", "medium", "high"];

async function renderRulesView() {
  if (!appState.rulesEdit) appState.rulesEdit = createEmptyRulesEdit();
  rerenderRulesShell();
  // Initial render fetches from the backend; subsequent re-renders (edit /
  // save / cancel) reuse the in-memory rules without a network call.
  await loadRules(appState.rulesEdit.country);
}

function rerenderRulesShell() {
  const root = document.getElementById("view-rules");
  root.innerHTML = `
    <div class="page page--wide">
      ${renderRulesHeader()}
      <div id="rules-message" class="rules-message" hidden></div>
      <div id="rules-table-wrap"></div>
    </div>
  `;
  wireRulesControls();
  renderRulesTable();
}

function createEmptyRulesEdit() {
  return { country: "USA", rules: [], editing: false, dirty: false, snapshot: null };
}

function renderRulesHeader() {
  const r = appState.rulesEdit;
  return `
    <header class="page__head">
      <h1 class="page__title">Country rules</h1>
      <p class="page__lede">Configure which checks run per country and how heavily each one is weighted. Edits require ADMIN.</p>
    </header>
    <div class="rules-controls">
      <div class="field rules-controls__country">
        <label class="field__label" for="rules-country">Country</label>
        <select class="field__control" id="rules-country">
          <option value="USA" ${r.country === "USA" ? "selected" : ""}>United States of America</option>
          <option value="India" ${r.country === "India" ? "selected" : ""}>India</option>
        </select>
      </div>
      <div class="rules-controls__actions">
        ${r.editing
          ? `<button type="button" id="rules-save-btn" class="btn btn--primary">Save changes</button>
             <button type="button" id="rules-cancel-btn" class="btn btn--secondary">Cancel</button>`
          : `<button type="button" id="rules-edit-btn" class="btn btn--primary">Edit rules</button>`}
      </div>
    </div>
  `;
}

function wireRulesControls() {
  document.getElementById("rules-country").addEventListener("change", onRulesCountryChange);
  const editBtn = document.getElementById("rules-edit-btn");
  if (editBtn) editBtn.addEventListener("click", enterRulesEditMode);
  const saveBtn = document.getElementById("rules-save-btn");
  if (saveBtn) saveBtn.addEventListener("click", saveRulesEdit);
  const cancelBtn = document.getElementById("rules-cancel-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", cancelRulesEdit);
}

async function loadRules(country) {
  appState.rulesEdit.country = country;
  appState.rulesEdit.rules = await api.getRules(country);
  appState.rulesEdit.editing = false;
  appState.rulesEdit.dirty = false;
  appState.rulesEdit.snapshot = null;
  renderRulesTable();
}

function renderRulesTable() {
  const wrap = document.getElementById("rules-table-wrap");
  if (!wrap) return;
  const r = appState.rulesEdit;
  if (r.rules.length === 0) {
    wrap.innerHTML = `<div class="card"><p class="kv-empty">No rules configured for ${escapeHtml(r.country)}.</p></div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="rules-table-wrap">
      <table class="rules-table">
        <thead>
          <tr>
            <th>Document Type</th>
            <th>Check Name</th>
            <th>Weight</th>
            <th>Severity</th>
            <th>Enabled</th>
          </tr>
        </thead>
        <tbody>${r.rules.map((rule, idx) => renderRulesRow(rule, idx, r.editing)).join("")}</tbody>
      </table>
    </div>
  `;
  if (r.editing) wireRulesRowInputs();
}

function renderRulesRow(rule, idx, editing) {
  const weightCell = editing
    ? `<input type="number" min="1" max="10" step="1" inputmode="numeric"
              class="rules-input rules-input--weight" data-idx="${idx}" data-field="weight"
              value="${escapeHtml(String(rule.weight))}" aria-label="Weight for ${escapeHtml(rule.checkName)}">
       <span class="rules-input__error" data-idx="${idx}" hidden></span>`
    : `<span class="rules-cell--weight">${escapeHtml(String(rule.weight))}</span>`;

  const sevCell = editing
    ? `<select class="rules-input rules-input--severity" data-idx="${idx}" data-field="severity"
               aria-label="Severity for ${escapeHtml(rule.checkName)}">
         ${SEVERITY_OPTIONS.map((s) => `<option value="${s}" ${rule.severity === s ? "selected" : ""}>${s}</option>`).join("")}
       </select>`
    : `<span class="severity-pill severity-pill--${escapeHtml(rule.severity)}">${escapeHtml(rule.severity)}</span>`;

  const enabledCell = editing
    ? `<input type="checkbox" class="rules-input rules-input--enabled" data-idx="${idx}" data-field="enabled"
              ${rule.enabled ? "checked" : ""} aria-label="Enabled for ${escapeHtml(rule.checkName)}">`
    : `<span class="rules-cell--enabled ${rule.enabled ? "is-on" : "is-off"}">${rule.enabled ? "Yes" : "No"}</span>`;

  return `
    <tr data-rule-id="${escapeHtml(rule.ruleId)}">
      <td><span class="doctype-tag">${escapeHtml(formatDocType(rule.documentType))}</span></td>
      <td>${escapeHtml(rule.checkName)}</td>
      <td>${weightCell}</td>
      <td>${sevCell}</td>
      <td>${enabledCell}</td>
    </tr>
  `;
}

function wireRulesRowInputs() {
  for (const inp of document.querySelectorAll(".rules-input")) {
    const evt = inp.type === "checkbox" || inp.tagName === "SELECT" ? "change" : "input";
    inp.addEventListener(evt, onRulesInputChange);
  }
}

function onRulesInputChange(e) {
  const r = appState.rulesEdit;
  const idx = Number(e.target.dataset.idx);
  const field = e.target.dataset.field;
  if (field === "weight") {
    applyWeightEdit(e.target, idx);
  } else if (field === "severity") {
    r.rules[idx].severity = e.target.value;
  } else if (field === "enabled") {
    r.rules[idx].enabled = e.target.checked;
  }
  r.dirty = true;
  refreshRulesSaveButton();
}

function applyWeightEdit(input, idx) {
  const r = appState.rulesEdit;
  const raw = input.value.trim();
  const n = Number(raw);
  const isValid = raw !== "" && Number.isFinite(n) && Number.isInteger(n) && n >= 1 && n <= 10;
  const errEl = document.querySelector(`.rules-input__error[data-idx="${idx}"]`);
  if (isValid) {
    r.rules[idx].weight = n;
    input.classList.remove("rules-input--invalid");
    if (errEl) errEl.hidden = true;
  } else {
    // Store the raw text so the input reflects what the user typed, but flag
    // invalid so the save button stays disabled until they fix it.
    r.rules[idx].weight = raw;
    input.classList.add("rules-input--invalid");
    if (errEl) { errEl.textContent = "Weight must be a whole number 1–10"; errEl.hidden = false; }
  }
}

function refreshRulesSaveButton() {
  const btn = document.getElementById("rules-save-btn");
  if (!btn) return;
  btn.disabled = hasInvalidWeights();
}

function hasInvalidWeights() {
  return appState.rulesEdit.rules.some((rule) =>
    !Number.isInteger(rule.weight) || rule.weight < 1 || rule.weight > 10
  );
}

async function onRulesCountryChange(e) {
  const r = appState.rulesEdit;
  const next = e.target.value;
  if (r.editing && r.dirty) {
    const ok = window.confirm("Discard unsaved changes?");
    if (!ok) {
      e.target.value = r.country;
      return;
    }
  }
  showRulesMessage(null);
  await loadRules(next);
}

function enterRulesEditMode() {
  const r = appState.rulesEdit;
  r.snapshot = JSON.parse(JSON.stringify(r.rules));
  r.editing = true;
  r.dirty = false;
  showRulesMessage(null);
  rerenderRulesShell();
}

function cancelRulesEdit() {
  const r = appState.rulesEdit;
  if (r.snapshot) r.rules = r.snapshot;
  r.snapshot = null;
  r.editing = false;
  r.dirty = false;
  showRulesMessage(null);
  rerenderRulesShell();
}

async function saveRulesEdit() {
  const r = appState.rulesEdit;
  // Defensive: save button is disabled when invalid but keyboard Enter on a
  // weight field could still trigger via form-default. Re-validate here.
  if (hasInvalidWeights()) {
    showRulesMessage("Fix invalid weights before saving.", "error");
    return;
  }
  try {
    const saved = await api.updateRules(r.country, r.rules);
    r.rules = saved;
    r.snapshot = null;
    r.editing = false;
    r.dirty = false;
    rerenderRulesShell();
    showRulesMessage(`Rules for ${r.country} saved.`, "success");
  } catch (err) {
    // Defense in depth: api.updateRules throws if the current user isn't
    // ADMIN. Surface the error inline rather than silently swallowing.
    showRulesMessage(err.message || "Save failed.", "error");
  }
}

function showRulesMessage(text, kind) {
  // queueMicrotask because renderRulesView may have just replaced the DOM and
  // the new #rules-message element isn't in the tree yet.
  queueMicrotask(() => {
    const el = document.getElementById("rules-message");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.className = "rules-message";
      return;
    }
    el.textContent = text;
    el.className = `rules-message rules-message--${kind || "info"}`;
    el.hidden = false;
  });
}

// ===========================================================================
// Helpers — escapeHtml is used by every renderer.
// ===========================================================================

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "firstName" → "First Name". Special-cased acronyms ('MRZ').
function formatFieldName(camel) {
  if (!camel) return "";
  let out = String(camel)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
  // Acronyms the regex above downcases: restore them.
  out = out.replace(/\bMrz\b/g, "MRZ");
  return out;
}

function formatFieldValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (typeof value[0] === "object") {
      // List of objects (e.g. education / employment). Flatten to one line
      // per object so the kv-list stays readable.
      return value
        .map((obj) => Object.entries(obj).map(([k, v]) => `${formatFieldName(k)}: ${v}`).join(", "))
        .join("; ");
    }
    return value.join(", ");
  }
  if (typeof value === "object") {
    return Object.entries(value).map(([k, v]) => `${formatFieldName(k)}: ${v}`).join(", ");
  }
  return String(value);
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ISO timestamp → "DD MMM YYYY, HH:MM" in UTC (no timezone juggling for the
// prototype; backend will return timezone-aware timestamps).
function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = MONTH_NAMES[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

// ISO timestamp → "HH:MM:SS" for audit log rows (all events are same-day).
function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function capitalizeFirst(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Stage labels exported by mockData.js. Re-exposed via STAGES so other
// renderers don't import mockData directly.
export { STAGES };
