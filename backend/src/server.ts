import { createApp } from "./app";
import { config } from "./config/env";
import { logger } from "./config/logger";
import { closePool, pool } from "./db/pool";

const app = createApp(pool);

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv },
    "Netflix backend listening"
  );
});

/** Graceful shutdown so in-flight requests finish and the pool closes cleanly. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down");
  server.close(async () => {
    await closePool();
    logger.info("Shutdown complete");
    process.exit(0);
  });
  // Force-exit if graceful shutdown stalls.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
