# Frontend

Populated in the frontend phase. Single-page vanilla HTML/JS that:

1. Logs in via `POST /auth/login` and stores the JWT.
2. Uploads one or more files with `document_type` + `country` to
   `POST /verifications`.
3. Polls `GET /verifications/{id}` and renders the verdict, risk level, and
   per-check pass/fail reasons.

No framework, no build step — served as static files by FastAPI's `StaticFiles`.
