/**
 * rateLimiter.js
 *
 * Token-bucket style rate limiter (in-memory, per IP).
 *
 * HOW IT WORKS:
 *   - Each IP gets a "bucket" tracking {count, windowStart}
 *   - If count < MAX within the rolling window → allowed
 *   - If count >= MAX → rate-limited; returns remaining wait time
 *   - Expired windows are lazily cleaned up to prevent memory leaks
 */

const logger = require("./logger");

class RateLimiter {
  /**
   * @param {number} windowMs   - Time window in milliseconds (default: 60 000 = 1 min)
   * @param {number} maxRequests - Max allowed requests per IP per window (default: 10)
   */
  constructor(windowMs = 60_000, maxRequests = 10) {
    this.windowMs    = windowMs;
    this.maxRequests = maxRequests;
    this.buckets     = new Map();   // ip → { count, windowStart }
    this.blockedIPs  = new Set();   // for metrics

    // Cleanup stale buckets every 5 minutes
    setInterval(() => this._cleanup(), 5 * 60 * 1000).unref();
  }

  // ---------- PRIVATE ----------

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

  // ---------- PUBLIC ----------

  /**
   * Check if an IP is allowed to make a request.
   * @param {string} ip
   * @returns {{ allowed: boolean, remaining: number, resetIn: number }}
   */
  check(ip) {
    const now    = Date.now();
    let bucket   = this.buckets.get(ip);

    // New or expired bucket → fresh window
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

  /** Manually whitelist/reset an IP */
  reset(ip) {
    this.buckets.delete(ip);
    this.blockedIPs.delete(ip);
  }

  /** Return rate limiter stats */
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
