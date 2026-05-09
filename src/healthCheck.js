/**
 * healthCheck.js
 *
 * Simulates periodic health checks for each node.
 *
 * In production you'd do real HTTP pings; here we simulate
 * failure/recovery using configurable thresholds and random
 * failure injection — making demos realistic without real servers.
 *
 * Features:
 *   - Each node has: status (healthy|unhealthy), failCount, successCount, latency
 *   - Marks a node UNHEALTHY after FAIL_THRESHOLD consecutive failures
 *   - Recovers a node after RECOVER_THRESHOLD consecutive successes
 *   - Emits events so the load balancer can re-route around dead nodes
 */

const EventEmitter = require("events");
const logger       = require("./logger");

const STATUS = { HEALTHY: "healthy", UNHEALTHY: "unhealthy" };

class HealthChecker extends EventEmitter {
  /**
   * @param {number} intervalMs        - How often to run checks (ms)
   * @param {number} failThreshold     - Consecutive failures before marking unhealthy
   * @param {number} recoverThreshold  - Consecutive successes before marking healthy
   */
  constructor(intervalMs = 15_000, failThreshold = 2, recoverThreshold = 1) {
    super();
    this.intervalMs       = intervalMs;
    this.failThreshold    = failThreshold;
    this.recoverThreshold = recoverThreshold;
    this.nodes            = new Map();  // name → NodeHealth
    this._timer           = null;
  }

  /** Register a node for monitoring */
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
        uptime:       100,  // percentage
      });
      logger.health(`Registered node for health checks`, { node: name });
    }
  }

  /** Deregister a node */
  deregisterNode(name) {
    this.nodes.delete(name);
    logger.health(`Deregistered node from health checks`, { node: name });
  }

  /**
   * Simulate a health check for one node.
   * Inject random failures at ~15% probability to make the demo interesting.
   */
  _checkNode(nodeHealth) {
    const t0         = Date.now();
    // Simulate: 85% healthy, 15% fail (override with env SIMULATE_FAILURE=true for 50%)
    const failRate   = process.env.SIMULATE_FAILURE === "true" ? 0.5 : 0.15;
    const ok         = Math.random() > failRate;
    const latency    = Math.floor(Math.random() * 80) + 10;  // 10–90 ms simulated

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

    // Update rolling uptime estimate
    const healthyChecks = nodeHealth.totalChecks - nodeHealth.failCount;
    nodeHealth.uptime = parseFloat(
      ((healthyChecks / nodeHealth.totalChecks) * 100).toFixed(1)
    );
  }

  /** Run checks for all registered nodes */
  _runAll() {
    for (const nodeHealth of this.nodes.values()) {
      this._checkNode(nodeHealth);
    }
  }

  /** Start the periodic health check loop */
  start() {
    if (this._timer) return;
    logger.health(`Health checker started`, {
      intervalMs: this.intervalMs,
      failThreshold: this.failThreshold,
    });
    this._runAll();  // immediate first check
    this._timer = setInterval(() => this._runAll(), this.intervalMs);
    this._timer.unref();  // don't block process exit
  }

  /** Stop the loop */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      logger.health("Health checker stopped");
    }
  }

  /** Check if a named node is currently healthy */
  isHealthy(name) {
    const n = this.nodes.get(name);
    return n ? n.status === STATUS.HEALTHY : false;
  }

  /** Return snapshot of all node health records */
  getAllStatus() {
    return Array.from(this.nodes.values()).map((n) => ({ ...n }));
  }

  /** Manually force a node's status (useful for testing) */
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
