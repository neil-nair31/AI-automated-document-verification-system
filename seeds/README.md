# Seeds

## Users (phase 2 — available now)

```bash
# Postgres running + migrations applied:
python -m seeds.seed_users

# Or via Docker:
docker compose run --rm api python -m seeds.seed_users
```

| Email | Role | Password |
|-------|------|----------|
| `admin@rts.com` | ADMIN | `SEED_DEFAULT_PASSWORD` (default: `changeme-dev-only`) |
| `operator@rts.com` | OPERATOR | same |

These match `frontend/mockData.js` so the UI can call `POST /auth/login` when mock auth is disabled.

## Coming in phase 5

- Country rule configs for two countries (e.g. `US`, `IN`) covering all six `DocumentType`s
- Adapter fixtures (USCIS, E-Verify, NSC) for the external corroboration stage
