#!/usr/bin/env bash
# Start Hermes, then the backend, in the api container. If either stops, the container stops.
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

echo "mula-api: starting Hermes"
bash "$APP/server/scripts/start_hermes.sh" &
pids+=($!)

for _ in $(seq 1 90); do
  if curl -fsS -o /dev/null -H "Authorization: Bearer $HERMES_API_KEY" http://127.0.0.1:8642/v1/capabilities; then
    break
  fi
  if ! kill -0 "${pids[0]}" 2>/dev/null; then
    echo "mula-api: Hermes stopped during startup." >&2
    exit 1
  fi
  sleep 1
done
curl -fsS -o /dev/null -H "Authorization: Bearer $HERMES_API_KEY" http://127.0.0.1:8642/v1/capabilities \
  || { echo "mula-api: Hermes did not become ready in 90 s." >&2; stop; exit 1; }
echo "mula-api: Hermes is ready; starting the backend"

cd "$APP/server"
# 0.0.0.0 inside compose's own network, where the web container reaches api:8000. On a VPS the
# container shares the host's network (docker-compose.vps.yml), and MULA_API_HOST=127.0.0.1 keeps the
# backend off the public internet: only the SSH tunnel reaches it (scripts/vps-tunnel.sh).
python3 -m uvicorn src.main:app --host "${MULA_API_HOST:-0.0.0.0}" --port 8000 &
pids+=($!)

# Exit when either process exits, so Docker sees the failure and can restart the container.
set +e
wait -n "${pids[@]}"
status=$?
echo "mula-api: a process stopped (status $status); stopping the container." >&2
stop
exit "$status"
