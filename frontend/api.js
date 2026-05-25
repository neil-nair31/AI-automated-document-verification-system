// api.js
// -----------------------------------------------------------------------------
// API client for the Document Verification Platform frontend.
//
// Every function in this module is shaped exactly like the real REST call it
// will eventually become — same parameters, same return shape, async,
// Promise-based, with a `// TODO: replace with fetch()` comment showing the
// eventual endpoint. The day the backend is ready, swap each TODO for the
// real fetch call and flip USE_MOCK_AUTH to false. No other file changes
// needed downstream.
//
// Session state lives in a module-private variable. Not exported. The only
// way to mutate it is through loginWithEntra() / logout().
//
// RBAC is enforced inside this module, not just at the UI. updateRules()
// throws if the current user isn't ADMIN. The UI hides the editor for
// non-ADMINs too — defense in depth.
// -----------------------------------------------------------------------------

import { entraUsers, countryRules, verifications } from "./mockData.js";

// TODO: replace mock with real fetch() calls when backend is ready
const USE_MOCK_AUTH = true;
const ENTRA_CONFIG = { tenantId: "", clientId: "", redirectUri: "", authority: "" };
const API_BASE_URL = ""; // e.g. http://localhost:8000 once backend is up

// 300ms artificial latency — gives the UI realistic loading states.
const MOCK_LATENCY_MS = 300;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let currentSession = null; // { user: {email, displayName, role}, accessToken }

// ===========================================================================
// Auth
// ===========================================================================

/**
 * loginWithEntra(roleHint)
 *
 *   Real:  msal.PublicClientApplication.loginPopup() → acquireTokenSilent()
 *   Mock:  picks the matching fixture user from mockData.entraUsers
 *
 * @param {"ADMIN"|"OPERATOR"} roleHint   DEV ONLY — picks which mock user to
 *                                        return. Ignored by the real flow.
 * @returns {Promise<{email, displayName, role}>}
 */
export async function loginWithEntra(roleHint) {
  // TODO: replace with fetch(`${API_BASE_URL}/auth/login`) once Entra is wired
  if (!USE_MOCK_AUTH) {
    throw new Error("Real Entra flow is not yet wired — see ENTRA_CONFIG.");
  }
  await sleep(MOCK_LATENCY_MS);

  // If a session already exists, return it idempotently. The UI also guards
  // against double-click, but this is a second line of defense.
  if (currentSession) return currentSession.user;

  const wantRole = (roleHint === "ADMIN" || roleHint === "OPERATOR") ? roleHint : "OPERATOR";
  const fixture = entraUsers.find((u) => u.role === wantRole);
  if (!fixture) throw new Error(`No mock user with role ${wantRole}`);

  currentSession = {
    user: {
      email: fixture.email,
      displayName: fixture.displayName,
      role: fixture.role,
    },
    accessToken: fixture.accessToken,
  };
  return currentSession.user;
}

/**
 * getCurrentUser() — returns the in-memory current user, or null.
 *
 *   Real:  msal.getAllAccounts()[0] → acquireTokenSilent()
 *   Mock:  reads module-private currentSession
 */
export async function getCurrentUser() {
  // TODO: replace with msal.getAllAccounts()[0] when Entra is wired
  await sleep(0); // keep the async shape stable for the real flow
  return currentSession ? currentSession.user : null;
}

/**
 * logout() — clears the in-memory session.
 *
 *   Real:  msal.logoutPopup() OR msal.logoutRedirect()
 *   Mock:  clears module-private currentSession
 */
export async function logout() {
  // TODO: replace with msal.logoutPopup() when Entra is wired
  await sleep(MOCK_LATENCY_MS);
  currentSession = null;
}

// ===========================================================================
// Verifications
// ===========================================================================

/**
 * submitVerification({ country, files })
 *
 *   Real:  fetch(`${API_BASE_URL}/verifications`, { method: 'POST', body: <FormData> })
 *   Mock:  randomly returns one of the three fixture verifications so the
 *          prototype demonstrates all three verdict paths over a few
 *          submissions. The real backend will produce a brand-new record.
 *
 * @param {{country: string, files: Array<{filename: string, documentType: string}>}} payload
 * @returns {Promise<object>} the verification record
 */
export async function submitVerification({ country, files }) {
  // TODO: replace with fetch(`${API_BASE_URL}/verifications`, { method: 'POST' })
  if (!currentSession) throw new Error("Not signed in");
  await sleep(MOCK_LATENCY_MS);

  const idx = Math.floor(Math.random() * verifications.length);
  // Deep clone so callers can't mutate the canonical fixture.
  return JSON.parse(JSON.stringify(verifications[idx]));
}

/**
 * getVerification(verificationId) — full record by ID, or null if not found.
 *
 *   Real:  fetch(`${API_BASE_URL}/verifications/${id}`)
 */
export async function getVerification(verificationId) {
  // TODO: replace with fetch(`${API_BASE_URL}/verifications/${verificationId}`)
  await sleep(MOCK_LATENCY_MS);
  const match = verifications.find((v) => v.verificationId === verificationId);
  if (!match) return null;
  return JSON.parse(JSON.stringify(match));
}

/**
 * listVerifications() — summary list (for a future history view).
 *
 *   Real:  fetch(`${API_BASE_URL}/verifications`)
 */
export async function listVerifications() {
  // TODO: replace with fetch(`${API_BASE_URL}/verifications`)
  await sleep(MOCK_LATENCY_MS);
  return verifications.map((v) => ({
    verificationId: v.verificationId,
    country: v.country,
    submittedBy: v.submittedBy,
    submittedAt: v.submittedAt,
    verdict: v.verdict,
    riskScore: v.riskScore,
  }));
}

// ===========================================================================
// Rules
// ===========================================================================

/**
 * getRules(country) — full rule list for the country. Available to both roles.
 *
 *   Real:  fetch(`${API_BASE_URL}/rules/${country}`)
 */
export async function getRules(country) {
  // TODO: replace with fetch(`${API_BASE_URL}/rules/${country}`)
  await sleep(MOCK_LATENCY_MS);
  const rules = countryRules[country] || [];
  // Shallow clone the array; rule rows are flat so this is safe enough.
  return rules.map((r) => ({ ...r }));
}

/**
 * updateRules(country, newRules) — ADMIN only. Defense in depth: this throws
 * if the current user isn't ADMIN, regardless of what the UI lets through.
 *
 *   Real:  fetch(`${API_BASE_URL}/rules/${country}`, { method: 'PUT', body: JSON.stringify(newRules) })
 */
export async function updateRules(country, newRules) {
  // TODO: replace with fetch(`${API_BASE_URL}/rules/${country}`, { method: 'PUT' })
  if (!currentSession) throw new Error("Not signed in");
  if (currentSession.user.role !== "ADMIN") {
    throw new Error("FORBIDDEN: only ADMIN can update rules");
  }
  await sleep(MOCK_LATENCY_MS);
  countryRules[country] = newRules.map((r) => ({ ...r }));
  return countryRules[country].map((r) => ({ ...r }));
}
