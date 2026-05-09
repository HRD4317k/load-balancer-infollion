const logger = require("./logger");

class RateLimiter {
  constructor(windowMs = 60_000, maxRequests = 10) {
    this.windowMs    = windowMs;
    this.maxRequests = maxRequests;
    this.buckets     = new Map();
    this.blockedIPs  = new Set();

    setInterval(() => this._cleanup(), 5 * 60 * 1000).unref();
  }

  _cleanup() {
    const now    = Date.now();
    let removed  = 0;
    for (const [ip, bucket] of this.buckets) {
      if (now - bucket.windowStart > this.windowMs) {
        this.buckets.delete(ip);
        removed++;
      }
    }
    if (removed > 0) {
      logger.info(`Rate limiter: cleaned ${removed} stale buckets`);
    }
  }

  check(ip) {
    const now    = Date.now();
    let bucket   = this.buckets.get(ip);

    if (!bucket || now - bucket.windowStart > this.windowMs) {
      bucket = { count: 0, windowStart: now };
      this.buckets.set(ip, bucket);
    }

    const remaining = this.maxRequests - bucket.count;
    const resetIn   = this.windowMs - (now - bucket.windowStart);

    if (bucket.count >= this.maxRequests) {
      this.blockedIPs.add(ip);
      logger.rate(`Rate limit exceeded for IP ${ip}`, {
        ip,
        count: bucket.count,
        limit: this.maxRequests,
        resetIn: `${Math.ceil(resetIn / 1000)}s`,
      });
      return { allowed: false, remaining: 0, resetIn };
    }

    bucket.count++;
    return { allowed: true, remaining: remaining - 1, resetIn };
  }

  reset(ip) {
    this.buckets.delete(ip);
    this.blockedIPs.delete(ip);
  }

  stats() {
    return {
      trackedIPs:   this.buckets.size,
      blockedTotal: this.blockedIPs.size,
      windowMs:     this.windowMs,
      maxRequests:  this.maxRequests,
    };
  }
}

module.exports = RateLimiter;
