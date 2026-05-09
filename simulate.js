/**
 * simulate.js
 *
 * Standalone simulation script — reproduces the original task spec
 * (generateRandomIP + identifyNode + LoadBalancer) while showcasing
 * all new features: consistent hashing, weighted routing, health checks.
 *
 * Run with:   node simulate.js
 */

require("dotenv").config();

const { LoadBalancer, generateRandomIP } = require("./src/loadBalancer");
const logger = require("./src/logger");

// ─── Demo: consistent hashing verification ───────────────────────────────
function demoConsistentHashing(lb) {
  logger.info("\n━━━ DEMO 1: Consistent Hashing ━━━");
  logger.info("Same IP should always hit the same node, even after topology changes.\n");

  const testIPs = [
    generateRandomIP(),
    generateRandomIP(),
    generateRandomIP(),
  ];

  // First pass
  logger.info("Pass 1 (3 nodes — A, B, C):");
  const pass1 = {};
  for (const ip of testIPs) {
    const { node } = lb.route(ip);
    pass1[ip] = node;
  }

  // Add a new node
  lb.addNode("Node-D", 1);
  logger.info("\nPass 2 (4 nodes — A, B, C, D): same IPs:");
  const pass2 = {};
  for (const ip of testIPs) {
    const { node } = lb.route(ip);
    pass2[ip] = node;
  }

  logger.info("\nSummary:");
  for (const ip of testIPs) {
    const changed = pass1[ip] !== pass2[ip];
    logger.info(`  ${ip} → ${pass1[ip]} → ${pass2[ip]} ${changed ? "⚠️ (re-mapped)" : "✅ (stable)"}`);
  }

  lb.removeNode("Node-D");
}

// ─── Demo: health check fallback ─────────────────────────────────────────
function demoHealthFallback(lb) {
  logger.info("\n━━━ DEMO 2: Health Check Fallback ━━━");
  logger.info("Take Node-A offline; traffic should automatically re-route.\n");

  lb.healthChecker.forceStatus("Node-A", "unhealthy");

  for (let i = 0; i < 5; i++) {
    const ip = generateRandomIP();
    const { node, fallback, preferred } = lb.route(ip);
    logger.info(`  ${ip} → preferred: ${preferred}, actual: ${node}${fallback ? " [FALLBACK]" : ""}`);
  }

  lb.healthChecker.forceStatus("Node-A", "healthy");
  logger.info("\nNode-A restored.");
}

// ─── Demo: rate limiting ──────────────────────────────────────────────────
function demoRateLimit(lb) {
  logger.info("\n━━━ DEMO 3: Rate Limiting ━━━");
  logger.info("Flood a single IP beyond the limit.\n");

  const targetIP = "203.0.113.42";
  for (let i = 0; i < 14; i++) {
    const result = lb.route(targetIP);
    if (result.rateLimited) {
      logger.info(`  Request #${i + 1}: ❌ RATE LIMITED (reset in ${Math.ceil(result.resetIn / 1000)}s)`);
    } else {
      logger.info(`  Request #${i + 1}: ✅ Routed to ${result.node} (${result.remaining} left)`);
    }
  }
}

// ─── Main simulation (original task spec) ─────────────────────────────────
function simulateTraffic(lb, requestCount = 10) {
  logger.info(`\n━━━ Simulating ${requestCount} random requests (original task) ━━━`);
  for (let i = 0; i < requestCount; i++) {
    const ip = generateRandomIP();
    lb.route(ip);
  }
}

// ─── Print final metrics ──────────────────────────────────────────────────
function printMetrics(lb) {
  logger.info("\n━━━ Final Metrics ━━━");
  const snap = lb.metrics.snapshot();
  logger.info(`  Total requests   : ${snap.totalRequests}`);
  logger.info(`  Rate limited     : ${snap.rateLimitedCount}`);
  logger.info(`  Fallback used    : ${snap.fallbackCount}`);
  logger.info(`  Unique IPs seen  : ${snap.uniqueIPs}`);
  logger.info("  Per-node distribution:");
  for (const n of snap.nodeStats) {
    logger.info(`    ${n.node}: ${n.requests} requests (${n.percentage}%) — avg ${n.avgLatencyMs}ms`);
  }
}


// ─── ENTRY POINT ─────────────────────────────────────────────────────────
(function main() {
  logger.info("═══════════════════════════════════════════════");
  logger.info("  Infollion Load Balancer — Full Demo");
  logger.info("═══════════════════════════════════════════════");

  const lb = new LoadBalancer();
  // Don't start health checker auto-timer in CLI demo (keep it clean)
  // lb.start();

  simulateTraffic(lb, 10);   // ← original task spec
  demoConsistentHashing(lb);
  demoHealthFallback(lb);
  demoRateLimit(lb);
  printMetrics(lb);

  logger.info("\n✅ Simulation complete. Run `npm start` for the full HTTP API + dashboard.\n");
  process.exit(0);
})();
