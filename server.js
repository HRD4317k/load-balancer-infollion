require("dotenv").config();

const express = require("express");
const path    = require("path");
const logger  = require("./src/logger");
const { LoadBalancer, generateRandomIP } = require("./src/loadBalancer");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const lb = new LoadBalancer();
lb.start();

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

const respond = (res, status, data) => res.status(status).json(data);
const ok      = (res, data)          => respond(res, 200, { success: true, ...data });
const created = (res, data)          => respond(res, 201, { success: true, ...data });
const bad     = (res, msg)           => respond(res, 400, { success: false, error: msg });
const notFound= (res, msg)           => respond(res, 404, { success: false, error: msg });
const tooMany = (res, data)          => respond(res, 429, { success: false, ...data });
const err     = (res, msg)           => respond(res, 500, { success: false, error: msg });

app.post("/route", (req, res) => {
  const ip = req.body?.ip || generateRandomIP();

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

app.post("/simulate", (req, res) => {
  const count   = Math.min(parseInt(req.body?.count) || 10, 100);
  const results = lb.simulateTraffic(count);
  return ok(res, { requested: count, results });
});

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

app.post("/nodes", (req, res) => {
  const { name, weight = 1 } = req.body || {};
  if (!name) return bad(res, "Missing required field: name");
  if (weight < 1 || weight > 10)
    return bad(res, "Weight must be between 1 and 10");

  lb.addNode(name, weight);
  return created(res, { message: `Node ${name} added`, name, weight });
});

app.delete("/nodes/:name", (req, res) => {
  const { name } = req.params;
  const existing  = lb.ring.getNodes().map((n) => n.name);
  if (!existing.includes(name))
    return notFound(res, `Node ${name} not found`);

  lb.removeNode(name);
  return ok(res, { message: `Node ${name} removed` });
});

app.patch("/nodes/:name/weight", (req, res) => {
  const { name }   = req.params;
  const { weight } = req.body || {};
  if (!weight || weight < 1 || weight > 10)
    return bad(res, "Weight must be between 1 and 10");

  const existing = lb.ring.getNodes().map((n) => n.name);
  if (!existing.includes(name))
    return notFound(res, `Node ${name} not found`);

  lb.addNode(name, weight);
  return ok(res, { message: `Node ${name} weight updated to ${weight}`, name, weight });
});

app.get("/health", (req, res) => {
  return ok(res, { health: lb.healthChecker.getAllStatus() });
});

app.patch("/health/:name", (req, res) => {
  const { name }   = req.params;
  const { status } = req.body || {};

  if (!["healthy", "unhealthy"].includes(status))
    return bad(res, 'status must be "healthy" or "unhealthy"');

  lb.healthChecker.forceStatus(name, status);
  return ok(res, { message: `Node ${name} forced to ${status}`, name, status });
});

app.get("/metrics", (req, res) => {
  return ok(res, { metrics: lb.metrics.snapshot() });
});

app.post("/metrics/reset", (req, res) => {
  lb.metrics.reset();
  return ok(res, { message: "Metrics reset" });
});

app.get("/rate-limiter", (req, res) => {
  return ok(res, { rateLimiter: lb.rateLimiter.stats() });
});

app.post("/rate-limiter/reset/:ip", (req, res) => {
  const { ip } = req.params;
  lb.rateLimiter.reset(ip);
  return ok(res, { message: `Rate limit reset for IP ${ip}` });
});

app.get("/status", (req, res) => {
  return ok(res, lb.getStatus());
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found" });
});

app.use((error, req, res, _next) => {
  logger.error(`Unhandled error: ${error.message}`, { stack: error.stack });
  res.status(500).json({ success: false, error: "Internal server error" });
});

app.listen(PORT, () => {
  logger.info(`🌐 Server running at http://localhost:${PORT}`);
  logger.info(`📊 Dashboard at    http://localhost:${PORT}/dashboard`);
  logger.info(`📋 API status at   http://localhost:${PORT}/status`);
});

module.exports = app;
