const logger = require("./logger");

class MetricsCollector {
  constructor() {
    this.startTime         = Date.now();
    this.totalRequests     = 0;
    this.rateLimitedCount  = 0;
    this.fallbackCount     = 0;
    this.perNode          = {};
    this.perIP            = {};
    this.recentRequests   = [];
    this.MAX_RECENT        = 50;
  }

  recordRoute(ip, node, latencyMs = 0, isFallback = false) {
    this.totalRequests++;

    if (!this.perNode[node]) {
      this.perNode[node] = { count: 0, totalLatency: 0 };
    }
    this.perNode[node].count++;
    this.perNode[node].totalLatency += latencyMs;

    this.perIP[ip] = (this.perIP[ip] || 0) + 1;

    if (isFallback) this.fallbackCount++;

    this.recentRequests.push({
      ts:         new Date().toISOString(),
      ip,
      node,
      latencyMs,
      isFallback,
    });
    if (this.recentRequests.length > this.MAX_RECENT) {
      this.recentRequests.shift();
    }
  }

  recordRateLimited(ip) {
    this.rateLimitedCount++;
    logger.metrics("Rate limited request recorded", { ip });
  }

  snapshot() {
    const uptimeSec  = Math.floor((Date.now() - this.startTime) / 1000);
    const nodeStats  = Object.entries(this.perNode).map(([name, d]) => ({
      node:        name,
      requests:    d.count,
      avgLatencyMs: d.count ? Math.round(d.totalLatency / d.count) : 0,
      percentage:   this.totalRequests
        ? parseFloat(((d.count / this.totalRequests) * 100).toFixed(1))
        : 0,
    }));

    return {
      uptime: {
        seconds: uptimeSec,
        human:   this._formatUptime(uptimeSec),
      },
      totalRequests:    this.totalRequests,
      rateLimitedCount: this.rateLimitedCount,
      fallbackCount:    this.fallbackCount,
      uniqueIPs:        Object.keys(this.perIP).length,
      nodeStats,
      topIPs:           this._topN(this.perIP, 5),
      recentRequests:   [...this.recentRequests].reverse(),
    };
  }

  reset() {
    this.totalRequests    = 0;
    this.rateLimitedCount = 0;
    this.fallbackCount    = 0;
    this.perNode          = {};
    this.perIP            = {};
    this.recentRequests   = [];
    logger.metrics("Metrics reset");
  }

  _topN(map, n) {
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, count]) => ({ key, count }));
  }

  _formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  }
}

module.exports = MetricsCollector;
