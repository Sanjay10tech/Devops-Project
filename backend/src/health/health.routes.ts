import { Router } from "express";
import { checkDatabase } from "../db/pool";
import { asyncHandler } from "../http/asyncHandler";
import { logger } from "../config/logger";

/**
 * Health and readiness endpoints.
 * - /health  : liveness. Process is up and serving. Never touches dependencies.
 * - /ready   : readiness. Verifies downstream dependencies (DB) are reachable.
 */
export function createHealthRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "netflix-backend",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  router.get(
    "/ready",
    asyncHandler(async (_req, res) => {
      try {
        await checkDatabase();
        res.json({ status: "ready", checks: { database: "ok" } });
      } catch (err) {
        logger.error({ err }, "Readiness check failed");
        res.status(503).json({
          status: "not_ready",
          checks: { database: "error" },
        });
      }
    })
  );

  return router;
}
