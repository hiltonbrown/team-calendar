#!/usr/bin/env bash
# scripts/dev-doctor.sh
# Development environment diagnostic tool for Team Calendar under WSL 2 / Linux.
# Read-only, bounded, safe to run anytime. Exits 0 if healthy, 1 if issues detected.

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ISSUES=0

warn() {
  echo -e "  ${YELLOW}▲ [WARN]${NC} $1"
  ISSUES=$((ISSUES + 1))
}

fail() {
  echo -e "  ${RED}✗ [FAIL]${NC} $1"
  ISSUES=$((ISSUES + 1))
}

ok() {
  echo -e "  ${GREEN}✓ [OK]${NC} $1"
}

info() {
  echo -e "  ${BLUE}ℹ [INFO]${NC} $1"
}

section() {
  echo -e "\n${BOLD}$1${NC}"
  echo "------------------------------------------------------------"
}

echo -e "${BOLD}Team Calendar Development Diagnostics${NC}"
echo "Running environment and health audit..."

# 1. System & WSL Architecture
section "1. Platform & Kernel"
ARCH=$(uname -m)
KERNEL=$(uname -r)
info "Architecture: $ARCH"
info "Kernel: $KERNEL"

if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  info "Distribution: ${PRETTY_NAME:-$NAME}"
fi

if grep -qi microsoft /proc/version; then
  ok "WSL 2 environment detected"
else
  info "Native Linux or container environment"
fi

# 2. Tooling & Runtimes
section "2. Runtime Versions"
if command -v bun >/dev/null 2>&1; then
  BUN_VER=$(bun --version)
  ok "Bun: v$BUN_VER"
else
  fail "Bun is not installed or not in PATH"
fi

if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node --version)
  ok "Node.js: $NODE_VER"
else
  fail "Node.js is not installed or not in PATH"
fi

if command -v git >/dev/null 2>&1; then
  ok "Git: $(git --version)"
else
  fail "Git is not installed"
fi

# 3. Memory & System Pressure
section "3. Memory & Pressure Capacity"
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
AVAIL_MEM_KB=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
TOTAL_MEM_MB=$((TOTAL_MEM_KB / 1024))
AVAIL_MEM_MB=$((AVAIL_MEM_KB / 1024))

info "Total Memory: ${TOTAL_MEM_MB} MiB"
info "Available Memory: ${AVAIL_MEM_MB} MiB"

if [[ $AVAIL_MEM_MB -lt 1024 ]]; then
  fail "Critically low available memory (<1 GiB available: ${AVAIL_MEM_MB} MiB). OOM risk!"
elif [[ $AVAIL_MEM_MB -lt 2048 ]]; then
  warn "Low available memory (<2 GiB available: ${AVAIL_MEM_MB} MiB)."
else
  ok "Available memory is sufficient (${AVAIL_MEM_MB} MiB)"
fi

SWAP_TOTAL_KB=$(grep SwapTotal /proc/meminfo | awk '{print $2}')
SWAP_FREE_KB=$(grep SwapFree /proc/meminfo | awk '{print $2}')
if [[ $SWAP_TOTAL_KB -gt 0 ]]; then
  SWAP_USED_MB=$(((SWAP_TOTAL_KB - SWAP_FREE_KB) / 1024))
  SWAP_TOTAL_MB=$((SWAP_TOTAL_KB / 1024))
  info "Swap: ${SWAP_USED_MB} MiB used / ${SWAP_TOTAL_MB} MiB total"
  if [[ $SWAP_USED_MB -gt 2048 ]]; then
    warn "High swap usage (${SWAP_USED_MB} MiB). Consider investigating rogue compiler workers."
  fi
else
  warn "No swap configured. WSL may freeze abruptly under memory pressure."
fi

if [[ -f /proc/pressure/memory ]]; then
  PSI_SOME=$(head -n 1 /proc/pressure/memory)
  info "Memory Pressure (PSI): $PSI_SOME"
  PSI_AVG10=$(echo "$PSI_SOME" | grep -o 'avg10=[0-9.]*' | cut -d= -f2)
  if (( $(echo "$PSI_AVG10 > 40.0" | bc -l 2>/dev/null || echo 0) )); then
    warn "Elevated memory stall pressure: avg10 = $PSI_AVG10"
  else
    ok "Memory pressure stall index normal (avg10 = $PSI_AVG10)"
  fi
fi

# 4. Filesystem
section "4. Filesystem Capacity"
DISK_AVAIL_KB=$(df -k . | tail -1 | awk '{print $4}')
DISK_AVAIL_GB=$((DISK_AVAIL_KB / 1024 / 1024))
if [[ $DISK_AVAIL_GB -lt 5 ]]; then
  fail "Critically low disk space (<5 GB available: ${DISK_AVAIL_GB} GB)"
elif [[ $DISK_AVAIL_GB -lt 15 ]]; then
  warn "Low disk space (<15 GB available: ${DISK_AVAIL_GB} GB)"
else
  ok "Disk space available: ${DISK_AVAIL_GB} GB"
fi

# 5. Monorepo Workspace Symlinks & Recursion Loops
section "5. Monorepo Workspace Integrity"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ORPHANS=$(node -e '
const fs = require("fs");
const path = require("path");
const dirs = ["apps/app", "apps/api", "apps/web", "apps/email", ...fs.readdirSync("packages").map(p => "packages/" + p)];
let found = 0;
for (const dir of dirs) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const repoModules = path.join(dir, "node_modules", "@repo");
  if (fs.existsSync(repoModules)) {
    for (const sym of fs.readdirSync(repoModules)) {
      if (!deps["@repo/" + sym]) {
        console.log(`Unregistered symlink: ${path.join(repoModules, sym)}`);
        found++;
      }
    }
  }
}
process.exit(found > 0 ? 1 : 0);
' 2>&1 || true)

if [[ -n "$ORPHANS" ]]; then
  fail "Orphan workspace symlinks detected in node_modules/@repo:\n$ORPHANS"
else
  ok "No orphan workspace package symlinks in node_modules/@repo"
fi

# Check design-system globals.css @source
if grep -q '@source "../\*\*/\*\.{ts,tsx}"' packages/design-system/styles/globals.css 2>/dev/null; then
  fail "packages/design-system/styles/globals.css uses unbounded @source '../**/*.{ts,tsx}' which crawls node_modules"
else
  ok "Tailwind CSS @source scoping in design-system is bounded"
fi

# 6. Development Ports & Active Processes
section "6. Development Ports & Active Processes"
DEV_PORTS=(3000 3001 3002 3003 8288)
for PORT in "${DEV_PORTS[@]}"; do
  PID=$(ss -tulpn "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -n1 || true)
  if [[ -n "$PID" ]]; then
    CMD=$(ps -p "$PID" -o comm= 2>/dev/null || echo "unknown")
    info "Port $PORT is occupied by PID $PID ($CMD)"
  else
    ok "Port $PORT is free"
  fi
done

# 7. Environment Variables & Transports (No Secrets)
section "7. Environment Transports"
if [[ -f apps/api/.env.local ]]; then
  HAS_TOKEN=$(grep -E '^RESEND_TOKEN=' apps/api/.env.local 2>/dev/null || true)
  HAS_FROM=$(grep -E '^RESEND_FROM=' apps/api/.env.local 2>/dev/null || true)
  if [[ -n "$HAS_TOKEN" && -z "$HAS_FROM" ]]; then
    fail "apps/api/.env.local has RESEND_TOKEN configured but lacks RESEND_FROM. This causes Inngest cron email errors."
  elif [[ -n "$HAS_TOKEN" && -n "$HAS_FROM" ]]; then
    ok "Resend email transport configuration is complete in apps/api/.env.local"
  else
    info "Resend email transport not configured in apps/api/.env.local (development mock mode)"
  fi
else
  info "apps/api/.env.local not found (using default environment)"
fi

# 8. Summary
section "Diagnostic Summary"
if [[ $ISSUES -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}✓ All checks passed! Development environment is healthy.${NC}\n"
  exit 0
else
  echo -e "${RED}${BOLD}▲ $ISSUES issue(s) or warning(s) detected.${NC} Review findings above.\n"
  exit 1
fi
