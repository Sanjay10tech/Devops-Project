import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { Pool } from "pg";

// A stub pool — /metrics and /health don't touch the DB.
const stubPool = {} as unknown as Pool;

describe("GET /metrics", () => {
  const app = createApp(stubPool);

  it("exposes the Prometheus exposition format", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
  });

  it("includes default Node.js process metrics", async () => {
    const res = await request(app).get("/metrics");
    // collectDefaultMetrics with our prefix.
    expect(res.text).toContain("netflow_backend_process_cpu_seconds_total");
    expect(res.text).toMatch(/netflow_backend_nodejs_/);
  });

  it("records http_requests_total and latency after a request", async () => {
    // Generate a request that gets counted (health endpoint).
    await request(app).get("/health");
    const res = await request(app).get("/metrics");
    expect(res.text).toContain("http_requests_total");
    expect(res.text).toContain("http_request_duration_seconds");
    // The /health request should have been counted with status 200.
    expect(res.text).toMatch(/http_requests_total\{[^}]*status_code="200"[^}]*\}/);
  });
});
