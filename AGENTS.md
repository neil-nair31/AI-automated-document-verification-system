# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

AI-automated document verification system (work-permit / immigration docs). Two components:

- **Backend API** — FastAPI + PostgreSQL + Alembic (in `app/`, served on port 8000)
- **Frontend** — Vanilla JS SPA with mock auth (in `frontend/`, served on port 8080 via any static server)

Phase 2 auth is implemented: `POST /auth/login`, `GET /auth/me`, `GET /admin/ping` (ADMIN-only RBAC smoke test), plus `python -m seeds.seed_users`. Frontend still uses mock Entra SSO by default (`USE_MOCK_AUTH` in `frontend/api.js`).

### Running services

**PostgreSQL** must be running before starting the backend:
```
sudo pg_ctlcluster 16 main start
```

**Backend** (with hot-reload):
```
cd /workspace && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend** (static file server):
```
cd /workspace/frontend && python3 -m http.server 8080
```

### Database setup

Database `docverify` with user `docverify` / password `docverify` on `localhost:5432`. Migrations:
```
cd /workspace && alembic upgrade head
```

### Key caveats

- The `.env` file uses `POSTGRES_HOST=localhost` for local dev (the `.env.example` uses `postgres` which is the Docker Compose service name).
- `ALLOWED_MIME_TYPES` in `.env` must be a JSON array (e.g., `["application/pdf","image/png"]`), not CSV. Pydantic-settings v2.7 tries JSON-decode before the field_validator runs.
- `pytest` runs unit tests always; DB integration tests skip if Postgres is unavailable. Run `alembic upgrade head` and seed users before integration tests.
- `ruff check app/` passes cleanly; no lint config files exist yet.
- Frontend uses ES modules — must be served over HTTP (not `file://`).
- The backend creates tables via Alembic (`pgcrypto` extension required in the `docverify` database).
