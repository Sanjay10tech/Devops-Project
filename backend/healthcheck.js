// Minimal dependency-free health check used by Docker HEALTHCHECK.
// Exits 0 if GET /health returns 200, otherwise exits 1.
const http = require("http");

const port = process.env.PORT || 4000;

const req = http.request(
  { host: "127.0.0.1", port, path: "/health", timeout: 3000 },
  (res) => {
    process.exit(res.statusCode === 200 ? 0 : 1);
  }
);

req.on("error", () => process.exit(1));
req.on("timeout", () => {
  req.destroy();
  process.exit(1);
});
req.end();
