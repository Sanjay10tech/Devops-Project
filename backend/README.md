# Backend

Stateless Node.js + Express REST API written in TypeScript, following a clean,
layered architecture.

## Architecture (layers)

```
src/
├── config/        env.ts (validated env config), logger.ts (pino structured logs)
├── db/            pool.ts (pg pool + readiness check), migrate.ts, seed.ts
├── errors/        AppError.ts (typed HTTP errors)
├── http/          validate.ts, asyncHandler.ts, errorHandler.ts (cross-cutting)
├── health/        health.routes.ts (/health, /ready)
├── content/       types → repository → service → controller → routes  (feature)
├── app.ts         Express app assembly (DI of the pg pool)
└── server.ts      process entrypoint + graceful shutdown
```

- **Controllers** are thin; **services** hold business logic (unit-tested against a
  mock repository); **repositories** own SQL.
- **Validation** with Zod at the HTTP boundary; parsed values are typed.
- **Structured logging** via pino; per-request logging via pino-http.
- **Config** is environment-based and validated at startup — no hardcoded secrets.
- **Health endpoints:** `/health` (liveness), `/ready` (readiness, checks DB).

See [`API.md`](./API.md) for full endpoint documentation.

## Prerequisites

- Node.js >= 18 and npm
- A running PostgreSQL instance (see `../database/README.md`)

## Setup & run (local)

```bash
cd backend
cp .env.example .env         # adjust DB_* values if needed (no secrets committed)
npm install
npm run migrate              # create schema
npm run seed                 # load sample dev data
npm run dev                  # start on http://localhost:4000 (auto-reload)
```

Production-style run:

```bash
npm run build
npm start
```

## Tests

```bash
npm test                     # run unit tests (Vitest)
npm run test:watch           # watch mode
npm run typecheck            # TypeScript type checking
```

Unit tests cover the content **service** (business logic, 404 behavior, filter
pass-through, home-category filtering) and the **validation** schemas.
