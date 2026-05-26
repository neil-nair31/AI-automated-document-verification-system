# Deployment

This document covers the three deployment paths shipped with the repo:

1. **Local / single machine** (already supported by `docker-compose.yml`)
2. **Single VM** with Caddy fronting TLS, using the `docker-compose.prod.yml` override
3. **Fly.io** for a managed one-command cloud deploy

> **Scope today.** The application currently exposes one HTTP route — `GET /health`. Auth, the verification pipeline, and the `/verifications` / `/rules` routes haven't landed yet (see the Roadmap in the [main README](README.md)). Deploying now gets your infrastructure, DNS, TLS, secrets handling, and migration pipeline proven on a small surface area so adding routes later is just a `docker compose pull && docker compose up -d` away.

---

## Pre-deploy checklist

Regardless of target, do these once:

- [ ] Generate a real `JWT_SECRET`:
      `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- [ ] Pick a strong `POSTGRES_PASSWORD` (or use a managed DB and ignore this).
- [ ] Decide on a domain (e.g. `docverify.example.com`). Point its DNS at the host **before** you start the stack so Caddy can issue a TLS cert on first boot.
- [ ] Never commit `.env`.

---

## 1. Local / single machine

Already supported, no changes needed.

```bash
cp .env.example .env
docker compose up --build -d
curl http://localhost:8000/health
# -> {"status":"ok","version":"0.1.0","database":"up"}
```

Shut down: `docker compose down`. Wipe data: `docker compose down -v`.

---

## 2. Single VM (DigitalOcean, EC2, Hetzner, Linode, …)

Cheapest realistic production target. The included `docker-compose.prod.yml` override + `Caddyfile` give you TLS, multi-worker uvicorn, separated migrations, and a non-public Postgres.

### How the compose files layer together

The repo ships three compose files. Which ones get loaded depends on how you invoke Compose:

| File | Loaded by `docker compose up` | Loaded by `... -f docker-compose.yml -f docker-compose.prod.yml up` |
|---|:---:|:---:|
| `docker-compose.yml` (base, prod-safe defaults) | yes | yes |
| `docker-compose.override.yml` (dev: bind mount, host ports, `--reload`) | yes — auto | no |
| `docker-compose.prod.yml` (prod: migrate one-shot, workers, healthcheck, Caddy) | no | yes |

So **dev** is just `docker compose up`, and **prod** is the explicit two-`-f` invocation that skips the override file. Concretely the prod stack:

| Concern | Dev | Prod |
|---|---|---|
| Source code | bind-mounted (`.:/app`) | baked into the image |
| uvicorn | `--reload`, 1 worker | 4 workers, `--proxy-headers`, `--forwarded-allow-ips=*` |
| Migrations | run inside `api`'s startup command | one-shot `migrate` service that `api` `depends_on: service_completed_successfully` |
| Postgres host port | published on `:5432` | not published — internal network only |
| API host port | published on `:8000` | not published — only Caddy is public-facing |
| TLS | none | Caddy auto-issues + renews Let's Encrypt certs |

### Steps

```bash
# On the VM, with docker + docker compose plugin installed:
git clone <your-repo> docverify
cd docverify
git checkout cursor/scaffold-docverify-8022   # or main, once it's merged

cp .env.example .env
# Edit .env: set strong POSTGRES_PASSWORD, JWT_SECRET, and
#   DEPLOY_DOMAIN=docverify.example.com
$EDITOR .env
chmod 600 .env

# Point DNS at this host's public IP first.
# Then bring everything up:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Watch Caddy obtain the cert on first boot:
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy
```

Verify end-to-end:

```bash
curl -s https://docverify.example.com/health
# -> {"status":"ok","version":"0.1.0","database":"up"}
```

### Day-2 operations

```bash
# Rolling update after a new release:
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build api
# (migrate runs once because it depends on a clean exit; api restarts after.)

# Apply a migration manually:
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate

# Tail logs:
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api caddy

# Database backup (run as a daily cron):
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backups/$(date +%F).sql.gz
```

> **Backups.** The compose stack writes data to two named volumes (`pgdata`, `storage`). For anything real, also rsync/restic those off-box, or move Postgres to a managed DB and only back up `storage`.

### Hardening notes

- The default firewall posture should be: allow `80`, `443`, `22`; block everything else (including `5432` and `8000`). `ufw` two-liner: `ufw default deny incoming; ufw allow 22,80,443/tcp`.
- `JWT_SECRET` should come from a secret manager (AWS Parameter Store, Vault, etc.) once you have more than one host. The Pydantic settings class reads from env, so no code change is needed — just inject the var.
- Set `APP_ENV=production` in `.env` so future code can branch on it (logging, debug routes, CORS).
- Once OCR is wired in, the api image grows ~1 GB (PaddleOCR + deps). Consider switching the VM to ≥2 GB RAM.

---

## 3. Fly.io (managed one-command cloud)

Fastest path to a public HTTPS URL. Everything is wired in `fly.toml`.

### One-time setup

```bash
curl -L https://fly.io/install.sh | sh        # or: brew install flyctl
fly auth login

# Pick a globally-unique app name and update fly.toml's `app = "..."` line.
$EDITOR fly.toml

fly launch --no-deploy --copy-config          # creates the app shell on Fly

# Managed Postgres (hobby tier is free for small workloads):
fly postgres create --name docverify-db --region iad
fly postgres attach docverify-db              # injects DATABASE_URL secret

# App secrets:
fly secrets set JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"

# Persistent volume for uploaded files:
fly volumes create storage --size 1 --region iad

fly deploy
```

### Why this works without code changes

`app/config.py` checks for `DATABASE_URL` (which `fly postgres attach` sets) and falls back to the per-component `POSTGRES_*` vars otherwise. The legacy `postgres://` scheme that Fly emits is normalised to SQLAlchemy 2.x's `postgresql+psycopg2://` form automatically. The `[deploy]` block runs `alembic upgrade head` in a one-shot machine on every release, so the schema stays current without anyone shelling in.

### Day-2

```bash
fly deploy                                    # release new code
fly logs                                      # tail logs
fly status                                    # machine + volume health
fly ssh console                               # interactive shell into the container
fly postgres connect -a docverify-db          # psql into the managed DB
fly secrets list                              # see what's set
fly volumes snapshots create storage          # back up uploaded files
```

### Custom domain + TLS

```bash
fly certs create docverify.example.com
# then add the AAAA / A records that `fly certs show` prints,
# wait for the cert to validate (~1 minute), and the site is live.
```

---

## What to verify after any deploy

```bash
# 1. Health endpoint reachable and DB up:
curl -s https://YOUR_HOST/health
# -> {"status":"ok","version":"0.1.0","database":"up"}

# 2. Migrations are at head:
#   - VM:   docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate alembic current
#   - Fly:  fly ssh console -C "alembic current"
# Expect: 0001_initial_schema (head)

# 3. OpenAPI docs render:
curl -sI https://YOUR_HOST/docs | head -1
# -> HTTP/2 200
```

If `/health` returns `"database":"down"`, the most common causes are: wrong
`DATABASE_URL`, the postgres container hasn't finished its initial `initdb`,
or the firewall is blocking the api → postgres link. Check
`docker compose ... logs postgres` or `fly logs` first.

---

## What this DOES NOT yet cover

Once the rest of the phases land, this document grows to include:

- CORS configuration for the frontend origin (phase 7).
- Object storage (S3/MinIO) instead of the local `storage` volume (phase 4 / `app/storage`).
- Background workers / job queue for the verification pipeline (phase 3).
- Secret rotation for `JWT_SECRET` without invalidating active sessions.
- Multi-region Postgres replicas.

None of those are needed for an MVP demo. Get the boring infrastructure proven first.
