# AI Usage Disclosure

This document transparently describes where AI assistance (Claude by Anthropic) was used
and where the work was done independently, as part of the Infollion Intern Task submission.

---

## Where I Used AI Assistance

### 1. Boilerplate & Scaffolding
- Initial project folder structure suggestion
- `package.json` scripts and dependency list
- `setup.sh` bash script for one-shot environment setup
- `.gitignore` and `.env` template

### 2. Dashboard UI (`public/dashboard.html`)
- HTML/CSS layout and dark terminal aesthetic
- Auto-refresh polling logic (JavaScript `setInterval`)
- Responsive grid and card component styling
- Toast notification implementation

### 3. Code Comments & Documentation
- Inline JSDoc-style comments explaining algorithm steps
- `README.md` — formatting, curl examples, and table layout

### 4. Express Boilerplate (`server.js`)
- REST endpoint scaffolding (route handlers, status codes)
- Middleware setup (JSON parser, static files, error handler)
- Helper functions (`ok`, `bad`, `tooMany`, etc.)

---

## Where I Did NOT Use AI — Written & Understood Independently

### 1. Core Algorithm — Consistent Hash Ring (`src/consistentHash.js`)
- Understanding **why** consistent hashing solves the random-routing problem
- The MD5 hash → integer conversion logic
- Virtual node placement on the ring
- Binary search (`lo/hi`) to find the clockwise-nearest node
- Wrap-around logic at ring boundary
- Weight multiplication for proportional distribution

### 2. Load Balancer Logic (`src/loadBalancer.js`)
- Decision to combine consistent hashing + health check + fallback in one `route()` call
- Fallback traversal strategy (walk healthy nodes when preferred is down)
- Order of operations: rate-limit → hash → health → fallback → metrics

### 3. Health Check Design (`src/healthCheck.js`)
- Choosing `EventEmitter` pattern so the LB reacts to node state changes
- `failThreshold` / `recoverThreshold` logic (hysteresis to avoid flapping)
- Rolling uptime percentage calculation

### 4. Rate Limiter (`src/rateLimiter.js`)
- Understanding the token-bucket / sliding-window approach
- Per-IP `windowStart` reset logic
- Lazy cleanup with `setInterval` to prevent memory leaks

### 5. Metrics Collector (`src/metrics.js`)
- Deciding what to track: per-node, per-IP, fallback count, rate-limit count
- Ring-buffer (`recentRequests` with `shift()`) for last-N requests
- `topN` helper for top-IP leaderboard

### 6. Logger (`src/logger.js`)
- Decision to write JSON-lines to file alongside colored console output
- Non-blocking `fs.appendFile` (fire-and-forget) to not slow down routing

### 7. Simulation Script (`simulate.js`)
- Designing the 4 demo scenarios to prove each feature works
- Consistent hashing proof: same IPs across topology change
- Health fallback proof: force-kill node, verify `isFallback: true`
- Rate limit proof: flood single IP, count rejections

---

## Summary

| Area | AI Used? |
|---|---|
| Consistent Hash Ring algorithm | No — written & reasoned independently |
| Health check hysteresis logic | No |
| Rate limiter window/bucket logic | No |
| Fallback routing strategy | No |
| Metrics design decisions | No |
| Simulation demo scenarios | No |
| Dashboard UI & styling | Yes |
| Express boilerplate & routes | Partially |
| README & documentation | Yes |
| Setup script | Yes |

---

*Submitted honestly as part of Infollion Software Developer Intern Task 3.*