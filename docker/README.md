# Docker

Production-oriented container configuration for the Netflix-inspired app, plus a
`docker-compose.yml` at the repo root for local development.

## Files

| File | Purpose |
|---|---|
| `../backend/Dockerfile` | Multi-stage build for the Node/TypeScript API |
| `../backend/.dockerignore` | Keeps build context small & secret-free |
| `../backend/healthcheck.js` | Dependency-free liveness probe used by HEALTHCHECK |
| `../frontend/Dockerfile` | Multi-stage build → unprivileged Nginx serving the SPA |
| `../frontend/nginx.conf` | Nginx template: static serving, `/api` proxy, `/healthz` |
| `../frontend/.dockerignore` | Keeps build context small & secret-free |
| `../docker-compose.yml` | Local dev stack: Postgres + migrate + backend + frontend |
| `nginx.conf` | Reference copy of the frontend Nginx config |

## Design decisions (mapped to the requirements)

1. **Multi-stage builds** — Backend: `deps → build → prod-deps → runtime`. Frontend:
   `deps → build → nginx`. Build tooling and dev dependencies never reach the final image.
2. **Minimal production images** — `node:20-alpine` for the backend runtime,
   `nginxinc/nginx-unprivileged:1.27-alpine` for the frontend. Measured sizes:
   backend ≈ 206 MB, frontend ≈ 74 MB.
3. **Non-root** — Backend runs as the built-in `node` user (uid 1000). The frontend
   uses the unprivileged Nginx image (uid 101, listens on 8080).
4. **`.dockerignore`** — Present for both services; excludes `node_modules`, `dist`,
   `.env`, `.git`, etc. `.env.example` is explicitly kept.
5. **No secrets in images** — No credentials are copied or baked in. Configuration
   is injected at runtime via environment variables (compose / a secret manager in prod).
   SQL migrations are **mounted read-only** into the migrate job rather than baked in.
6. **Health checks** — Backend `HEALTHCHECK` runs `node healthcheck.js` → `GET /health`.
   Frontend `HEALTHCHECK` runs `wget .../healthz`. Postgres uses `pg_isready`.
7. **Environment-based configuration** — All config (DB connection, ports, CORS,
   log level, API base URL) comes from environment variables.
8. **Layer-cache optimization** — Manifests (`package.json`, lockfile) are copied and
   dependencies installed **before** copying source, so code changes don't invalidate
   the dependency layer.
9. **Reproducibility** — Node and Nginx versions are pinned via build args. The build
   prefers `npm ci` against a committed lockfile; commit `package-lock.json` for fully
   deterministic installs (see note below).

> **Reproducibility note:** the Dockerfiles use `npm ci` when a `package-lock.json`
> is present and fall back to `npm install` when it isn't (no lockfile has been
> generated yet because dependencies haven't been installed on a dev machine).
> To make builds fully reproducible, run `npm install` in `backend/` and `frontend/`
> once and commit the generated `package-lock.json` files.

## Building the images

```bash
# from the repo root
docker build -t netflix-backend:local ./backend
docker build -t netflix-frontend:local ./frontend
```

## Local development with docker compose

```bash
# from the repo root
cp .env.example .env          # optional; compose has sane defaults (Windows: copy)
docker compose up -d --build
```

Startup order is enforced by health/condition gates:

```
db (healthy) ──► migrate (runs migrations + seed, then exits 0)
                     └──► backend (healthy) ──► frontend
```

Access points:

| Service | URL |
|---|---|
| Frontend (SPA) | http://localhost:8080 |
| Backend API | http://localhost:4000 |
| Backend health | http://localhost:4000/health |
| Backend readiness | http://localhost:4000/ready |
| API via frontend proxy | http://localhost:8080/api/v1/content/home |

Tear down (add `-v` to also remove the Postgres volume):

```bash
docker compose down
docker compose down -v        # also wipes the database volume
```

## Verified test run

The following was executed against Docker Engine 29.7.2 / Compose v5.4.0:

```
docker build ./backend            → success (netflix-backend:local, ~206 MB)
docker build ./frontend           → success (netflix-frontend:local, ~74 MB)
docker compose up -d --build      → db, backend, frontend all report (healthy)

GET :4000/health                  → 200 {"status":"ok",...}
GET :4000/ready                   → 200 {"status":"ready","checks":{"database":"ok"}}
GET :4000/api/v1/content/home     → 200 (seeded data, "Neon Horizon" featured)
GET :8080/                        → 200 (SPA HTML with #root)
GET :8080/healthz                 → 200 "ok"
GET :8080/api/v1/content/home     → 200 (Nginx proxy → backend)
```

Database connectivity is confirmed by `/ready` returning `database: ok` and by the
home endpoint serving seeded rows (the migrate job applied the schema and seed).

## Troubleshooting

- **`npm ci` fails during build** — no `package-lock.json` yet. Either commit a
  lockfile (preferred) or rely on the built-in `npm install` fallback.
- **Frontend can't reach the API** — the browser calls `/api/...` and Nginx proxies
  to `BACKEND_URL` (default `http://backend:4000`). Ensure the backend is healthy.
- **`/ready` returns 503** — the backend can't reach Postgres. Check the `db` service
  is healthy and the `DB_*` env values match.
- **Port already in use** — override host ports via `.env`
  (`BACKEND_PORT`, `FRONTEND_PORT`, `DB_PORT`).
- **Docker daemon not running** — start Docker Desktop and wait for the engine to
  report a `Server` version (`docker info`).
