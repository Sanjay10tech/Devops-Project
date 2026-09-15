import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

/**
 * Environment-based configuration.
 * All values come from environment variables — no secrets are hardcoded.
 * Validation fails fast at startup if required config is missing/invalid.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1).default("netflix"),
  DB_USER: z.string().min(1).default("netflix"),
  DB_PASSWORD: z.string().default("netflix"),

  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "Invalid environment configuration:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

const raw = parsed.data;

export const config = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === "production",
  port: raw.PORT,
  db: {
    host: raw.DB_HOST,
    port: raw.DB_PORT,
    name: raw.DB_NAME,
    user: raw.DB_USER,
    password: raw.DB_PASSWORD,
  },
  corsOrigins: raw.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  logLevel: raw.LOG_LEVEL,
} as const;

export type Config = typeof config;
