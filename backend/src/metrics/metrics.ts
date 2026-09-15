import { NextFunction, Request, Response } from "express";
import client from "prom-client";

/**
 * Prometheus metrics for the backend.
 * Exposes:
 *  - default process/Node.js metrics (CPU, memory, event loop, GC, ...)
 *  - http_requests_total{method,route,status_code}          (request + error rate)
 *  - http_request_duration_seconds{method,route,status_code} (latency histogram)
 */
export const registry = new client.Registry();

// Default metrics: process CPU/memory, event loop lag, GC, etc.
client.collectDefaultMetrics({
  register: registry,
  prefix: "netflow_backend_",
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests, labeled by method, route, and status code",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  // Buckets tuned for a low-latency JSON API.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/**
 * Express middleware that records request count + duration. Uses the matched
 * route path (e.g. /api/v1/content/:id) as the `route` label to avoid
 * high-cardinality raw URLs.
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip the scrape endpoint itself.
  if (req.path === "/metrics") return next();

  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const route =
      (req.route && (req.baseUrl || "") + req.route.path) ||
      req.baseUrl ||
      "unmatched";
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
}

/** Handler for GET /metrics. */
export async function metricsHandler(
  _req: Request,
  res: Response
): Promise<void> {
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
}
