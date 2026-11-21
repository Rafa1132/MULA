#!/usr/bin/env bash
# Run Mula against the backend on a VPS: start the SSH tunnel (scripts/vps-tunnel.sh) and the
# frontend, wait until both answer, and open the browser. Ctrl+C stops only what this started.
#
#   ./run-vps.sh ubuntu@<vps-ip>              # agents use OpenRouter brains
#   ./run-vps.sh --ollama ubuntu@<vps-ip>     # also lend the VPS this Mac's Ollama (local brain)
#   ./run-vps.sh --no-open ubuntu@<vps-ip>    # don't open the browser
#
# Set MULA_VPS=ubuntu@<vps-ip> (for example in ~/.zshrc) to leave out the address. ./run.sh is
# still the launcher for a backend on this Mac; the two can't run at the same time (port 8000).
# Logs go to .runtime/logs/tunnel.log and .runtime/logs/client.log.
set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
logs="$project_dir/.runtime/logs"
next_bin="$project_dir/node_modules/next/dist/bin/next"
app_url="http://127.0.0.1:3000"

tunnel_args=()
open_browser=1
for arg in "$@"; do
  case "$arg" in
    --no-open) open_browser=0 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) tunnel_args+=("$arg") ;;
  esac
done

if [ ! -f "$next_bin" ]; then
  echo "run-vps: the frontend isn't installed. Run npm install first." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "run-vps: node is not available in this Terminal's PATH." >&2
  exit 1
fi

# Status code of a GET to $1, or 000 when nothing answers.
status_of() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$1" || true
}

backend_ready() {
  [ "$(status_of http://127.0.0.1:8000/health)" = "200" ]
}

# The frontend is ready when its page loads and its proxy reaches the backend: a signed-out
# /api/auth/me answers 401 from the backend (502 would mean the backend isn't reachable).
client_ready() {
  [ "$(status_of "$app_url/")" = "200" ] && [ "$(status_of "$app_url/api/auth/me")" = "401" ]
}

children=()
stop_children() {
  if [ "${#children[@]}" -gt 0 ]; then
    kill "${children[@]}" 2>/dev/null || true
    wait "${children[@]}" 2>/dev/null || true
    echo
    echo "Mula stopped."
  fi
}
trap stop_children EXIT
trap 'exit 0' INT TERM

# Waits up to $3 seconds for check $2 while process $1 runs. $4 names it in messages, $5 is its log.
wait_until_ready() {
  local pid="$1" check="$2" seconds="$3" name="$4" log="$5"
  for _ in $(seq 1 "$seconds"); do
    if "$check"; then
      echo "$name is ready."
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "run-vps: $name stopped during startup. See $log" >&2
      tail -n 5 "$log" >&2 || true
      exit 1
    fi
    sleep 1
  done
  echo "run-vps: $name did not become ready in $seconds s. See $log" >&2
  exit 1
}

mkdir -p "$logs"

if backend_ready; then
  # A tunnel from another Terminal (or a local backend) already serves port 8000; reuse it.
  echo "The backend already answers on port 8000; using it."
else
  echo "Starting the tunnel…"
  # ${arr[@]+...} keeps an empty list safe under set -u in macOS's bash 3.2.
  "$project_dir/scripts/vps-tunnel.sh" ${tunnel_args[@]+"${tunnel_args[@]}"} > "$logs/tunnel.log" 2>&1 &
  children+=($!)
  wait_until_ready "$!" backend_ready 30 "The tunnel" "$logs/tunnel.log"
fi

if client_ready; then
  echo "The frontend is already running."
else
  echo "Starting the frontend…"
  (cd "$project_dir" && exec node "$next_bin" dev --hostname 127.0.0.1 --port 3000) > "$logs/client.log" 2>&1 &
  children+=($!)
  wait_until_ready "$!" client_ready 90 "The frontend" "$logs/client.log"
fi

echo
echo "Mula is ready: $app_url (backend on the VPS)"
echo "Press Ctrl+C to stop what this command started."
if [ "$open_browser" -eq 1 ]; then
  open "$app_url" 2>/dev/null || true
fi

if [ "${#children[@]}" -eq 0 ]; then
  exit 0
fi
# macOS's bash has no `wait -n`, so check each child once a second; one stopping stops the rest.
while true; do
  for pid in "${children[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "run-vps: a process stopped (the tunnel drops if the network or the VPS does). Logs: $logs" >&2
      exit 1
    fi
  done
  sleep 1
done
