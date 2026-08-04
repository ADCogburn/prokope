#!/usr/bin/env bash
# Builds the /server Dockerfile image, runs it against a real Postgres via
# docker-compose, and polls /health until it returns 200 or a bounded
# timeout fails the script. Proves the same artifact Railway builds and runs
# actually boots, migrates, and serves traffic -- without needing live
# Railway credentials or a completed deploy. #17 wires this into the
# automated CI gate; see #15.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

compose() { docker compose -f docker-compose.yml "$@"; }

cleanup() { compose down --volumes --remove-orphans; }
trap cleanup EXIT

compose up --build --detach

timeout_seconds=60
elapsed=0
until curl --fail --silent --output /dev/null "http://localhost:8080/health"; do
  if (( elapsed >= timeout_seconds )); then
    echo "Timed out after ${timeout_seconds}s waiting for /health to return 200." >&2
    compose logs
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

echo "Health check passed."
