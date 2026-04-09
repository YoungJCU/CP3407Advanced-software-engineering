#!/usr/bin/env bash
set -euo pipefail

# One-click stop: kill Node server for this project + anything on port 3000
# Usage: ./stop_all.sh   (from project folder)

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
PID_FILE="$SERVER_DIR/server.pid"

echo ""
echo "=== Campus Navigator — stop ==="

if [[ -f "$PID_FILE" ]]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [[ -n "${PID:-}" ]]; then
    echo "Stopping pid $PID ..."
    kill "$PID" 2>/dev/null || true
    sleep 0.3
  fi
  rm -f "$PID_FILE"
fi

echo "Stopping node app.js (this project) ..."
pkill -f "node.*${SERVER_DIR}/app.js" 2>/dev/null || true
pkill -f "node app.js" 2>/dev/null || true
sleep 0.2

if command -v lsof >/dev/null 2>&1; then
  for p in $(lsof -ti:3000 2>/dev/null || true); do
    echo "Stopping process on port 3000 (pid $p) ..."
    kill "$p" 2>/dev/null || true
  done
fi

echo ""
echo "=== Stopped ==="
echo ""
