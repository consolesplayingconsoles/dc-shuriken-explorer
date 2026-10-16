#!/usr/bin/env bash
# Serves the built page (web/) on this machine and opens it; Ctrl+C stops it. The page reads your discs itself.
#   ./start.sh                 on port 8765 (PORT=8766 ./start.sh for another copy)
# NO_OPEN=1 skips opening the browser.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8765}"
if curl -s -m 1 -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "[ERROR] port $PORT is already in use (an older dc-shuriken-explorer? stop it with Ctrl+C in its terminal), or run PORT=8766 ./start.sh"
  exit 1
fi
python3 serve.py "$PORT" &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; wait $SERVER 2>/dev/null || true' EXIT INT TERM
for _ in $(seq 1 40); do
  kill -0 $SERVER 2>/dev/null || { echo "[ERROR] the page server stopped"; exit 1; }
  curl -s -m 1 -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 0.25
done
URL="http://127.0.0.1:$PORT/"
echo "dc-shuriken-explorer: $URL  (Ctrl+C to stop)"
if [ -z "${NO_OPEN:-}" ]; then
  if command -v open >/dev/null; then open "$URL"; elif command -v xdg-open >/dev/null; then xdg-open "$URL"; fi
fi
wait $SERVER
