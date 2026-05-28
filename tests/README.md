# Tests

```bash
pip install -r requirements.txt
alembic upgrade head
python -m seeds.seed_users
pytest
```

- `tests/test_security.py` — password hashing and JWT (no database).
- `tests/test_auth.py` — `/auth/login`, `/auth/me`, `/admin/ping` RBAC (requires Postgres; skipped otherwise).
