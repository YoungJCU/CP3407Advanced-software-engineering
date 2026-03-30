#!/bin/bash
# start_backend.sh - start the node server in background and write pid to server.pid
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
# use npm start (node app.js)
npm run start > server.log 2>&1 &
PID=$!
echo $PID > server.pid
echo "Server started with PID $PID (logs -> server.log)"

