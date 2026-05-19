// api.js
// -----------------------------------------------------------------------------
// Thin client for the Document Verification API + a mocked Entra ID (Microsoft
// SSO) auth layer. No build step, no modules — loaded as a classic script and
// exposed on `window.api`.
//
// The auth layer is designed so that swapping the mock for real MSAL.js is a
// localised change:
//   1. Set USE_MOCK_AUTH = false.
//   2. Fill in ENTRA_CONFIG with values from the Azure AD app registration.
//   3. Implement the bodies inside the "REAL ENTRA FLOW" comment blocks below.
//      The function signatures and `window.api` surface do not change, so
//      app.js (and any view code that calls api.getCurrentUser()) is untouched.
// -----------------------------------------------------------------------------

(function () {
  "use strict";

  // ===========================================================================
  // Config
  // ===========================================================================

  // TODO: replace mock with real MSAL.js when Azure AD app is registered
  const ENTRA_CONFIG = {
    tenantId: "",
    clientId: "",
    redirectUri: "",
    // e.g. `https://login.microsoftonline.com/${tenantId}`
    authority: "",
    // Scopes requested at login + token acquisition. `User.Read` is enough to
    // resolve displayName/email via Microsoft Graph if we want to enrich later.
    scopes: ["openid", "profile", "email", "User.Read"],
  };

  const USE_MOCK_AUTH = true;

  // Same-origin by default. Set to e.g. "http://localhost:8000" if the static
  // frontend is served separately from the FastAPI backend during dev.
  const API_BASE = "";

  // ===========================================================================
  // In-memory session
  //
  // We deliberately do NOT persist to localStorage / sessionStorage. The real
  // MSAL flow keeps tokens in its own (cookie- or sessionStorage-backed) cache
  // — that becomes the source of truth once wired in.
  // ===========================================================================

  let _currentUser = null;
  let _msalInstance = null; // populated by the real flow; unused in mock mode

  // ===========================================================================
  // Auth — public surface
  // ===========================================================================

  /**
   * Initiate the Entra sign-in flow.
   *
   * @param {Object} [options]
   * @param {"ADMIN"|"OPERATOR"} [options.devRoleHint]
   *        DEV ONLY. Consumed only when USE_MOCK_AUTH is true; lets the demo
   *        UI pick which fixture user is "signed in". Ignored in the real flow.
   * @returns {Promise<{email, displayName, role, accessToken}>}
   */
  async function loginWithEntra(options) {
    options = options || {};

    if (USE_MOCK_AUTH) {
      return _mockEntraLogin(options.devRoleHint);
    }

    /* --------------------------------------------------------------------- *
     * REAL ENTRA FLOW (not implemented yet — left as the integration point) *
     * --------------------------------------------------------------------- *
     *
     *   // Pull in MSAL via <script src="https://alcdn.msauth.net/browser/...">
     *   // in index.html, or bundle @azure/msal-browser if we ever add a build.
     *
     *   if (!_msalInstance) {
     *     _msalInstance = new msal.PublicClientApplication({
     *       auth: {
     *         clientId:    ENTRA_CONFIG.clientId,
     *         authority:   ENTRA_CONFIG.authority,
     *         redirectUri: ENTRA_CONFIG.redirectUri,
     *       },
     *       cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false },
     *     });
     *     await _msalInstance.initialize();
     *     // If we use loginRedirect, handle the post-redirect response here:
     *     //   const resp = await _msalInstance.handleRedirectPromise();
     *     //   if (resp) { ... populate _currentUser ... }
     *   }
     *
     *   // Popup keeps the SPA on one page; redirect is friendlier on mobile.
     *   const loginResp = await _msalInstance.loginPopup({
     *     scopes: ENTRA_CONFIG.scopes,
     *     prompt: "select_account",
     *   });
     *
     *   // Acquire an access token for the API audience. acquireTokenSilent
     *   // uses MSAL's cache; falls back to acquireTokenPopup on cache miss.
     *   const account = loginResp.account;
     *   let tokenResp;
     *   try {
     *     tokenResp = await _msalInstance.acquireTokenSilent({
     *       scopes: ENTRA_CONFIG.scopes, account,
     *     });
     *   } catch (e) {
     *     if (e instanceof msal.InteractionRequiredAuthError) {
     *       tokenResp = await _msalInstance.acquireTokenPopup({
     *         scopes: ENTRA_CONFIG.scopes, account,
     *       });
     *     } else { throw e; }
     *   }
     *
     *   // Role comes from the App Roles configured on the Azure AD app
     *   // registration and assigned to users/groups. Claim name: `roles`.
     *   const claims = tokenResp.idTokenClaims || {};
     *   const role = (claims.roles && claims.roles[0]) || "OPERATOR";
     *
     *   _currentUser = {
     *     email:       account.username,
     *     displayName: account.name,
     *     role:        role,
     *     accessToken: tokenResp.accessToken,
     *   };
     *   return _currentUser;
     * --------------------------------------------------------------------- */

    throw new Error(
      "Real Entra flow is not wired yet. Set ENTRA_CONFIG, flip " +
        "USE_MOCK_AUTH to false, and implement the REAL ENTRA FLOW block in api.js."
    );
  }

  /**
   * Returns the currently signed-in user (or null). Async by design so the
   * real-flow implementation can transparently call MSAL's getAccount /
   * acquireTokenSilent without changing callers.
   */
  async function getCurrentUser() {
    if (USE_MOCK_AUTH) {
      return _currentUser;
    }

    /* --------------------------------------------------------------------- *
     * REAL ENTRA FLOW                                                       *
     * --------------------------------------------------------------------- *
     *   if (!_msalInstance) return null;
     *   const accounts = _msalInstance.getAllAccounts();
     *   if (!accounts.length) return null;
     *   const account = accounts[0];
     *   // Refresh access token silently so callers always get a live one.
     *   const tokenResp = await _msalInstance.acquireTokenSilent({
     *     scopes: ENTRA_CONFIG.scopes, account,
     *   });
     *   const claims = tokenResp.idTokenClaims || {};
     *   return {
     *     email:       account.username,
     *     displayName: account.name,
     *     role:        (claims.roles && claims.roles[0]) || "OPERATOR",
     *     accessToken: tokenResp.accessToken,
     *   };
     * --------------------------------------------------------------------- */

    return _currentUser;
  }

  /**
   * Clear the session and (in the real flow) sign out of the tenant.
   */
  async function logout() {
    if (USE_MOCK_AUTH) {
      _currentUser = null;
      return;
    }

    /* --------------------------------------------------------------------- *
     * REAL ENTRA FLOW                                                       *
     * --------------------------------------------------------------------- *
     *   if (_msalInstance) {
     *     const account = _msalInstance.getAllAccounts()[0];
     *     // logoutPopup keeps the SPA single-page; logoutRedirect fully
     *     // signs the user out at the tenant.
     *     await _msalInstance.logoutPopup({ account });
     *   }
     * --------------------------------------------------------------------- */

    _currentUser = null;
  }

  // ===========================================================================
  // Auth — mock implementation
  // ===========================================================================

  async function _mockEntraLogin(devRoleHint) {
    // Simulate the Microsoft redirect round-trip so the UI can show its
    // "Redirecting to Microsoft…" state for a beat.
    await _sleep(700);

    const wantRole = devRoleHint === "ADMIN" ? "ADMIN" : "OPERATOR";
    const fixture =
      (window.mockData && window.mockData.entraUsers.find(function (u) {
        return u.role === wantRole;
      })) || null;

    if (!fixture) {
      throw new Error(
        "mockData.entraUsers is missing — make sure mockData.js loads before api.js"
      );
    }

    _currentUser = {
      email: fixture.email,
      displayName: fixture.displayName,
      role: fixture.role,
      accessToken: _fakeAccessToken(fixture),
    };
    return _currentUser;
  }

  function _fakeAccessToken(user) {
    // Not a real JWT — just an opaque, recognisable string for the demo so
    // network panels show something plausible in the Authorization header.
    const payload = btoa(
      JSON.stringify({
        sub: user.email,
        name: user.displayName,
        roles: [user.role],
        iat: Math.floor(Date.now() / 1000),
        iss: "mock-entra",
      })
    );
    return "mock." + payload + ".sig";
  }

  function _sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // ===========================================================================
  // Backend API calls
  //
  // All routes are async + Bearer-token authed. While USE_MOCK_AUTH is true we
  // short-circuit to the mockData fixtures so the UI is fully demoable without
  // the FastAPI server running. When the backend lands, only the `if
  // (USE_MOCK_AUTH)` branches go away — the surface stays identical.
  // ===========================================================================

  async function _authedFetch(path, opts) {
    opts = opts || {};
    if (!_currentUser) {
      throw new Error("Not signed in");
    }
    const headers = Object.assign(
      { Authorization: "Bearer " + _currentUser.accessToken },
      opts.headers || {}
    );
    const resp = await fetch(API_BASE + path, Object.assign({}, opts, { headers: headers }));
    if (!resp.ok) {
      const text = await resp.text().catch(function () {
        return "";
      });
      throw new Error(resp.status + " " + resp.statusText + (text ? ": " + text : ""));
    }
    return resp.json();
  }

  async function listRules() {
    if (USE_MOCK_AUTH) {
      await _sleep(150);
      return window.mockData.rules;
    }
    return _authedFetch("/rules");
  }

  async function updateRules(country, config) {
    if (USE_MOCK_AUTH) {
      // RBAC is enforced server-side once the real backend is wired, but we
      // mirror it here so the mock UI behaves the same way during the demo.
      if (!_currentUser || _currentUser.role !== "ADMIN") {
        const err = new Error("FORBIDDEN: only ADMIN can update rules");
        err.status = 403;
        throw err;
      }
      await _sleep(200);
      const prev = window.mockData.rules[country] || { country: country, version: 0 };
      const next = {
        country: country,
        version: prev.version + 1,
        is_active: true,
        config: config,
      };
      window.mockData.rules[country] = next;
      return next;
    }
    return _authedFetch("/rules/" + encodeURIComponent(country), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
  }

  async function uploadVerification(formData) {
    if (USE_MOCK_AUTH) {
      await _sleep(500);
      return { verification_id: "mock-" + _uuid() };
    }
    return _authedFetch("/verifications", { method: "POST", body: formData });
  }

  async function getVerification(id) {
    if (USE_MOCK_AUTH) {
      await _sleep(250);
      return window.mockData.sampleVerification(id);
    }
    return _authedFetch("/verifications/" + encodeURIComponent(id));
  }

  async function getVerificationAudit(id) {
    if (USE_MOCK_AUTH) {
      await _sleep(150);
      return [
        { action: "VERIFICATION_CREATED", message: "Job accepted", created_at: new Date().toISOString() },
        { action: "STAGE_COMPLETED", stage: "EXTRACTION", message: "OCR finished" },
        { action: "STAGE_COMPLETED", stage: "RISK_VERDICT", message: "Verdict: REVIEW" },
      ];
    }
    return _authedFetch("/verifications/" + encodeURIComponent(id) + "/audit");
  }

  function _uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    // RFC4122 v4 fallback for older browsers.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ===========================================================================
  // Public surface
  // ===========================================================================

  window.api = {
    // Auth
    loginWithEntra: loginWithEntra,
    getCurrentUser: getCurrentUser,
    logout: logout,

    // Verifications
    uploadVerification: uploadVerification,
    getVerification: getVerification,
    getVerificationAudit: getVerificationAudit,

    // Rules
    listRules: listRules,
    updateRules: updateRules,

    // Exposed for the dev-only login UI; do not rely on this in real code.
    _config: { USE_MOCK_AUTH: USE_MOCK_AUTH, ENTRA_CONFIG: ENTRA_CONFIG },
  };
})();
