#!/usr/bin/env sh
set -eu

LAB_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE_FILE="$LAB_ROOT/compose.yml"
ENV_FILE="$LAB_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="$LAB_ROOT/.env.example"
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

cleanup() {
  if [ -n "${HEALTH_FILE:-}" ]; then
    rm -f "$HEALTH_FILE"
  fi
  compose down --remove-orphans || true
}
trap cleanup EXIT INT TERM

compose up -d --build --wait --wait-timeout 120

RUNNING=$(compose ps --status running --services)
printf '%s\n' "$RUNNING" | grep -qx redis
printf '%s\n' "$RUNNING" | grep -qx torrent-indexer

[ "$(compose exec -T redis redis-cli ping)" = "PONG" ]

REDIS_PORT=$(compose port redis 6379 2>/dev/null || true)
[ -z "$REDIS_PORT" ]

APP_PORT=$(compose port torrent-indexer 7006)
METRICS_PORT=$(compose port torrent-indexer 8081)
case "$APP_PORT" in 127.0.0.1:*) ;; *) echo "app is not loopback-only" >&2; exit 1;; esac
case "$METRICS_PORT" in 127.0.0.1:*) ;; *) echo "metrics is not loopback-only" >&2; exit 1;; esac

ROOT_BODY=$(curl --fail --silent --show-error "http://$APP_PORT/")
printf '%s' "$ROOT_BODY" | grep -q '"endpoints"'

HEALTH_FILE=$(mktemp)
HEALTH_CODE=$(curl --silent --show-error --output "$HEALTH_FILE" --write-out '%{http_code}' "http://$APP_PORT/search/health")
case "$HEALTH_CODE" in 200|503) ;; *) echo "unexpected health status: $HEALTH_CODE" >&2; exit 1;; esac
grep -q '"status"' "$HEALTH_FILE"
rm -f "$HEALTH_FILE"
HEALTH_FILE=

curl --fail --silent --show-error "http://$METRICS_PORT/metrics" | grep -q '^# HELP'

CONTAINER_IDS=$(compose ps -q)
# shellcheck disable=SC2086
docker stats --no-stream $CONTAINER_IDS

if compose logs --no-color | grep -Eiq '(password|token|secret|cookie)[[:space:]]*[=:][[:space:]]*[^[:space:]]+'; then
  echo "logs may contain credential-like data" >&2
  exit 1
fi

echo "Safe localhost smoke tests passed. No search endpoint was called."
