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
// Upload view — wiring shell. Filled out in the next commit.
// ===========================================================================

function wireUpload() {
  // Wired in commit C.
}

function renderUploadView() {
  // Wired in commit C.
}

function resetUploadView() {
  // Wired in commit C.
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
