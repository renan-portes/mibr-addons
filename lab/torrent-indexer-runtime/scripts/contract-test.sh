#!/usr/bin/env sh

run_contract_test() (
  set -eu

  LAB_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
  COMPOSE_FILE="$LAB_ROOT/compose.yml"
  TOOLS_COMPOSE_FILE="$LAB_ROOT/compose.tools.yml"
  ENV_FILE="$LAB_ROOT/.env"
  [ -f "$ENV_FILE" ] || {
    printf '%s\n' "FAILED: copy .env.example to .env and explicitly confirm authorization." >&2
    exit 1
  }

  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a

  CONTRACT_TEMP_DIR=$(mktemp -d)
  CONTRACT_TOOLS_UID=$(id -u)
  CONTRACT_TOOLS_GID=$(id -g)
  export CONTRACT_TEMP_DIR CONTRACT_TOOLS_UID CONTRACT_TOOLS_GID
  RAW_FILE="$CONTRACT_TEMP_DIR/http-response.raw"
  BODY_FILE="$CONTRACT_TEMP_DIR/response.json"
  LOG_FILE="$CONTRACT_TEMP_DIR/error-logs.raw"
  ENVIRONMENT_FILE="$CONTRACT_TEMP_DIR/environment.presence"
  DNS_FILE="$CONTRACT_TEMP_DIR/dns.status"
  EGRESS_FILE="$CONTRACT_TEMP_DIR/egress.status"
  FLARESOLVERR_LOG_FILE="$CONTRACT_TEMP_DIR/flaresolverr-logs.raw"
  MARKER_FILE="$CONTRACT_TEMP_DIR/query-marker.txt"
  QUERY_PID=
  CLEANED_UP=0
  cleanup() {
    [ "$CLEANED_UP" -eq 0 ] || return 0
    CLEANED_UP=1
    if [ -n "$QUERY_PID" ]; then
      kill -TERM "-$QUERY_PID" 2>/dev/null || true
      kill -KILL "-$QUERY_PID" 2>/dev/null || true
      QUERY_PID=
    fi
    compose kill torrent-indexer >/dev/null 2>&1 || true
    printf '%s\n' "Cleanup: stopping containers and removing the dedicated network."
    compose down --remove-orphans || true
    [ -z "$RAW_FILE" ] || rm -f "$RAW_FILE"
    [ -z "$BODY_FILE" ] || rm -f "$BODY_FILE"
    rm -f "$LOG_FILE" "$ENVIRONMENT_FILE" "$DNS_FILE" "$EGRESS_FILE" "$FLARESOLVERR_LOG_FILE" "$MARKER_FILE"
    rmdir "$CONTRACT_TEMP_DIR" 2>/dev/null || true
  }
  on_signal() {
    SIGNAL_STATUS=$1
    trap - EXIT INT TERM TSTP
    cleanup
    exit "$SIGNAL_STATUS"
  }
  trap cleanup EXIT
  trap 'on_signal 130' INT
  trap 'on_signal 143' TERM
  trap 'on_signal 148' TSTP

  fail() {
    printf 'FAILED: %s\n' "$1" >&2
    exit 1
  }

  compose() {
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  }

  tools_compose() {
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$TOOLS_COMPOSE_FILE" "$@"
  }

  printf '%s\n' "Validating the fixed, explicitly authorized query configuration..."
  tools_compose build contract-tools || fail "contract-tools image build"
  tools_compose run --rm -T contract-tools lab/torrent-indexer-runtime/tools/validate-config.ts || fail "configuration validation"

  printf '%s\n' "Starting the pinned runtime-contract laboratory..."
  compose up -d --build --wait --wait-timeout 120 || fail "build/start/health wait"

  printf '%s\n' "Confirming that neither container publishes a host port..."
  for SERVICE in redis flaresolverr torrent-indexer; do
    CONTAINER_ID=$(compose ps -q "$SERVICE") || fail "$SERVICE container ID lookup"
    [ -n "$CONTAINER_ID" ] || fail "$SERVICE container ID lookup"
    HOST_BINDINGS=$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$CONTAINER_ID") || fail "$SERVICE HostConfig inspection"
    RUNTIME_PORTS=$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$CONTAINER_ID") || fail "$SERVICE NetworkSettings inspection"
    [ "$HOST_BINDINGS" = "{}" ] || fail "$SERVICE has configured host bindings"
    if printf '%s' "$RUNTIME_PORTS" | grep -q 'HostIp'; then fail "$SERVICE has runtime host bindings"; fi
  done

  printf '%s\n' "Executing the single authorized contract query (no retry)..."
  QUERY_MARKER=$(date -u +"%Y-%m-%dT%H:%M:%S.%NZ")
  printf '%s\n' "$QUERY_MARKER" >"$MARKER_FILE"
  START_MS=$(date +%s%3N)
  # CONTRACT_QUERY_ONCE
  set +e
  # The outer timeout owns the local compose process group. On expiry the service
  # is killed as well, which deterministically terminates the remote exec tree.
  setsid timeout --signal=TERM --kill-after=2s 20s docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T torrent-indexer sh -c "exec timeout -k 1s 20s sh -c \"printf '%s\\r\\n%s\\r\\n%s\\r\\n\\r\\n' 'GET /indexers/${CONTRACT_TEST_INDEXER}?q=Big%20Buck%20Bunny&filter_results=true&limit=1 HTTP/1.0' 'Host: 127.0.0.1' 'Connection: close' | nc -w 20 127.0.0.1 7006\" | head -c $((1048576 + 1))" >"$RAW_FILE" &
  QUERY_PID=$!
  wait "$QUERY_PID"
  QUERY_STATUS=$?
  QUERY_PID=
  set -e
  if [ "$QUERY_STATUS" -eq 124 ] || [ "$QUERY_STATUS" -eq 137 ]; then
    printf '%s\n' "FAILED: consulta excedeu 20 segundos; terminating the complete query process tree." >&2
    compose kill torrent-indexer >/dev/null 2>&1 || true
    exit 1
  fi
  [ "$QUERY_STATUS" -eq 0 ] || fail "single contract query transport (exit $QUERY_STATUS)"
  END_MS=$(date +%s%3N)

  RESPONSE_BYTES=$(wc -c <"$RAW_FILE" | tr -d ' ')
  [ "$RESPONSE_BYTES" -le "$CONTRACT_TEST_MAX_RESPONSE_BYTES" ] || fail "response exceeded configured byte limit"
  HTTP_CODE=$(tr -d '\r' <"$RAW_FILE" | sed -n '1s/^HTTP\/[0-9.]* \([0-9][0-9][0-9]\).*/\1/p')
  [ -n "$HTTP_CODE" ] || fail "response did not contain a parseable HTTP status"
  tr -d '\r' <"$RAW_FILE" | sed '1,/^$/d' >"$BODY_FILE"
  [ -s "$BODY_FILE" ] || fail "response body was empty"

  printf 'HTTP status: %s\n' "$HTTP_CODE"
  printf 'Duration: %s ms\n' "$((END_MS - START_MS))"
  printf 'Response size: %s bytes\n' "$RESPONSE_BYTES"
  if [ "$HTTP_CODE" != "200" ]; then
    printf '%s\n' "Collecting sanitized failure diagnostics without printing raw response or logs."
    compose logs --no-color --timestamps --since "$QUERY_MARKER" torrent-indexer >"$LOG_FILE" 2>/dev/null || :
    compose logs --no-color --timestamps --since "$QUERY_MARKER" flaresolverr >"$FLARESOLVERR_LOG_FILE" 2>/dev/null || :
    compose exec -T torrent-indexer sh -c 'for name in FLARESOLVERR_URL FLARESOLVERR_ADDRESS FLARESOLVERR_POOL_SIZE REDIS_HOST REQUEST_TIMEOUT_MILLISECONDS; do if printenv "$name" >/dev/null 2>&1; then printf "%s=PRESENT\n" "$name"; else printf "%s=ABSENT\n" "$name"; fi; done' >"$ENVIRONMENT_FILE" 2>/dev/null || :
    if compose exec -T torrent-indexer sh -c 'getent hosts torrent-indexer.darklyn.org >/dev/null 2>&1'; then printf '%s\n' AVAILABLE >"$DNS_FILE"; else printf '%s\n' UNAVAILABLE >"$DNS_FILE"; fi
    if compose exec -T torrent-indexer sh -c 'timeout 5s wget --spider -q https://torrent-indexer.darklyn.org/'; then printf '%s\n' AVAILABLE >"$EGRESS_FILE"; else printf '%s\n' UNAVAILABLE >"$EGRESS_FILE"; fi
    tools_compose run --rm -T contract-tools lab/torrent-indexer-runtime/tools/diagnose-error.ts /contract-input/response.json /contract-input/error-logs.raw /contract-input/environment.presence /contract-input/dns.status /contract-input/egress.status /contract-input/error-logs.raw /contract-input/flaresolverr-logs.raw /contract-input/query-marker.txt || fail "sanitized error diagnosis"
    BODY_FILE=
    fail "contract endpoint returned HTTP $HTTP_CODE"
  fi
  rm -f "$RAW_FILE"
  RAW_FILE=

  printf '%s\n' "Producing the sanitized parser compatibility report..."
  set +e
  tools_compose run --rm -T contract-tools lab/torrent-indexer-runtime/tools/analyze-response.ts /contract-input/response.json
  ANALYSIS_STATUS=$?
  set -e
  BODY_FILE=
  case "$ANALYSIS_STATUS" in
    0)
      printf '%s\n' "Contract validated with at least one result."
      ;;
    2)
      printf '%s\n' "Validação parcial: zero resultados. No second query was attempted."
      exit 2
      ;;
    *)
      fail "JSON/parser analysis"
      ;;
  esac

  printf '%s\n' "Contract test completed. No response values, magnets, hashes, trackers, titles, or URLs were printed."
)

run_contract_test
STATUS=$?
case "$STATUS" in
  0) exit 0 ;;
  2) printf '%s\n' "Contract test ended with partial validation (exit 2)."; exit 2 ;;
  *) printf 'Contract test failed (exit %s); no automatic query retry was attempted.\n' "$STATUS" >&2; exit 1 ;;
esac
