import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { Pool } from "pg";
import { config } from "./config/env";
import { logger } from "./config/logger";
import { createHealthRouter } from "./health/health.routes";
import { createContentRouter } from "./content/content.routes";
import { errorHandler, notFoundHandler } from "./http/errorHandler";
import { metricsHandler, metricsMiddleware } from "./metrics/metrics";

/**
 * Builds the Express application. Accepts the pool as a dependency so tests can
 * inject a mock/!test pool.
 */
export function createApp(pool: Pool): Application {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  // Fail closed: if no origins are configured, do not reflect arbitrary origins.
  // Same-origin requests (no Origin header) are always allowed.
  app.use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : false,
    })
  );
  app.use(express.json());
  app.use(
    pinoHttp({
      logger,
      // Reduce noise: health checks logged at debug level.
      customLogLevel: (req, res, err) => {
        if (req.url === "/health" || req.url === "/ready") return "debug";
        if (res.statusCode >= 500 || err) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    })
  );

  // Record HTTP request metrics for every request (before routing).
  app.use(metricsMiddleware);

  // Prometheus scrape endpoint.
  app.get("/metrics", metricsHandler);

  // Health/readiness at the root.
  app.use("/", createHealthRouter());

  // API v1.
  app.use("/api/v1/content", createContentRouter(pool));

  // Fallbacks.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
