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
    // result + rules views' renderers are wired in later commits.
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

// Stage labels exported by mockData.js. Re-exposed via STAGES so other
// renderers don't import mockData directly.
export { STAGES };
