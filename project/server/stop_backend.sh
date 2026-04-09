#!/bin/bash
# stop_backend.sh - stop the node server using server.pid
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
if [ ! -f server.pid ]; then
  echo "No server.pid file found. Is the server running?"; exit 1
fi
PID=$(cat server.pid)
if ps -p $PID > /dev/null 2>&1; then
  kill $PID
  echo "Sent SIGTERM to PID $PID"
  # wait up to 5s
  for i in {1..10}; do
    if ! ps -p $PID > /dev/null 2>&1; then
      echo "Process $PID stopped."; break
    fi
    sleep 0.5
  done
else
  echo "Process $PID not running.";
fi
rm -f server.pid

