require("dotenv").config();

const ConsistentHashRing          = require("./consistentHash");
const { HealthChecker, STATUS }   = require("./healthCheck");
const RateLimiter                 = require("./rateLimiter");
const MetricsCollector            = require("./metrics");
const logger                      = require("./logger");

function generateRandomIP() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join(".");
}

function identifyNode(ip, selectedNode) {
  logger.route(`Incoming IP: ${ip} → Routed to: ${selectedNode}`, {
    ip,
    node: selectedNode,
  });
}

class LoadBalancer {
  constructor(options = {}) {
    const {
      virtualNodes       = parseInt(process.env.VIRTUAL_NODES)       || 150,
      rateLimitWindowMs  = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
      rateLimitMax       = parseInt(process.env.RATE_LIMIT_MAX)       || 10,
      healthIntervalMs   = parseInt(process.env.HEALTH_CHECK_INTERVAL)|| 15_000,
      failThreshold      = parseInt(process.env.HEALTH_FAIL_THRESHOLD) || 2,
      recoverThreshold   = parseInt(process.env.HEALTH_RECOVER_THRESHOLD)|| 1,
    } = options;

    this.ring          = new ConsistentHashRing(virtualNodes);
    this.healthChecker = new HealthChecker(healthIntervalMs, failThreshold, recoverThreshold);
    this.rateLimiter   = new RateLimiter(rateLimitWindowMs, rateLimitMax);
    this.metrics       = new MetricsCollector();

    this.healthChecker.on("nodeDown", (name) => {
      logger.warn(`⚠️  Node ${name} is DOWN — traffic will be re-routed`);
    });
    this.healthChecker.on("nodeRecovered", (name) => {
      logger.info(`🟢 Node ${name} is back ONLINE`);
    });

    this._defaultNodes = [
      { name: "Node-A", weight: 3 },
      { name: "Node-B", weight: 2 },
      { name: "Node-C", weight: 1 },
    ];
    this._defaultNodes.forEach(({ name, weight }) => this.addNode(name, weight));

    logger.info("🚀 LoadBalancer initialised", {
      virtualNodes,
      ringSize: this.ring.ringSize,
      nodes: this._defaultNodes.map((n) => n.name),
    });
  }

  addNode(name, weight = 1) {
    this.ring.addNode(name, weight);
    this.healthChecker.registerNode(name);
    logger.info(`Added node`, { node: name, weight, ringSize: this.ring.ringSize });
  }

  removeNode(name) {
    this.ring.removeNode(name);
    this.healthChecker.deregisterNode(name);
    logger.warn(`Removed node`, { node: name, ringSize: this.ring.ringSize });
  }

  route(ip) {
    const rl = this.rateLimiter.check(ip);
    if (!rl.allowed) {
      this.metrics.recordRateLimited(ip);
      return {
        node: null,
        rateLimited: true,
        fallback: false,
        remaining: rl.remaining,
        resetIn: rl.resetIn,
      };
    }

    const preferredNode = this.ring.getNode(ip);

    if (!preferredNode) {
      logger.error("No nodes available in the ring!");
      return { node: null, rateLimited: false, fallback: false, remaining: rl.remaining };
    }

    let selectedNode = null;
    let isFallback   = false;

    if (this.healthChecker.isHealthy(preferredNode)) {
      selectedNode = preferredNode;
    } else {
      const allNodes = this.ring.getNodes().map((n) => n.name);
      const healthy  = allNodes.filter((n) => this.healthChecker.isHealthy(n));

      if (healthy.length > 0) {
        for (const candidate of healthy) {
          if (candidate !== preferredNode) {
            selectedNode = candidate;
            isFallback   = true;
            break;
          }
        }
        if (!selectedNode) {
          selectedNode = healthy[0];
          isFallback   = true;
        }
      } else {
        logger.error("All nodes are unhealthy! No fallback available.");
        return { node: null, rateLimited: false, fallback: false, remaining: rl.remaining };
      }
    }

    const latencyMs = Math.floor(Math.random() * 50) + 10;

    identifyNode(ip, selectedNode);
    this.metrics.recordRoute(ip, selectedNode, latencyMs, isFallback);

    if (isFallback) {
      logger.warn(`Fallback used for IP ${ip}`, {
        preferred: preferredNode,
        fallback:  selectedNode,
      });
    }

    return {
      node:        selectedNode,
      rateLimited: false,
      fallback:    isFallback,
      preferred:   preferredNode,
      latencyMs,
      remaining:   rl.remaining,
    };
  }

  simulateTraffic(requestCount = 10) {
    logger.info(`Simulating ${requestCount} requests...`);
    const results = [];
    for (let i = 0; i < requestCount; i++) {
      const ip = generateRandomIP();
      const result = this.route(ip);
      results.push({ ip, ...result });
    }
    return results;
  }

  start() {
    this.healthChecker.start();
    logger.info("Health checker started");
  }

  stop() {
    this.healthChecker.stop();
  }

  getStatus() {
    return {
      nodes:       this.ring.getNodes(),
      health:      this.healthChecker.getAllStatus(),
      ringSize:    this.ring.ringSize,
      distribution:this.ring.distribution(),
      rateLimiter: this.rateLimiter.stats(),
      metrics:     this.metrics.snapshot(),
    };
  }
}

module.exports = { LoadBalancer, generateRandomIP };
