#!/usr/bin/env bash
# Connects this Mac's frontend to the Mula backend on a VPS through SSH (see docker-compose.vps.yml).
#
#   scripts/vps-tunnel.sh ubuntu@<vps-ip>            # backend only: agents use OpenRouter brains
#   scripts/vps-tunnel.sh --ollama ubuntu@<vps-ip>   # also lend the VPS this Mac's Ollama (local brain)
#
# -L brings the VPS backend to 127.0.0.1:8000 here, where the frontend already looks
# (LARAS_BACKEND_URL). With --ollama, -R brings this Mac's Ollama to 127.0.0.1:11434 on the VPS; the
# server's GatewayPorts=no keeps it on the VPS's loopback, never public. Runs until Ctrl+C.
# Settings: MULA_VPS (the user@host, instead of the argument) and MULA_VPS_KEY (default ~/.ssh/mula_vps).
set -euo pipefail

with_ollama=0
target="${MULA_VPS:-}"
for arg in "$@"; do
  case "$arg" in
    --ollama) with_ollama=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    -*) echo "vps-tunnel: unknown option $arg" >&2; exit 2 ;;
    *) target="$arg" ;;
  esac
done

if [ -z "$target" ]; then
  echo "vps-tunnel: give the VPS as user@host, for example: scripts/vps-tunnel.sh ubuntu@203.0.113.10" >&2
  exit 2
fi
if ! [[ "$target" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.:-]+$ ]]; then
  echo "vps-tunnel: '$target' doesn't look like user@host." >&2
  exit 2
fi

key="${MULA_VPS_KEY:-$HOME/.ssh/mula_vps}"
if [ ! -f "$key" ]; then
  echo "vps-tunnel: SSH key $key not found. Set MULA_VPS_KEY to the key for this VPS." >&2
  exit 1
fi

# The frontend expects the backend on 8000; a local backend there would shadow the VPS.
if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "vps-tunnel: something on this Mac already listens on port 8000 (a local backend?). Stop it first." >&2
  exit 1
fi

forwards=(-L 127.0.0.1:8000:127.0.0.1:8000)
if [ "$with_ollama" -eq 1 ]; then
  if ! curl -fsS --max-time 3 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "vps-tunnel: Ollama isn't answering on this Mac (127.0.0.1:11434). Start Ollama, or run without --ollama." >&2
    exit 1
  fi
  forwards+=(-R 127.0.0.1:11434:127.0.0.1:11434)
  echo "vps-tunnel: backend on http://127.0.0.1:8000, and this Mac's Ollama lent to the VPS. Ctrl+C to stop."
else
  echo "vps-tunnel: backend on http://127.0.0.1:8000 (no Ollama: use OpenRouter brains). Ctrl+C to stop."
fi

# ExitOnForwardFailure: stop instead of running half-connected; keep-alives notice a dropped network.
exec ssh -N -i "$key" -o IdentitiesOnly=yes -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 "${forwards[@]}" "$target"
