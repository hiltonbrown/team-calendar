#!/usr/bin/env bash
# scripts/dev-profile.sh
# Real-time bounded memory and process resource monitor for Team Calendar under WSL 2.
# Usage: ./scripts/dev-profile.sh [interval_seconds] [max_iterations]
# Default: 3 second interval, runs for 100 iterations (5 mins) unless interrupted.

set -euo pipefail

INTERVAL="${1:-3}"
MAX_ITER="${2:-100}"
ITER=0

echo "Starting Team Calendar dev resource profiling (Interval: ${INTERVAL}s, Max iterations: ${MAX_ITER})..."
echo "Press Ctrl+C to stop at any time."
printf "%-10s | %-12s | %-10s | %-10s | %-10s | %-16s\n" "TIME" "MEM AVAIL" "SWAP USED" "PSI (SOME)" "NEXT RSS" "TOP PROCESS"
echo "-----------------------------------------------------------------------------------------"

trap 'echo -e "\nProfiling stopped cleanly."; exit 0' INT TERM

while [ "$ITER" -lt "$MAX_ITER" ]; do
  ITER=$((ITER + 1))
  NOW=$(date +"%H:%M:%S")

  AVAIL_KB=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
  AVAIL_MB=$((AVAIL_KB / 1024))

  SWAP_TOTAL_KB=$(grep SwapTotal /proc/meminfo | awk '{print $2}')
  SWAP_FREE_KB=$(grep SwapFree /proc/meminfo | awk '{print $2}')
  SWAP_USED_MB=0
  if [ "$SWAP_TOTAL_KB" -gt 0 ]; then
    SWAP_USED_MB=$(((SWAP_TOTAL_KB - SWAP_FREE_KB) / 1024))
  fi

  PSI="N/A"
  if [ -f /proc/pressure/memory ]; then
    PSI=$(head -n 1 /proc/pressure/memory | grep -o 'avg10=[0-9.]*' | cut -d= -f2)
  fi

  NEXT_RSS_KB=$(ps -eo rss,cmd | awk '/[n]ext-server/ {sum+=$1} END {print sum+0}')
  NEXT_RSS_MB=$((NEXT_RSS_KB / 1024))

  TOP_PROC=$(ps -eo comm,%mem --sort=-%mem | sed 1d | head -n 1 | awk '{print $1 " (" $2 "%)"}')

  printf "%-10s | %-10s MB | %-8s MB | %-10s | %-8s MB | %-16s\n" \
    "$NOW" "$AVAIL_MB" "$SWAP_USED_MB" "$PSI" "$NEXT_RSS_MB" "$TOP_PROC"

  if [ "$AVAIL_MB" -lt 1500 ]; then
    echo "  ▲ WARNING: Available memory dropped below 1500 MB! Consider stopping dev server before OOM."
  fi

  sleep "$INTERVAL"
done

echo "Profiling completed."
