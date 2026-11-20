#!/usr/bin/env bash
# Start the backend, then Hermes, in the api container. If either stops, the container stops.
set -euo pipefail

APP=/app
HERMES_HOME_DIR="${HERMES_HOME:-$APP/.runtime/hermes}"
export HERMES_HOME="$HERMES_HOME_DIR"

for name in HERMES_API_KEY MULA_TOOLS_KEY MULA_PROFILE_KEY_SEED MULA_DATABASE_URL; do
  if [ -z "${!name:-}" ]; then
    echo "mula-api: $name is empty. Check server/.env.hermes." >&2
    exit 1
  fi
done

# server/.env.hermes points at the database on the Mac (127.0.0.1); inside compose it is "postgres".
if [ -n "${MULA_DATABASE_HOST:-}" ]; then
  MULA_DATABASE_URL="${MULA_DATABASE_URL//@127.0.0.1:/@${MULA_DATABASE_HOST}:}"
  MULA_DATABASE_URL="${MULA_DATABASE_URL//@localhost:/@${MULA_DATABASE_HOST}:}"
  export MULA_DATABASE_URL
fi
export MULA_MODEL_BASE_URL="${MULA_MODEL_BASE_URL:-http://127.0.0.1:11434/v1}"

# The root Hermes profile: settings from the environment, keeping any other lines
# (for example ANTHROPIC_API_KEY written by enable_claude.py). Nothing is printed.
mkdir -p "$HERMES_HOME_DIR"
python3 - "$HERMES_HOME_DIR/.env" <<'PY'
import os, sys
from pathlib import Path
path = Path(sys.argv[1])
managed = {
    "API_SERVER_ENABLED": "true",
    "API_SERVER_KEY": os.environ["HERMES_API_KEY"],
    "API_SERVER_HOST": "127.0.0.1",
    "API_SERVER_PORT": "8642",
    "MULA_TOOLS_KEY": os.environ["MULA_TOOLS_KEY"],
    "MULA_MODEL_BASE_URL": os.environ["MULA_MODEL_BASE_URL"],
}
kept = []
if path.is_file():
    for line in path.read_text(encoding="utf-8").splitlines():
        name = line.split("=", 1)[0].strip().removeprefix("export ").strip()
        if name not in managed:
            kept.append(line)
path.write_text("\n".join(kept + [f"{k}={v}" for k, v in managed.items()]) + "\n", encoding="utf-8")
path.chmod(0o600)
PY
if [ ! -f "$HERMES_HOME_DIR/config.yaml" ]; then
  cp "$APP/server/hermes/config.yaml" "$HERMES_HOME_DIR/config.yaml"
  chmod 600 "$HERMES_HOME_DIR/config.yaml"
fi

pids=()
stop() { kill "${pids[@]}" 2>/dev/null || true; wait || true; }
trap stop TERM INT

# The backend starts before Hermes, as in scripts/run.py: Hermes connects to the backend's agent
# tools (/mcp) once per profile at startup and parks them after three failed attempts, which leaves
# agents without their tools and, with many profiles, keeps Hermes from getting ready at all. The
# backend only contacts Hermes when a chat turn starts, so it doesn't need Hermes to start.
cd "$APP/server"
echo "mula-api: starting the backend"
# 0.0.0.0 inside compose's own network, where the web container reaches api:8000. On a VPS the
# container shares the host's network (docker-compose.vps.yml), and MULA_API_HOST=127.0.0.1 keeps the
# backend off the public internet: only the SSH tunnel reaches it (scripts/vps-tunnel.sh).
python3 -m uvicorn src.main:app --host "${MULA_API_HOST:-0.0.0.0}" --port 8000 &
pids+=($!)

# Waits up to $3 seconds for URL $2, failing early if process $1 exits.
wait_for() {
  local pid="$1" url="$2" seconds="$3"
  for _ in $(seq 1 "$seconds"); do
    if curl -fsS -o /dev/null -H "Authorization: Bearer $HERMES_API_KEY" "$url"; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      return 1
    fi
    sleep 1
  done
  return 1
}

if ! wait_for "${pids[0]}" http://127.0.0.1:8000/health 90; then
  echo "mula-api: the backend did not become ready in 90 s." >&2
  stop
  exit 1
fi
echo "mula-api: the backend is ready; starting Hermes"

bash "$APP/server/scripts/start_hermes.sh" &
pids+=($!)
if ! wait_for "${pids[1]}" http://127.0.0.1:8642/v1/capabilities 90; then
  echo "mula-api: Hermes did not become ready in 90 s." >&2
  stop
  exit 1
fi
echo "mula-api: Hermes is ready"

# Exit when either process exits, so Docker sees the failure and can restart the container.
set +e
wait -n "${pids[@]}"
status=$?
echo "mula-api: a process stopped (status $status); stopping the container." >&2
stop
exit "$status"
