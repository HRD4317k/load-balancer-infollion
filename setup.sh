#!/usr/bin/env bash
# setup.sh  — One-shot setup for the Load Balancer project
# Usage: chmod +x setup.sh && ./setup.sh

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'   # No Color

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   Infollion Load Balancer — Setup Script     ║"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Check Node.js ──────────────────────────────────────────────────────
echo -e "${CYAN}[1/5] Checking Node.js version...${NC}"
if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ Node.js not found. Install from https://nodejs.org (v16+)${NC}"
  exit 1
fi
NODE_VER=$(node -v)
echo -e "${GREEN}✓ Node.js ${NODE_VER} found${NC}"

# ── 2. Check npm ──────────────────────────────────────────────────────────
echo -e "${CYAN}[2/5] Checking npm...${NC}"
NPM_VER=$(npm -v)
echo -e "${GREEN}✓ npm v${NPM_VER} found${NC}"

# ── 3. Install dependencies ───────────────────────────────────────────────
echo -e "${CYAN}[3/5] Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# ── 4. Create .env if missing ─────────────────────────────────────────────
echo -e "${CYAN}[4/5] Checking .env config...${NC}"
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || cat > .env << 'EOF'
PORT=3000
VIRTUAL_NODES=150
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=10
HEALTH_CHECK_INTERVAL=15000
HEALTH_FAIL_THRESHOLD=2
HEALTH_RECOVER_THRESHOLD=1
LOG_LEVEL=info
EOF
  echo -e "${GREEN}✓ .env created from defaults${NC}"
else
  echo -e "${GREEN}✓ .env already exists${NC}"
fi

# ── 5. Create logs directory ──────────────────────────────────────────────
echo -e "${CYAN}[5/5] Ensuring logs/ directory exists...${NC}"
mkdir -p logs
echo -e "${GREEN}✓ logs/ directory ready${NC}"

echo ""
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅  Setup complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${YELLOW}Start the server:${NC}   npm start"
echo -e "  ${YELLOW}Development mode:${NC}   npm run dev"
echo -e "  ${YELLOW}Run CLI demo:${NC}       npm run simulate"
echo ""
echo -e "  ${CYAN}Dashboard:${NC}   http://localhost:3000/dashboard"
echo -e "  ${CYAN}API status:${NC}  http://localhost:3000/status"
echo ""
