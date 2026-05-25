# AI-automated Document Verification System

Vanilla prototype of the work-permit document verification frontend for the
RTS Talent Acquisition project. Frontend only; the backend will be FastAPI +
MongoDB.

The entire UI lives in `frontend/` — five files, no framework, no build step,
no `node_modules`. Open `index.html` via a static server and walk the full
demo flow: log in, upload, view result, edit rules.

## How to run

The frontend uses ES modules, which browsers refuse to load from `file://`
URLs. Serve over HTTP with any static server. Python's built-in works:

```sh
git clone https://github.com/neil-nair31/AI-automated-document-verification-system.git
cd AI-automated-document-verification-system/frontend
python3 -m http.server 8000
```

Then open <http://localhost:8000/> in a browser. (`Ctrl+C` to stop the
server.) Any other static server works — Caddy, `npx serve`, nginx — only
requirement is correct `Content-Type` for `.js` files.

Tested with Python 3.10+. Chrome / Firefox / Safari, latest versions.

## How to test

There are two mock users:

| Email                  | Display name  | Role     |
|------------------------|---------------|----------|
| `admin@rts.com`        | Priya Admin   | ADMIN    |
| `operator@rts.com`     | Sam Operator  | OPERATOR |

The login screen has a **dev-only** dropdown that picks which of the two
to "sign in" as. (Removed once Entra ID is wired — see `USE_MOCK_AUTH` in
`frontend/api.js`.)

### Demo walk-through

1. Open the page. You land on the login screen.
2. Pick **Operator** in the dev dropdown, click *Sign in with Microsoft*.
   You'll see a brief "Redirecting to Microsoft…" state (the 300 ms mock
   latency), then land on the upload screen with **Sam Operator** /
   `operator@rts.com` in the top bar. The Rules tab is hidden — operators
   don't have access.
3. Pick a country (USA or India), drag a few files into the dropzone (or
   click **Add files**), tag each one with a document type, click
   **Submit verification**.
4. Land on the result screen. The verdict, risk score, escalation action,
   four-stage pipeline strip, per-document cards (with extracted fields
   and per-check pass/fail + reasons), and a collapsible audit log all
   render from the mock data.
5. Click **Sign out**. Pick **Admin** in the dropdown. Sign in.
6. The **Rules** tab is now visible in the top bar. Open it, switch
   between USA (16 rules) and India (7 rules), click **Edit rules**, tweak
   a weight, click **Save changes**.

### The three mock verifications

`api.submitVerification` randomly returns one of three records on each
submission, so you'll see all three verdict paths over a few rounds:

| ID                   | Verdict     | Risk | Escalation             | What it demonstrates |
|----------------------|-------------|------|------------------------|----------------------|
| `ver_2026_05_25_001` | `GENUINE`   |  12  | auto-approve           | Clean Marcus Lee record — passport + EAD (C09 matches I-797C) + résumé. Every check green; verdict panel green; pipeline strip all green. |
| `ver_2026_05_25_002` | `REVIEW`    |  52  | manual review          | Nelz Kumar (passport / EAD) vs Neil Kumar (résumé). One cross-document name-match check fails with reason *"Name on résumé (Neil Kumar) does not match name on passport (Nelz Kumar)…"*. Verdict panel amber; pipeline strip flags Cross-Document Corroboration; failing check row red-tinted. |
| `ver_2026_05_25_003` | `HIGH_RISK` |  78  | compliance escalation  | Daniel Okafor. EAD card OCR'd cleanly with category C09, but the I-797C on file shows C36 (the spec's high-weight fraud signal, weight 10/10). Verdict panel red; both Cross-Document and Risk-Based Verdicting stages flagged; reason *"EAD card shows category C09 but the I-797C on file shows category C36…"*. |

Once on a result screen, you can navigate directly to a specific record by
typing its ID into the URL hash (e.g. `#result/ver_2026_05_25_003`).
Useful for demos.

## What's mocked vs real

Everything below the URL bar is real DOM + real JavaScript. Everything
**behind the network boundary** is mocked:

| Concern                         | State    | Notes                                                  |
|---------------------------------|----------|--------------------------------------------------------|
| Entra ID (Microsoft) SSO        | Mocked   | `api.loginWithEntra()` returns a fixture user after a 300 ms artificial delay. The Microsoft button + the "Redirecting to Microsoft…" state are real; the redirect itself isn't. |
| JWT / access token              | Mocked   | Fake base64 payload in `entraUsers[].accessToken`. Looks plausible in DevTools but is not a real JWT. |
| API calls (submit / get / list) | Mocked   | All `api.*` functions short-circuit to `mockData.js` fixtures. See `// TODO: replace with fetch()` markers in each. |
| File contents                   | Not read | The upload pipeline records `{ filename, documentType }` only. No OCR, no parsing, no file bytes leave the page. The real backend will receive multipart-form bodies. |
| Persistence                     | None     | Session and form state are in-memory only. Hard refresh ⇒ back to login screen. By design for a prototype. |
| RBAC                            | Real     | Enforced inside `api.updateRules()` (throws `FORBIDDEN` for non-ADMIN) **and** inside `app.js` `onHashChange()` (redirects non-ADMIN away from `#rules`). Defense in depth. |
| Routing / view switching        | Real     | `location.hash` drives navigation through `renderView()`. Back/forward, deep-link, direct `#result/<id>` URLs all work. |
| Verdict colors, escalation map  | Real     | `VERDICT_MODIFIER` and `ESCALATION_DESCRIPTION` in `app.js` are the contract. |

## Backend contract

`frontend/api.js` is the single source of truth for the API surface. Every
exported async function carries a `// TODO: replace with fetch()` comment
showing the eventual endpoint. The day the backend is ready:

1. Set `USE_MOCK_AUTH = false` at the top of `api.js`.
2. Fill in `ENTRA_CONFIG` from the Azure AD app registration.
3. Set `API_BASE_URL` to the backend origin.
4. Inside each function, swap the mock short-circuit for the marked `fetch()`
   call. The function signatures and return shapes don't change.

`app.js` (every view) and `mockData.js` (fixture shapes) require **zero**
edits when the swap happens.

Function          | Eventual endpoint
------------------|-----------------------------------------------
`loginWithEntra`  | MSAL `loginPopup` + `acquireTokenSilent`
`getCurrentUser`  | MSAL `getAllAccounts` + `acquireTokenSilent`
`logout`          | MSAL `logoutPopup`
`submitVerification` | `POST {API_BASE_URL}/verifications` (multipart)
`getVerification` | `GET  {API_BASE_URL}/verifications/{id}`
`listVerifications` | `GET  {API_BASE_URL}/verifications`
`getRules`        | `GET  {API_BASE_URL}/rules/{country}`
`updateRules`     | `PUT  {API_BASE_URL}/rules/{country}` — ADMIN only

## Project structure

```
frontend/
├── index.html      # DOM mount points for the four views + top bar
├── styles.css      # Token-driven palette + components (no inline hex)
├── app.js          # appState, renderView, hash routing, RBAC, login,
│                   # upload, result rendering, rules rendering
├── api.js          # 8 async functions = the eventual REST contract.
│                   # ENTRA_CONFIG + USE_MOCK_AUTH + API_BASE_URL at top.
└── mockData.js     # entraUsers, countryRules (USA + India),
                    # three verification fixtures, STAGES label lookup
```

Everything else at the repo root (`alembic/`, `app/`, `docker-compose*`,
etc.) is the **scaffold for the future FastAPI + Postgres backend** from a
parallel branch — irrelevant to the Mongo-backed version this frontend is
being built against. See PRs #1 and #3 for context.

## Known gaps

Honest list of what isn't here:

- **Drag-and-drop is minimal.** The dropzone accepts a `drop` event and
  reads `dataTransfer.files`, but no preview / no progress indicator / no
  size validation. *Add files* button is the supported path.
- **Mobile layout is not supported.** Desktop-only by spec. No media
  queries; below ~960 px the result + rules tables will overflow.
- **No real OCR, no biometric liveness, no document forgery detection.**
  Out of scope per the Week 1 deck. Reasons in the verdict panel are
  baked into the fixtures.
- **No persistence across page refresh.** In-memory session only. A hard
  refresh from any post-login screen drops you back to login. This is
  deliberate for the prototype — MSAL takes over session storage when
  the real flow is wired.
- **No real e-mail / phone validation, no PDF rendering, no file preview.**
  The frontend records `{ filename, documentType }` per upload; the
  backend will do the heavy lifting.
- **No tests in the repo.** Day-to-day verification was done via headless
  Chrome + the CDP, end-to-end against the three mock verifications and
  the rules-edit flow. Those harnesses live outside the repo.
- **The `app/` and `alembic/` directories at the repo root are NOT this
  frontend's backend.** They're a parallel FastAPI + Postgres scaffold
  from PR #1 / #3, before the team-review decision to switch to
  FastAPI + MongoDB. Frontend doesn't depend on either.

## Defending the prototype

The reviewer-facing summary, in case it comes up:

- **Architecture** is laid out in three layers: `mockData.js` (data
  fixtures) → `api.js` (the eventual REST contract, async + Promise-based,
  no view code) → `app.js` (every view; reads via `api.*`, never reaches
  into `mockData` directly). When the backend ships, only `api.js` changes.
- **RBAC** is enforced in two places: inside `api.updateRules()`
  (`FORBIDDEN` thrown for non-ADMIN) and inside `app.js` `onHashChange()`
  (OPERATOR pasting `#rules` into the URL bar is bounced to `#upload`).
  Hiding the nav button is necessary but not sufficient. This is on
  purpose.
- **Verdict colors** (`#1E8E5C` / `#D99A23` / `#C0392B` / `#6B7A8A`) are
  the only deliberately bold colors in the UI. Everything else is teal /
  navy / light teal so the verdict reads as the dominant element on the
  result page.
- **Reasons are human-readable strings**, not opaque codes. *"Name on
  résumé (Neil Kumar) does not match name on passport (Nelz Kumar)…"* —
  not `name_mismatch_error`. The explainable-verdict promise lives in
  the data, not in the renderer.
- **Edge cases** are handled inline at every render: empty
  `extractedFields` + empty `checks` ⇒ "Document could not be processed"
  placeholder; `confidence: null` ⇒ no "null%" label, just hidden;
  invalid weight in rules ⇒ red border + inline error + save disabled;
  empty audit log ⇒ "No actions recorded yet"; invalid verification ID ⇒
  "Verification not found" with a back-to-upload link.
- **No console.log, no commented-out code, no stub TODOs.** The two
  `// TODO: replace with fetch()` comments in `api.js` are deliberate
  integration markers — the only TODOs in the codebase.
