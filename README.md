# Work-Permit & Document Verification API

Deterministic, rule-based document-verification platform. FastAPI + PostgreSQL
+ SQLAlchemy, OCR via PaddleOCR (with PyMuPDF for born-digital PDFs), JWT auth
with two roles (ADMIN, OPERATOR). MVP prototype — no paid vendor dependencies;
external sources (USCIS, E-Verify, NSC) are wired behind mockable adapter
interfaces so real integrations can be slotted in later.

> **Status: scaffold phase.** Project structure, data models, Alembic
> migration, and the `/health` endpoint are in place. Auth, the 5-stage
> verification pipeline, the full API surface, seed data, tests, and the
> frontend will be added in subsequent phases — see [Roadmap](#roadmap).

## Project layout

```
.
├── app/
│   ├── main.py                # FastAPI app factory (currently wires /health only)
│   ├── config.py              # Settings via pydantic-settings (env / .env)
│   ├── database.py            # SQLAlchemy engine, SessionLocal, Base, get_db
│   ├── enums.py               # Role, DocumentType, Verdict, RiskLevel, PipelineStage, ...
│   ├── models/                # SQLAlchemy ORM models
│   │   ├── user.py            #   User
│   │   ├── verification.py    #   Verification (job)
│   │   ├── document.py        #   Document (one per uploaded file)
│   │   ├── check.py           #   CheckResult (one row per check evaluated)
│   │   ├── rule.py            #   CountryRule (versioned JSONB config)
│   │   └── audit.py           #   AuditLog (immutable, append-only)
│   ├── schemas/               # Pydantic request/response models — next phase
│   ├── routers/               # FastAPI route modules
│   │   └── health.py          #   /health (DB roundtrip)
│   ├── pipeline/              # 5-stage engine — pipeline phase
│   ├── adapters/              # External-source adapters (USCIS/E-Verify/NSC mocks)
│   ├── core/                  # Auth, JWT, RBAC dependency guards
│   └── storage/               # File storage helpers
├── alembic/
│   ├── env.py
│   └── versions/
│       └── 0001_initial_schema.py
├── seeds/                     # Seed data — next phase
├── tests/                     # pytest suite — next phase
├── frontend/                  # Vanilla HTML/JS SPA — next phase
├── alembic.ini
├── docker-compose.yml         # api + postgres
├── Dockerfile
├── requirements.txt
└── .env.example
```

## Data model overview

| Table            | Purpose                                                                                          |
|------------------|--------------------------------------------------------------------------------------------------|
| `users`          | Auth principals. `role` ∈ {ADMIN, OPERATOR}.                                                     |
| `verifications`  | One job per submitted bundle. Holds `status`, final `verdict`, `risk_level`, `risk_score`.       |
| `documents`      | One row per uploaded file. Stores OCR output (`extracted_fields`, `field_confidences`, `raw_text`) plus storage metadata (`storage_path`, `sha256`, `size_bytes`). |
| `check_results`  | One row per check evaluated by any pipeline stage. Carries `stage`, `name`, `status`, `score`, `weight`, human-readable `reason`, structured `details`. |
| `country_rules`  | Versioned JSONB config per country (`(country, version)` unique). `is_active` flags the row used at runtime. Includes thresholds, signal weights, and per-`DocumentType` field requirements / regexes. |
| `audit_logs`     | Append-only ledger. Every verification mutation, rule update, and login event lands here.        |

Key design choices:

- **Country rules are data-driven** — admins edit the JSONB config via
  `PUT /rules/{country}`; operators read-only via `GET /rules`. Confidence
  thresholds, signal weights, required fields, and validity windows live there,
  not in code.
- **Check `weight` is snapshotted onto each `CheckResult`** so historical
  verdicts stay reproducible after rules change.
- **`AuditLog` has no update or delete path** — neither in the model nor in
  the API. Mutations go in as new rows.
- **All IDs are UUIDs** (`gen_random_uuid()` server-side).
- **All JSON blobs are `JSONB`** (indexable, queryable).

## Pull requests

To merge open work into `main`, see **[docs/MERGING.md](docs/MERGING.md)**. Draft PRs must be
marked **Ready for review** before GitHub shows **Merge pull request**.

## Deployment

See **[DEPLOY.md](DEPLOY.md)** for concrete runbooks covering three targets:
local single-machine, a single VM with Caddy + TLS via the
`docker-compose.prod.yml` override, and one-command Fly.io.

**Quick start (local):**

```bash
cp .env.example .env
docker compose up --build -d
curl http://localhost:8000/health
```

**Production (single VM):** set `DEPLOY_DOMAIN` in `.env`, point DNS at the host, then:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
curl -s https://YOUR_DOMAIN/health
```

**Fly.io (public HTTPS in a few minutes):** install [flyctl](https://fly.io/docs/hands-on/install-flyctl/), then from the repo root:

```bash
fly auth login
# Edit fly.toml: change `app = "docverify"` to a name that is globally unique on Fly.
fly launch --no-deploy --copy-config
fly postgres create --name YOUR_DB_NAME --region iad
fly postgres attach YOUR_DB_NAME
fly secrets set JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
fly volumes create storage --size 1 --region iad
fly deploy
```

Then open the URL `fly status` prints and hit `/health`. Custom domains and day-2 ops are in [DEPLOY.md](DEPLOY.md).

## Running the scaffold

```bash
cp .env.example .env
docker compose up --build
```

Then:

```bash
curl http://localhost:8000/health
# -> {"status":"ok","version":"0.1.0","database":"up"}
```

The `api` container runs `alembic upgrade head` before starting Uvicorn, so the
schema is applied on first boot.

### Running migrations manually

```bash
docker compose run --rm api alembic upgrade head
docker compose run --rm api alembic downgrade -1
```

### Running outside Docker

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export $(grep -v '^#' .env | xargs)   # or use direnv
alembic upgrade head
uvicorn app.main:app --reload
```

## Roadmap

| Phase | Scope                                                                                             | Status |
|-------|---------------------------------------------------------------------------------------------------|--------|
| 1     | Project structure, models, migrations, docker, `/health`                                          | **done** |
| 2     | Auth: `POST /auth/login`, password hashing, JWT issue/verify, RBAC dependency guards              | next |
| 3     | Pipeline stage modules: extraction, internal consistency, cross-document, external, risk verdict  | pending |
| 4     | API routes: `/verifications` (create + get + audit), `/rules` (get + put, ADMIN-only)             | pending |
| 5     | Seed data: ADMIN + OPERATOR users, rule configs for two countries, adapter fixtures               | pending |
| 6     | Tests: pipeline unit tests, RBAC tests, end-to-end happy-path                                     | pending |
| 7     | Frontend: vanilla HTML/JS login + upload + verdict view                                           | pending |

— Pausing here for review before phase 2, as requested.
