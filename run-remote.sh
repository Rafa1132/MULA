#!/usr/bin/env bash
# Run the frontend against the shared Mula backend over HTTPS (for anyone who has just cloned the
# repo). The work is in scripts/run-remote.mjs, plain Node.js, so Windows has the same launcher as
# run-remote.cmd, and `npm run remote` works everywhere. Options: --no-open. See README.md.
set -euo pipefail
if ! command -v node >/dev/null 2>&1; then
  echo "run-remote: Node.js is not installed or not in this Terminal's PATH. Install Node.js 20+ from https://nodejs.org" >&2
  exit 1
fi
exec node "$(cd "$(dirname "$0")" && pwd)/scripts/run-remote.mjs" "$@"
