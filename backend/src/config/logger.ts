import pino from "pino";
import { config } from "./env";

/**
 * Structured JSON logger. In development we pretty-print if the terminal
 * supports it; in production logs are emitted as JSON for log aggregation
 * (e.g. Loki/Promtail per the architecture).
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: "netflix-backend" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export type Logger = typeof logger;
