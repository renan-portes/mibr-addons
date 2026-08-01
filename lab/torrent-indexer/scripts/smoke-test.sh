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

  probe_http() {
    PROBE_PORT=$1
    PROBE_PATH=$2
    PROBE_RAW=$(compose exec -T torrent-indexer sh -c "printf 'GET $PROBE_PATH HTTP/1.0\\r\\nHost: 127.0.0.1\\r\\nConnection: close\\r\\n\\r\\n' | nc -w 10 127.0.0.1 $PROBE_PORT" | tr -d '\r') || fail "GET $PROBE_PATH transport"
    HTTP_CODE=$(printf '%s\n' "$PROBE_RAW" | sed -n '1s/^HTTP\/[0-9.]* \([0-9][0-9][0-9]\).*/\1/p')
    HTTP_BODY=$(printf '%s\n' "$PROBE_RAW" | sed '1,/^$/d')
    [ -n "$HTTP_CODE" ] || fail "GET $PROBE_PATH did not return a parseable HTTP status"
  }

  validate_json() {
    if command -v jq >/dev/null 2>&1; then
      printf '%s' "$1" | jq -e . >/dev/null 2>&1
    elif command -v python3 >/dev/null 2>&1; then
      printf '%s' "$1" | python3 -m json.tool >/dev/null 2>&1
    else
      fail "JSON validation requires jq or python3 on the Docker host"
    fi
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
  probe_http 7006 /search/health
  case "$HTTP_CODE" in 200|503) ;; *) fail "GET /search/health returned HTTP $HTTP_CODE (expected 200 or 503)";; esac
  [ -n "$HTTP_BODY" ] || fail "GET /search/health returned an empty body with HTTP $HTTP_CODE"
  validate_json "$HTTP_BODY" || fail "GET /search/health returned invalid JSON with HTTP $HTTP_CODE"
  printf 'GET /search/health returned expected HTTP %s with valid JSON.\n' "$HTTP_CODE"

  printf '%s\n' "Checking the safe metrics endpoint from inside torrent-indexer..."
  probe_http 8081 /metrics
  [ "$HTTP_CODE" = "200" ] || fail "GET /metrics returned HTTP $HTTP_CODE (expected 200)"
  printf '%s\n' "$HTTP_BODY" | grep -Eq '^(# (HELP|TYPE) |[a-zA-Z_:][a-zA-Z0-9_:]*(\{|[[:space:]]))' || fail "metrics response is not recognizable Prometheus text"
  printf '%s\n' "GET /metrics returned expected HTTP 200 with Prometheus text."

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
