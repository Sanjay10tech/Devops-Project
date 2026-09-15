import { Pool } from "pg";
import { config } from "../config/env";
import { logger } from "../config/logger";

/**
 * Shared PostgreSQL connection pool. Credentials are sourced entirely from
 * environment configuration.
 */
export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle PostgreSQL client");
});

/** Simple connectivity check used by the readiness probe. */
export async function checkDatabase(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
