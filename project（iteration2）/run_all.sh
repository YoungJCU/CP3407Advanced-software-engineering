#!/usr/bin/env bash
set -euo pipefail

# One-click start: install deps + run Express (serves client + API)
# Usage (Terminal):
#   cd ".../web（svg）/project"
#   chmod +x run_all.sh stop_all.sh   # first time only
#   ./run_all.sh
#
# Default port 3001 so another app (e.g. test web) can use 3000.
# Override: PORT=3000 ./run_all.sh

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
LOG_FILE="$SERVER_DIR/server.log"
PID_FILE="$SERVER_DIR/server.pid"
PORT="${PORT:-3001}"
export PORT

echo ""
echo "=== Campus Navigator — start ==="
echo "Project: $ROOT_DIR"
echo "Port:    $PORT"
echo ""

cd "$SERVER_DIR"
echo "[1/3] npm install ..."
npm install --no-audit --no-fund

if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [[ -n "${OLD_PID:-}" ]]; then
    echo "[2/3] Stopping previous instance (pid $OLD_PID) ..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 0.4
  fi
  rm -f "$PID_FILE"
fi

if command -v lsof >/dev/null 2>&1; then
  for p in $(lsof -ti:"$PORT" 2>/dev/null || true); do
    echo "[2/3] Freeing port $PORT (pid $p) ..."
    kill "$p" 2>/dev/null || true
  done
  sleep 0.2
fi

pkill -f "node.*${SERVER_DIR}/app.js" 2>/dev/null || true
pkill -f "node app.js" 2>/dev/null || true
sleep 0.2

echo "[3/3] Starting server ..."
nohup node "$SERVER_DIR/app.js" >"$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" >"$PID_FILE"
sleep 0.6

echo ""
echo "  PID: $NEW_PID   Log: $LOG_FILE"
echo ""
echo "  >>> Open in browser:  http://localhost:${PORT}/"
echo ""
echo "=== Done ==="
echo ""
