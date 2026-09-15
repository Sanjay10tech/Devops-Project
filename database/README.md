# Database

PostgreSQL with versioned, forward-only migrations and idempotent dev seed data.

## Layout

```
database/
├── migrations/
│   └── V1__init_schema.sql   categories, genres, content, content_genres (+indexes)
└── seeds/
    └── seed.sql              ~10 sample titles across 5 categories (idempotent)
```

## Schema overview

- **categories** — home-page rows (slug, name, sort_order)
- **genres** — reusable tags
- **content** — movies/shows (type, description, release_year, rating, featured, …)
- **content_genres** — many-to-many join between content and genres

Indexes support the common access patterns: filter by category/type, featured
lookup, and trigram index on `title` for `ILIKE` search.

## Migration strategy

- **Forward-only, versioned** SQL files named `Vx__description.sql`, applied in
  order and tracked in a `schema_migrations` table.
- File naming is **Flyway-compatible** (production uses Flyway per ARCHITECTURE.md);
  for local dev a small Node runner applies the same files.
- Schema changes follow the **expand/contract** pattern to stay backward-compatible
  and avoid destructive rollbacks.

## Local setup

Option A — use your own PostgreSQL. Create the database/user, then from `../backend`:

```bash
# create role + db (example; adjust to taste)
psql -U postgres -c "CREATE USER netflix WITH PASSWORD 'netflix';"
psql -U postgres -c "CREATE DATABASE netflix OWNER netflix;"

cd ../backend
npm run migrate
npm run seed
```

Option B — quick Postgres via Docker (no app containers yet):

```bash
docker run --name netflix-pg -e POSTGRES_USER=netflix \
  -e POSTGRES_PASSWORD=netflix -e POSTGRES_DB=netflix \
  -p 5432:5432 -d postgres:16

cd ../backend && npm run migrate && npm run seed
```

Connection settings come from the backend `.env` (`DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, `DB_PASSWORD`). No credentials are committed to the repo.
