import fs from "fs";
import path from "path";
import { pool, closePool } from "./pool";
import { logger } from "../config/logger";

/**
 * Minimal forward-only migration runner for local development.
 * Applies any Vx__*.sql file in database/migrations that hasn't been recorded
 * in schema_migrations yet, in filename order. Production uses Flyway with the
 * same file naming convention (see database/README.md).
 */
const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ??
  path.resolve(__dirname, "../../../database/migrations");

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedVersions(): Promise<Set<string>> {
  const res = await pool.query<{ version: string }>(
    "SELECT version FROM schema_migrations"
  );
  return new Set(res.rows.map((r) => r.version));
}

async function run(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedVersions();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.split("__")[0];
    if (applied.has(version)) {
      logger.info({ file }, "Migration already applied, skipping");
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [version]
      );
      await client.query("COMMIT");
      logger.info({ file }, "Applied migration");
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error({ err, file }, "Migration failed, rolled back");
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info("Migrations complete");
}

run()
  .catch((err) => {
    logger.error({ err }, "Migration runner failed");
    process.exitCode = 1;
  })
  .finally(() => closePool());
