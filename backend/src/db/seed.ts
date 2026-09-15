import fs from "fs";
import path from "path";
import { pool, closePool } from "./pool";
import { logger } from "../config/logger";

/**
 * Loads development seed data. Idempotent — the SQL uses ON CONFLICT / NOT EXISTS
 * so it can be re-run safely.
 */
const SEED_FILE =
  process.env.SEED_FILE ??
  path.resolve(__dirname, "../../../database/seeds/seed.sql");

async function run(): Promise<void> {
  const sql = fs.readFileSync(SEED_FILE, "utf8");
  await pool.query(sql);
  logger.info("Seed data loaded");
}

run()
  .catch((err) => {
    logger.error({ err }, "Seeding failed");
    process.exitCode = 1;
  })
  .finally(() => closePool());
