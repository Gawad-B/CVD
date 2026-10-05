#!/usr/bin/env bash
# Manage the throwaway Postgres container used by the pytest suite.
set -euo pipefail

NAME="cardio-test-db"
PORT=55432

case "${1:-}" in
  up)
    if [ -z "$(docker ps -q -f "name=^${NAME}$")" ]; then
      docker rm -f "$NAME" >/dev/null 2>&1 || true
      docker run -d --name "$NAME" \
        -e POSTGRES_USER=cardio_test -e POSTGRES_PASSWORD=cardio_test -e POSTGRES_DB=cardio_test \
        -p "${PORT}:5432" postgres:16 >/dev/null
    fi
    for _ in $(seq 1 30); do
      if command -v pg_isready >/dev/null 2>&1; then
        ready() { pg_isready -h localhost -p "$PORT" >/dev/null 2>&1; }
      else
        ready() { docker exec "$NAME" pg_isready -U cardio_test -d cardio_test >/dev/null 2>&1; }
      fi
      if ready; then
        echo "Test DB ready on localhost:${PORT}"
        exit 0
      fi
      sleep 1
    done
    echo "Test DB did not become ready within 30s" >&2
    exit 1
    ;;
  down)
    docker rm -f "$NAME"
    ;;
  *)
    echo "usage: $0 up|down" >&2
    exit 2
    ;;
esac
