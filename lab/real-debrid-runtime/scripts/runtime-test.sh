#!/usr/bin/env sh

run_real_debrid_runtime() (
  set -eu
  LAB_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
  ENV_FILE="$LAB_ROOT/.env"
  COMPOSE_FILE="$LAB_ROOT/compose.yml"
  umask 077
  RUNTIME_TEMP_DIR=$(mktemp -d)
  SECRET_FILE="$RUNTIME_TEMP_DIR/real_debrid_token"
  OVERRIDE_FILE="$RUNTIME_TEMP_DIR/secret.override.yml"
  RUNTIME_PID=
  CLEANED=0

  cleanup() {
    [ "$CLEANED" -eq 0 ] || return 0
    CLEANED=1
    if [ -n "$RUNTIME_PID" ]; then
      kill -TERM "-$RUNTIME_PID" 2>/dev/null || true
      kill -KILL "-$RUNTIME_PID" 2>/dev/null || true
      RUNTIME_PID=
    fi
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
    rm -f "$SECRET_FILE" "$OVERRIDE_FILE"
    rmdir "$RUNTIME_TEMP_DIR" 2>/dev/null || true
  }
  on_signal() { trap - EXIT INT TERM TSTP; cleanup; exit "$1"; }
  trap cleanup EXIT
  trap 'on_signal 130' INT
  trap 'on_signal 143' TERM
  trap 'on_signal 148' TSTP

  [ -f "$ENV_FILE" ] || { printf '%s\n' 'FAILED: copy .env.example to .env.' >&2; exit 1; }
  if command -v stat >/dev/null 2>&1; then
    ENV_MODE=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || printf '')
    case "$ENV_MODE" in *00) :;; *) printf '%s\n' 'FAILED: .env must not be accessible by group or world.' >&2; exit 1;; esac
  fi
  grep -q '^REAL_DEBRID_AUTHORIZED=true$' "$ENV_FILE" || { printf '%s\n' 'FAILED: explicit authorization is required.' >&2; exit 1; }
  grep -q '^REAL_DEBRID_API_TOKEN=..*$' "$ENV_FILE" || { printf '%s\n' 'FAILED: API token is missing.' >&2; exit 1; }
  TOKEN=$(sed -n 's/^REAL_DEBRID_API_TOKEN=//p' "$ENV_FILE")
  TOKEN_BYTES=$(printf '%s' "$TOKEN" | wc -c | tr -d ' ')
  [ "$TOKEN_BYTES" -ge 1 ] && [ "$TOKEN_BYTES" -le 4096 ] && [ -n "$(printf '%s' "$TOKEN" | tr -d '[:space:]')" ] || { printf '%s\n' 'FAILED: API token is invalid.' >&2; exit 1; }
  printf '%s' "$TOKEN" >"$SECRET_FILE"
  chown 1000:1000 "$RUNTIME_TEMP_DIR" "$SECRET_FILE"
  chmod 700 "$RUNTIME_TEMP_DIR"
  chmod 400 "$SECRET_FILE"
  unset TOKEN
  [ -d "$RUNTIME_TEMP_DIR" ] && [ -f "$SECRET_FILE" ] && [ -s "$SECRET_FILE" ] || { printf '%s\n' 'FAILED: runtime secret preparation failed.' >&2; exit 1; }
  DIR_METADATA=$(stat -c '%u:%g:%a' "$RUNTIME_TEMP_DIR" 2>/dev/null || printf '')
  FILE_METADATA=$(stat -c '%u:%g:%a' "$SECRET_FILE" 2>/dev/null || printf '')
  [ "$DIR_METADATA" = '1000:1000:700' ] || { printf '%s\n' 'FAILED: runtime secret directory permissions are invalid.' >&2; exit 1; }
  case "$FILE_METADATA" in '1000:1000:400'|'1000:1000:600') :;; *) printf '%s\n' 'FAILED: runtime secret file permissions are invalid.' >&2; exit 1;; esac
  cat >"$OVERRIDE_FILE" <<EOF
services:
  runtime-tools:
    volumes:
      - type: bind
        source: '$SECRET_FILE'
        target: /run/secrets/real_debrid_token
        read_only: true
EOF
  MODE=$(sed -n 's/^REAL_DEBRID_TEST_MODE=//p' "$ENV_FILE")
  [ "$MODE" = account ] || [ "$MODE" = candidate ] || { printf '%s\n' 'FAILED: test mode must be account or candidate.' >&2; exit 1; }
  if [ "$MODE" = candidate ]; then
    [ "${REAL_DEBRID_CANDIDATE_AUTHORIZED:-false}" = true ] || { printf '%s\n' 'FAILED: candidate mode requires a second explicit authorization.' >&2; exit 1; }
    [ -n "${REAL_DEBRID_CANDIDATE_MAGNET:-}" ] && [ -n "${REAL_DEBRID_CANDIDATE_INFO_HASH:-}" ] && [ -n "${REAL_DEBRID_CANDIDATE_FILE_PATH:-}" ] && [ -n "${REAL_DEBRID_CANDIDATE_FILE_BYTES:-}" ] || { printf '%s\n' 'FAILED: candidate mode requires temporary authorized input.' >&2; exit 1; }
  fi

  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" build runtime-tools >/dev/null
  # RUNTIME_INVOCATION_ONCE: one disposable container, no automatic repetition.
  set +e
  setsid timeout --signal=TERM --kill-after=5s 60s docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" run --rm -T runtime-tools &
  RUNTIME_PID=$!
  wait "$RUNTIME_PID"
  STATUS=$?
  RUNTIME_PID=
  set -e
  [ "$STATUS" -ne 124 ] && [ "$STATUS" -ne 137 ] || { printf '%s\n' 'FAILED: global runtime timeout.' >&2; exit 1; }
  exit "$STATUS"
)

run_real_debrid_runtime "$@"
