#!/usr/bin/env sh

# Keep strict mode inside a subprocess so a failed check cannot terminate a
# login shell that invoked this script normally.
run_smoke_tests() (
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
    printf '%s\n' "Cleanup: stopping and removing laboratory resources."
    compose down --remove-orphans || true
  }
  trap cleanup EXIT INT TERM

  fail() {
    printf 'FAILED: %s\n' "$1" >&2
    exit 1
  }

  printf '%s\n' "Starting the pinned laboratory build and containers..."
  compose up -d --build --wait --wait-timeout 120 || fail "build/start/health wait"

  printf '%s\n' "Checking that Redis and torrent-indexer are running..."
  RUNNING=$(compose ps --status running --services) || fail "container status query"
  printf '%s\n' "$RUNNING" | grep -qx redis || fail "Redis is not running"
  printf '%s\n' "$RUNNING" | grep -qx torrent-indexer || fail "torrent-indexer is not running"

  printf '%s\n' "Checking Redis health inside its container..."
  [ "$(compose exec -T redis redis-cli ping)" = "PONG" ] || fail "Redis PING"

  printf '%s\n' "Checking with docker inspect that neither container publishes host ports..."
  for SERVICE in redis torrent-indexer; do
    CONTAINER_ID=$(compose ps -q "$SERVICE") || fail "$SERVICE container ID lookup"
    [ -n "$CONTAINER_ID" ] || fail "$SERVICE container ID lookup"
    PORT_BINDINGS=$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$CONTAINER_ID") || fail "$SERVICE HostConfig inspection"
    NETWORK_PORTS=$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$CONTAINER_ID") || fail "$SERVICE NetworkSettings inspection"
    [ "$PORT_BINDINGS" = "{}" ] || fail "$SERVICE has configured host port bindings: $PORT_BINDINGS"
    if printf '%s' "$NETWORK_PORTS" | grep -q 'HostIp'; then
      fail "$SERVICE has runtime host port bindings: $NETWORK_PORTS"
    fi
  done

  printf '%s\n' "Checking the safe root endpoint from inside torrent-indexer..."
  ROOT_BODY=$(compose exec -T torrent-indexer wget -qO- http://127.0.0.1:7006/) || fail "GET /"
  printf '%s' "$ROOT_BODY" | grep -q '"endpoints"' || fail "GET / returned unexpected JSON"

  printf '%s\n' "Checking the safe search health endpoint from inside torrent-indexer..."
  HEALTH_OUTPUT=$(compose exec -T torrent-indexer sh -c 'wget -S -O- http://127.0.0.1:7006/search/health 2>&1 || true') || fail "GET /search/health execution"
  printf '%s' "$HEALTH_OUTPUT" | grep -Eq 'HTTP/[0-9.]+ (200|503)' || fail "GET /search/health returned neither HTTP 200 nor 503"
  printf '%s' "$HEALTH_OUTPUT" | grep -q '"status"' || fail "GET /search/health returned unexpected JSON"

  printf '%s\n' "Checking the safe metrics endpoint from inside torrent-indexer..."
  METRICS=$(compose exec -T torrent-indexer wget -qO- http://127.0.0.1:8081/metrics) || fail "GET :8081/metrics"
  printf '%s' "$METRICS" | grep -q '^# HELP' || fail "metrics response is not Prometheus text"

  printf '%s\n' "Collecting one resource-usage snapshot..."
  CONTAINER_IDS=$(compose ps -q) || fail "container ID collection"
  # shellcheck disable=SC2086
  docker stats --no-stream $CONTAINER_IDS || fail "docker stats"

  printf '%s\n' "Checking logs for credential-like values..."
  if compose logs --no-color | grep -Eiq '(password|token|secret|cookie)[[:space:]]*[=:][[:space:]]*[^[:space:]]+'; then
    fail "logs may contain credential-like data"
  fi

  printf '%s\n' "All isolated smoke tests passed. No search or indexer endpoint was called."
)

if run_smoke_tests; then
  exit 0
else
  STATUS=$?
  printf 'Smoke test failed (exit %s); cleanup was attempted.\n' "$STATUS" >&2
  exit "$STATUS"
fi
