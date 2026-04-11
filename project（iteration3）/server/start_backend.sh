#!/usr/bin/env bash
# start_backend.sh - start Express server in background and write pid to server.pid
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
PORT="${PORT:-3001}"
export PORT
npm run start > server.log 2>&1 &
PID=$!
echo "$PID" > server.pid
echo "Server started with PID $PID on port $PORT (logs -> server.log)"

