const EventEmitter = require("events");
const logger       = require("./logger");

const STATUS = { HEALTHY: "healthy", UNHEALTHY: "unhealthy" };

class HealthChecker extends EventEmitter {
  constructor(intervalMs = 15_000, failThreshold = 2, recoverThreshold = 1) {
    super();
    this.intervalMs       = intervalMs;
    this.failThreshold    = failThreshold;
    this.recoverThreshold = recoverThreshold;
    this.nodes            = new Map();
    this._timer           = null;
  }

  registerNode(name) {
    if (!this.nodes.has(name)) {
      this.nodes.set(name, {
        name,
        status:       STATUS.HEALTHY,
        failCount:    0,
        successCount: 0,
        lastChecked:  null,
        latencyMs:    0,
        totalChecks:  0,
        uptime:       100,
      });
      logger.health(`Registered node for health checks`, { node: name });
    }
  }

  deregisterNode(name) {
    this.nodes.delete(name);
    logger.health(`Deregistered node from health checks`, { node: name });
  }

  _checkNode(nodeHealth) {
    const t0         = Date.now();
    const failRate   = process.env.SIMULATE_FAILURE === "true" ? 0.5 : 0.15;
    const ok         = Math.random() > failRate;
    const latency    = Math.floor(Math.random() * 80) + 10;

    nodeHealth.latencyMs   = latency;
    nodeHealth.lastChecked = new Date().toISOString();
    nodeHealth.totalChecks++;

    if (ok) {
      nodeHealth.failCount    = 0;
      nodeHealth.successCount++;

      if (
        nodeHealth.status === STATUS.UNHEALTHY &&
        nodeHealth.successCount >= this.recoverThreshold
      ) {
        nodeHealth.status = STATUS.HEALTHY;
        logger.health(`✅ Node RECOVERED`, { node: nodeHealth.name, latencyMs: latency });
        this.emit("nodeRecovered", nodeHealth.name);
      }
    } else {
      nodeHealth.successCount = 0;
      nodeHealth.failCount++;

      if (nodeHealth.failCount >= this.failThreshold) {
        if (nodeHealth.status === STATUS.HEALTHY) {
          nodeHealth.status = STATUS.UNHEALTHY;
          logger.health(`❌ Node UNHEALTHY`, {
            node:       nodeHealth.name,
            failCount:  nodeHealth.failCount,
          });
          this.emit("nodeDown", nodeHealth.name);
        }
      }
    }

    const healthyChecks = nodeHealth.totalChecks - nodeHealth.failCount;
    nodeHealth.uptime = parseFloat(
      ((healthyChecks / nodeHealth.totalChecks) * 100).toFixed(1)
    );
  }

  _runAll() {
    for (const nodeHealth of this.nodes.values()) {
      this._checkNode(nodeHealth);
    }
  }

  start() {
    if (this._timer) return;
    logger.health(`Health checker started`, {
      intervalMs: this.intervalMs,
      failThreshold: this.failThreshold,
    });
    this._runAll();
    this._timer = setInterval(() => this._runAll(), this.intervalMs);
    this._timer.unref();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      logger.health("Health checker stopped");
    }
  }

  isHealthy(name) {
    const n = this.nodes.get(name);
    return n ? n.status === STATUS.HEALTHY : false;
  }

  getAllStatus() {
    return Array.from(this.nodes.values()).map((n) => ({ ...n }));
  }

  forceStatus(name, status) {
    const n = this.nodes.get(name);
    if (n) {
      n.status     = status;
      n.failCount  = status === STATUS.UNHEALTHY ? this.failThreshold : 0;
      n.successCount = 0;
      logger.health(`Force-set node status`, { node: name, status });
    }
  }
}

module.exports = { HealthChecker, STATUS };
