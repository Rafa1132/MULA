#!/usr/bin/env bash
# Run this repo's frontend against the shared Mula backend over HTTPS: no backend, database, SSH key
# or model on this computer. For anyone who has just cloned the repo.
#
#   ./run-remote.sh                 # install the frontend once if needed, start it, open the browser
#   ./run-remote.sh --no-open       # don't open the browser
#   MULA_REMOTE_URL=https://other.example ./run-remote.sh   # a different Mula backend
#
# Creating an account needs an invite code from whoever runs the backend. Ctrl+C stops the frontend.
# Needs bash, curl and Node.js 20 or newer (macOS, Linux, or Windows through WSL). The log goes to
# .runtime/logs/client.log. ./run.sh (backend on this computer) and ./run-vps.sh (SSH tunnel) are
# the other launchers; only one can serve port 3000 at a time.
set -euo pipefail

# The shared backend (docker-compose.vps.yml, profile "public"). Only /api/* and /health answer there.
DEFAULT_REMOTE_URL="https://43-173-36-209.sslip.io"

project_dir="$(cd "$(dirname "$0")" && pwd)"
logs="$project_dir/.runtime/logs"
next_bin="$project_dir/node_modules/next/dist/bin/next"
app_url="http://127.0.0.1:3000"
remote_url="${MULA_REMOTE_URL:-$DEFAULT_REMOTE_URL}"
remote_url="${remote_url%/}"

open_browser=1
for arg in "$@"; do
  case "$arg" in
    --no-open) open_browser=0 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "run-remote: unknown option $arg (see --help)" >&2; exit 2 ;;
  esac
done

# The proxy sends cookies to this address, so it must be HTTPS (plain HTTP only for this computer).
if ! [[ "$remote_url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ || "$remote_url" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?$ ]]; then
  echo "run-remote: MULA_REMOTE_URL must be https://<host> (got '$remote_url')." >&2
  exit 2
fi

for tool in node npm curl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "run-remote: $tool is not installed or not in this Terminal's PATH. Install Node.js 20+ from https://nodejs.org" >&2
    exit 1
  fi
done
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  echo "run-remote: Node.js $node_major is too old; install Node.js 20 or newer." >&2
  exit 1
fi

# Status code of a GET to $1, or 000 when nothing answers.
status_of() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$1" || true
}

echo "Checking the Mula backend at $remote_url…"
backend_status="$(status_of "$remote_url/health")"
if [ "$backend_status" != "200" ]; then
  echo "run-remote: the backend didn't answer (status $backend_status). Check your internet connection, or ask whoever runs it whether it's up." >&2
  exit 1
fi

if [ ! -f "$next_bin" ]; then
  echo "Installing the frontend (first run only; this takes a minute)…"
  (cd "$project_dir" && npm ci --no-audit --no-fund)
fi

# The frontend is ready when its page loads and its proxy reaches the backend: a signed-out
# /api/auth/me answers 401 from the backend (502/503 would mean the backend isn't reachable).
client_ready() {
  [ "$(status_of "$app_url/")" = "200" ] && [ "$(status_of "$app_url/api/auth/me")" = "401" ]
}

if curl -s -o /dev/null --max-time 2 "$app_url/"; then
  echo "run-remote: something already serves $app_url (another launcher?). Stop it first." >&2
  exit 1
fi

mkdir -p "$logs"
child=""
stop_child() {
  if [ -n "$child" ]; then
    kill "$child" 2>/dev/null || true
    wait "$child" 2>/dev/null || true
    echo
    echo "Mula stopped."
  fi
}
trap stop_child EXIT
trap 'exit 0' INT TERM

echo "Starting the frontend…"
# LARAS_BACKEND_URL is where the frontend's proxy sends /api calls (common/services/server-proxy.ts).
# Set only for this process, so no file in the repo changes.
(cd "$project_dir" && LARAS_BACKEND_URL="$remote_url" exec node "$next_bin" dev --hostname 127.0.0.1 --port 3000) > "$logs/client.log" 2>&1 &
child=$!

ready=0
for _ in $(seq 1 120); do
  if client_ready; then
    ready=1
    break
  fi
  if ! kill -0 "$child" 2>/dev/null; then
    echo "run-remote: the frontend stopped during startup. See $logs/client.log" >&2
    tail -n 5 "$logs/client.log" >&2 || true
    exit 1
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "run-remote: the frontend did not become ready in 120 s. See $logs/client.log" >&2
  exit 1
fi

echo
echo "Mula is ready: $app_url (backend: $remote_url)"
echo "New here? Choose Create account; you'll need an invite code from whoever runs this Mula."
echo "Press Ctrl+C to stop."
if [ "$open_browser" -eq 1 ]; then
  if command -v open >/dev/null 2>&1; then
    open "$app_url" 2>/dev/null || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$app_url" >/dev/null 2>&1 || true
  fi
fi

wait "$child" || true
echo "run-remote: the frontend stopped. See $logs/client.log" >&2
exit 1
