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

# macOS: native .node binaries downloaded on another machine may be quarantined
# or have an adhoc signature that macOS rejects at dlopen time. Attempt a
# low-risk fix: remove com.apple.quarantine from sqlite3 native binary and
# try a rebuild if require('sqlite3') still fails. This is only run on Darwin.
if [[ "$(uname)" == "Darwin" ]]; then
  SQLITE_NODE="node_modules/sqlite3/build/Release/node_sqlite3.node"
  if [[ -f "$SQLITE_NODE" ]]; then
    echo "[macOS] Removing com.apple.quarantine from sqlite3 native module (if present) ..."
    xattr -d com.apple.quarantine "$SQLITE_NODE" 2>/dev/null || true

    echo "[macOS] Testing sqlite3 native module load..."
    if node -e "try{require('sqlite3'); process.exit(0);}catch(e){process.exit(1);}" 2>/dev/null; then
      echo "[macOS] sqlite3 loaded OK"
    else
      echo "[macOS] sqlite3 load failed — attempting npm rebuild for sqlite3 (update-binary then fallback to build-from-source)"
      npm rebuild sqlite3 --update-binary || npm rebuild sqlite3 --build-from-source || true
      # Remove quarantine again in case rebuilt artifacts picked up quarantine
      xattr -d com.apple.quarantine "$SQLITE_NODE" 2>/dev/null || true
    fi
  fi
fi

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

echo "[3/3] Starting server (frontend + backend API) ..."
nohup node "$SERVER_DIR/app.js" >"$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" >"$PID_FILE"
sleep 0.8

if command -v curl >/dev/null 2>&1; then
  for attempt in 1 2 3 4 5 6; do
    echo "[3/3] Waiting for server (attempt $attempt) ..."
    if curl -fsS "http://localhost:${PORT}/api/classrooms" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

echo ""
echo "  PID: $NEW_PID   Log: $LOG_FILE"
echo ""
echo "  >>> Open in browser:  http://localhost:${PORT}/"
echo "  >>> Includes API server (no separate backend start needed)"
echo ""
echo "=== Done ==="
echo ""
