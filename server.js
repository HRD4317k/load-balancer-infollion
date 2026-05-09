/**
 * server.js
 *
 * Express HTTP server exposing the Load Balancer via REST API.
 *
 * Endpoints:
 *   POST   /route              - Route a request (provide IP or auto-generate)
 *   POST   /simulate           - Run a traffic simulation
 *   GET    /nodes              - List all nodes
 *   POST   /nodes              - Add a new node (with optional weight)
 *   DELETE /nodes/:name        - Remove a node
 *   PATCH  /nodes/:name/weight - Update node weight
 *   GET    /health             - Node health status
 *   PATCH  /health/:name       - Force a node's health status (testing)
 *   GET    /metrics            - Full metrics snapshot
 *   POST   /metrics/reset      - Reset all counters
 *   GET    /rate-limiter       - Rate limiter stats
 *   POST   /rate-limiter/reset/:ip - Reset rate limit for an IP
 *   GET    /dashboard          - Serve the metrics dashboard HTML
 *   GET    /status             - Full system status (health + metrics + nodes)
 */

require("dotenv").config();

const express = require("express");
const path    = require("path");
const logger  = require("./src/logger");
const { LoadBalancer, generateRandomIP } = require("./src/loadBalancer");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Initialise Load Balancer ─────────────────────────────────────────────
const lb = new LoadBalancer();
lb.start();   // kicks off health checker

// ─── Request logging middleware ───────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ─── Helper ───────────────────────────────────────────────────────────────
const respond = (res, status, data) => res.status(status).json(data);
const ok      = (res, data)          => respond(res, 200, { success: true, ...data });
const created = (res, data)          => respond(res, 201, { success: true, ...data });
const bad     = (res, msg)           => respond(res, 400, { success: false, error: msg });
const notFound= (res, msg)           => respond(res, 404, { success: false, error: msg });
const tooMany = (res, data)          => respond(res, 429, { success: false, ...data });
const err     = (res, msg)           => respond(res, 500, { success: false, error: msg });


// ═══════════════════════════════════════════════════════════════════════════
// ROUTE ENDPOINT
// POST /route
// Body: { ip?: string }   — if ip is omitted, a random one is generated
// ═══════════════════════════════════════════════════════════════════════════
app.post("/route", (req, res) => {
  const ip = req.body?.ip || generateRandomIP();

  // Basic IPv4 validation if provided by caller
  if (req.body?.ip) {
    const parts = ip.split(".");
    if (
      parts.length !== 4 ||
      parts.some((p) => isNaN(p) || +p < 0 || +p > 255)
    ) {
      return bad(res, `Invalid IPv4 address: ${ip}`);
    }
  }

  const result = lb.route(ip);

  if (result.rateLimited) {
    return tooMany(res, {
      message:  `Rate limit exceeded for IP ${ip}`,
      resetIn:  `${Math.ceil(result.resetIn / 1000)}s`,
      remaining: result.remaining,
    });
  }

  if (!result.node) {
    return err(res, "No healthy nodes available");
  }

  return ok(res, {
    ip,
    node:      result.node,
    preferred: result.preferred,
    fallback:  result.fallback,
    latencyMs: result.latencyMs,
    remaining: result.remaining,
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// SIMULATE TRAFFIC
// POST /simulate
// Body: { count?: number }   default 10
// ═══════════════════════════════════════════════════════════════════════════
app.post("/simulate", (req, res) => {
  const count   = Math.min(parseInt(req.body?.count) || 10, 100);
  const results = lb.simulateTraffic(count);
  return ok(res, { requested: count, results });
});


// ═══════════════════════════════════════════════════════════════════════════
// NODES
// ═══════════════════════════════════════════════════════════════════════════

// GET /nodes — list all nodes with health + ring distribution
app.get("/nodes", (req, res) => {
  const nodes       = lb.ring.getNodes();
  const health      = lb.healthChecker.getAllStatus();
  const distribution= lb.ring.distribution();

  const enriched = nodes.map((n) => {
    const h = health.find((x) => x.name === n.name) || {};
    return {
      ...n,
      status:      h.status || "unknown",
      latencyMs:   h.latencyMs || 0,
      uptime:      h.uptime || 100,
      virtualSlots: distribution[n.name] || 0,
    };
  });

  return ok(res, { nodes: enriched, ringSize: lb.ring.ringSize });
});


// POST /nodes — add a new node
// Body: { name: string, weight?: number }
app.post("/nodes", (req, res) => {
  const { name, weight = 1 } = req.body || {};
  if (!name) return bad(res, "Missing required field: name");
  if (weight < 1 || weight > 10)
    return bad(res, "Weight must be between 1 and 10");

  lb.addNode(name, weight);
  return created(res, { message: `Node ${name} added`, name, weight });
});


// DELETE /nodes/:name — remove a node
app.delete("/nodes/:name", (req, res) => {
  const { name } = req.params;
  const existing  = lb.ring.getNodes().map((n) => n.name);
  if (!existing.includes(name))
    return notFound(res, `Node ${name} not found`);

  lb.removeNode(name);
  return ok(res, { message: `Node ${name} removed` });
});


// PATCH /nodes/:name/weight — update a node's weight
app.patch("/nodes/:name/weight", (req, res) => {
  const { name }   = req.params;
  const { weight } = req.body || {};
  if (!weight || weight < 1 || weight > 10)
    return bad(res, "Weight must be between 1 and 10");

  const existing = lb.ring.getNodes().map((n) => n.name);
  if (!existing.includes(name))
    return notFound(res, `Node ${name} not found`);

  lb.addNode(name, weight);   // addNode handles re-registration
  return ok(res, { message: `Node ${name} weight updated to ${weight}`, name, weight });
});


// ═══════════════════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════════════════

// GET /health — all node health statuses
app.get("/health", (req, res) => {
  return ok(res, { health: lb.healthChecker.getAllStatus() });
});

// PATCH /health/:name — force a node healthy/unhealthy (for testing)
// Body: { status: "healthy" | "unhealthy" }
app.patch("/health/:name", (req, res) => {
  const { name }   = req.params;
  const { status } = req.body || {};

  if (!["healthy", "unhealthy"].includes(status))
    return bad(res, 'status must be "healthy" or "unhealthy"');

  lb.healthChecker.forceStatus(name, status);
  return ok(res, { message: `Node ${name} forced to ${status}`, name, status });
});


// ═══════════════════════════════════════════════════════════════════════════
// METRICS
// ═══════════════════════════════════════════════════════════════════════════

// GET /metrics — full metrics snapshot
app.get("/metrics", (req, res) => {
  return ok(res, { metrics: lb.metrics.snapshot() });
});

// POST /metrics/reset — reset counters
app.post("/metrics/reset", (req, res) => {
  lb.metrics.reset();
  return ok(res, { message: "Metrics reset" });
});


// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════════════════

// GET /rate-limiter — stats
app.get("/rate-limiter", (req, res) => {
  return ok(res, { rateLimiter: lb.rateLimiter.stats() });
});

// POST /rate-limiter/reset/:ip — whitelist/reset an IP
app.post("/rate-limiter/reset/:ip", (req, res) => {
  const { ip } = req.params;
  lb.rateLimiter.reset(ip);
  return ok(res, { message: `Rate limit reset for IP ${ip}` });
});


// ═══════════════════════════════════════════════════════════════════════════
// FULL STATUS
// ═══════════════════════════════════════════════════════════════════════════
app.get("/status", (req, res) => {
  return ok(res, lb.getStatus());
});


// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD  (served from public/dashboard.html)
// ═══════════════════════════════════════════════════════════════════════════
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});


// ─── 404 catch-all ────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────
app.use((error, req, res, _next) => {
  logger.error(`Unhandled error: ${error.message}`, { stack: error.stack });
  res.status(500).json({ success: false, error: "Internal server error" });
});


// ─── Start server ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🌐 Server running at http://localhost:${PORT}`);
  logger.info(`📊 Dashboard at    http://localhost:${PORT}/dashboard`);
  logger.info(`📋 API status at   http://localhost:${PORT}/status`);
});

module.exports = app;   // for testing
