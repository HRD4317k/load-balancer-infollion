# ⚡ Load Balancer — Infollion Intern Task

> Advanced load balancer built with Node.js/Express featuring **Consistent Hashing**, **Weighted Routing**, **Health Checks**, **Rate Limiting**, and a live **Metrics Dashboard**.

---

## 🚀 Quick Start (3 commands)

```bash
git clone <your-repo-url>
cd load-balancer
chmod +x setup.sh && ./setup.sh
npm start
```

Then open: **http://localhost:3000/dashboard**

---

## 🏗️ Architecture

```
load-balancer/
├── server.js
├── simulate.js
├── src/
│   ├── loadBalancer.js
│   ├── consistentHash.js
│   ├── healthCheck.js
│   ├── rateLimiter.js
│   ├── metrics.js
│   └── logger.js
├── public/
│   └── dashboard.html
├── logs/
│   └── requests.log
├── .env
├── setup.sh
└── package.json
```

---

## ✅ Features Implemented

### Core (Required)
| Feature | Implementation |
|---|---|
| Replace random selection | **Consistent Hashing** with virtual nodes |
| Same IP → same node | MD5 hash ring; stable across topology changes |
| Logging | Chalk-colored console + JSON log file |

### Bonus (All implemented)
| Bonus Feature | Details |
|---|---|
| Health Checks | Periodic checks with fail/recover thresholds; auto-reroutes around dead nodes |
| Weighted Routing | Higher-weight nodes get proportionally more virtual ring slots → more traffic |
| Metrics Dashboard | Live HTML dashboard with auto-refresh every 5s |
| Rate Limiting | Per-IP token bucket; configurable window + max requests |

---

## 🧠 Algorithm: Consistent Hashing

### Why not random?
Random routing breaks **session affinity** — the same IP hits a different node every time.

### How Consistent Hashing works

```
Ring (0 ──────────────────────────────── 2³²)
        [Node-A][Node-B][Node-A][Node-C][Node-A][Node-B][Node-C]
                                 ↑
                      IP hash lands here → Node-A
```

1. Each node gets `VIRTUAL_NODES × weight` positions on a 0→2³² ring
2. To route an IP: hash it → walk clockwise → land on nearest position
3. **Same IP always hits same node** (deterministic)
4. Adding/removing a node only affects ~1/N of IPs (not everything re-shuffles)
5. Higher weight = more virtual positions = more traffic share

---

## ⚙️ Configuration (.env)

```env
PORT=3000

VIRTUAL_NODES=150

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=10

HEALTH_CHECK_INTERVAL=15000
HEALTH_FAIL_THRESHOLD=2
HEALTH_RECOVER_THRESHOLD=1

SIMULATE_FAILURE=false
```

---

## 🔌 REST API Reference

### Routing
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/route` | Route a request. Body: `{ "ip": "1.2.3.4" }` (optional; auto-generates if omitted) |
| `POST` | `/simulate` | Simulate traffic. Body: `{ "count": 10 }` |

### Nodes
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/nodes` | List all nodes with health + distribution |
| `POST` | `/nodes` | Add a node. Body: `{ "name": "Node-D", "weight": 2 }` |
| `DELETE` | `/nodes/:name` | Remove a node |
| `PATCH` | `/nodes/:name/weight` | Update weight. Body: `{ "weight": 3 }` |

### Health
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | All node health statuses |
| `PATCH` | `/health/:name` | Force status. Body: `{ "status": "unhealthy" }` |

### Metrics & Rate Limiter
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/metrics` | Full metrics snapshot |
| `POST` | `/metrics/reset` | Reset all counters |
| `GET` | `/rate-limiter` | Rate limiter stats |
| `POST` | `/rate-limiter/reset/:ip` | Whitelist/reset an IP |
| `GET` | `/status` | Full system status |
| `GET` | `/dashboard` | Live HTML dashboard |

---

## 🧪 Quick Postman / curl Demo

```bash
curl -X POST http://localhost:3000/route

curl -X POST http://localhost:3000/route \
  -H "Content-Type: application/json" \
  -d '{"ip":"192.168.1.100"}'

curl -X POST http://localhost:3000/route \
  -H "Content-Type: application/json" \
  -d '{"ip":"192.168.1.100"}'

curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -d '{"count":20}'

curl -X PATCH http://localhost:3000/health/Node-A \
  -H "Content-Type: application/json" \
  -d '{"status":"unhealthy"}'

curl -X POST http://localhost:3000/route

curl -X POST http://localhost:3000/nodes \
  -H "Content-Type: application/json" \
  -d '{"name":"Node-D","weight":5}'

curl http://localhost:3000/metrics | python3 -m json.tool

for i in {1..12}; do
  curl -X POST http://localhost:3000/route \
    -H "Content-Type: application/json" \
    -d '{"ip":"10.0.0.1"}'
done
```

---

## 🎬 CLI Demo

```bash
npm run simulate
```

Runs 4 demos in sequence:
1. **Basic routing** — original task spec
2. **Consistent hashing** — verifies same IP → same node across topology changes
3. **Health fallback** — kills Node-A, shows automatic re-routing
4. **Rate limiting** — floods one IP, shows block after threshold

---

## 📊 Default Nodes & Weights

| Node | Weight | Expected Traffic Share |
|---|---|---|
| Node-A | 3 | ~50% |
| Node-B | 2 | ~33% |
| Node-C | 1 | ~17% |

---

## 🔧 Development

```bash
npm run dev
npm start
npm run simulate
```

---

## 📁 Log File

All requests are written to `logs/requests.log` as JSON lines:

```json
{"ts":"2024-01-15T10:30:00.000Z","level":"ROUTE","message":"Incoming IP: 1.2.3.4 → Routed to: Node-A","ip":"1.2.3.4","node":"Node-A"}
```

---


