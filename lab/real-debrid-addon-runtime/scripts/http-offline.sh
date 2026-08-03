#!/bin/sh
set -eu
umask 077

lab_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$lab_dir/compose.yml"
tmp_dir=$(mktemp -d)
override="$tmp_dir/compose.override.yml"
placeholder="$tmp_dir/real_debrid_token"
headers="$tmp_dir/headers"
body="$tmp_dir/body"
status_file="$tmp_dir/status"
. "$lab_dir/scripts/local-http-client.sh"
main_status=0
cleaned=0
last_curl_status=0
curl_exit_category=UNKNOWN
http_status_present=NAO
http_status_accepted=NAO
content_type_present=NAO
content_type_accepted=NAO
body_present=NAO
json_valid=NAO
health_status_valid=NAO
port=${EXPERIMENTAL_ADDON_HTTP_PORT:-17007}

cleanup() {
  [ "$cleaned" -eq 0 ] || return 0
  cleaned=1
  docker compose -f "$compose_file" -f "$override" --profile experimental-http down --remove-orphans >/dev/null 2>&1 || :
  rm -f -- "$override" "$placeholder" "$headers" "$body" "$status_file" || :
  rmdir -- "$tmp_dir" || :
  unset REAL_DEBRID_TOKEN_FILE_HOST REAL_DEBRID_ADDON_RUNTIME_ENABLED EXPERIMENTAL_ADDON_HTTP_PORT
}
on_exit() { trap - EXIT; cleanup; exit "$main_status"; }
trap on_exit EXIT
trap 'main_status=130; exit "$main_status"' INT
trap 'main_status=143; exit "$main_status"' TERM
trap 'main_status=146; exit "$main_status"' TSTP

invalid() { main_status=2; exit "$main_status"; }
[ "${REAL_DEBRID_ADDON_RUNTIME_ENABLED:-false}" = false ] || invalid
case "$port" in *[!0-9]*|'') invalid;; esac
[ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || invalid

: > "$placeholder"
chown 1000:1000 "$placeholder" || invalid
chmod 400 "$placeholder" || invalid
[ -f "$placeholder" ] && [ ! -L "$placeholder" ] && [ ! -s "$placeholder" ] || invalid
[ "$(stat -c %a "$placeholder")" = 400 ] && [ "$(stat -c %u "$placeholder")" = 1000 ] && [ "$(stat -c %g "$placeholder")" = 1000 ] || invalid
export REAL_DEBRID_TOKEN_FILE_HOST="$placeholder"

cat > "$override" <<EOF
services:
  addon-runtime-http-lab:
    ports:
      - "127.0.0.1:${port}:7007"
EOF
chmod 600 "$override"
[ -f "$override" ] && [ ! -L "$override" ] && [ "$(stat -c %a "$override")" = 600 ] || invalid
grep -Eq '^      - "127\.0\.0\.1:[0-9]+:7007"$' "$override" || invalid
grep -Eiq '0\.0\.0\.0|host[ _-]?network|privileged|docker\.sock|token|authorization|environment|volume' "$override" && invalid
[ "$(grep -c '127\.0\.0\.1:' "$override")" -eq 1 ] || invalid

docker compose -f "$compose_file" -f "$override" --profile experimental-http config >/dev/null || { main_status=$?; exit "$main_status"; }
docker compose -f "$compose_file" -f "$override" --profile experimental-http up -d addon-runtime-http-lab || { main_status=$?; exit "$main_status"; }

service_running() {
  service_id=$(docker compose -f "$compose_file" -f "$override" --profile experimental-http ps -q addon-runtime-http-lab 2>/dev/null || :)
  [ -n "$service_id" ] || return 1
  [ "$(docker inspect -f '{{.State.Running}}' "$service_id" 2>/dev/null || :)" = true ]
}

compose() {
  docker compose -f "$compose_file" -f "$override" --profile experimental-http "$@"
}

marker_present() {
  compose logs --no-color --no-log-prefix addon-runtime-http-lab 2>/dev/null | grep -Fxq "$1"
}

emit_diagnostic() {
  service_container_present=NAO
  service_running_value=NAO
  service_exit_code_present=NAO
  published_loopback_present=NAO
  server_startup_marker_present=NAO
  server_listening_marker_present=NAO
  request_accepted_marker_present=NAO
  health_response_started_marker_present=NAO
  health_response_completed_marker_present=NAO
  command_matches=NAO
  diagnostic_category=UNKNOWN

  diagnostic_id=$(compose ps -a -q addon-runtime-http-lab 2>/dev/null || :)
  if [ -n "$diagnostic_id" ]; then
    service_container_present=SIM
    [ "$(docker inspect -f '{{.Path}}|{{join .Args "|"}}' "$diagnostic_id" 2>/dev/null || :)" = "/opt/runtime-tools/node_modules/.bin/tsx|/workspace/lab/real-debrid-addon-runtime/tools/http-server.ts" ] && command_matches=SIM
    if [ "$(docker inspect -f '{{.State.Running}}' "$diagnostic_id" 2>/dev/null || :)" = true ]; then
      service_running_value=SIM
    elif [ -n "$(docker inspect -f '{{.State.ExitCode}}' "$diagnostic_id" 2>/dev/null || :)" ]; then
      service_exit_code_present=SIM
    fi
  fi
  [ "$(compose port addon-runtime-http-lab 7007 2>/dev/null || :)" = "127.0.0.1:${port}" ] && published_loopback_present=SIM
  marker_present EXPERIMENTAL_HTTP_STARTING && server_startup_marker_present=SIM
  marker_present EXPERIMENTAL_HTTP_LISTENING && server_listening_marker_present=SIM
  marker_present EXPERIMENTAL_HTTP_REQUEST_ACCEPTED && request_accepted_marker_present=SIM
  marker_present EXPERIMENTAL_HTTP_HEALTH_RESPONSE_STARTED && health_response_started_marker_present=SIM
  marker_present EXPERIMENTAL_HTTP_HEALTH_RESPONSE_COMPLETED && health_response_completed_marker_present=SIM

  if [ "$service_container_present" = NAO ]; then
    diagnostic_category=SERVICE_NOT_CREATED
  elif [ "$service_running_value" = NAO ]; then
    diagnostic_category=SERVICE_EXITED
  elif [ "$command_matches" = NAO ]; then
    diagnostic_category=COMMAND_MISMATCH
  elif marker_present EXPERIMENTAL_HTTP_CONFIGURATION_ERROR; then
    diagnostic_category=CONFIGURATION_MISSING
  elif [ "$server_listening_marker_present" = NAO ]; then
    diagnostic_category=LISTEN_NOT_CONFIRMED
  elif [ "$last_curl_status" -eq 56 ]; then
    diagnostic_category=CONNECTION_RESET
  else
    diagnostic_category=HEALTH_TIMEOUT
  fi

  printf '%s\n' \
    "serviceContainerPresent: $service_container_present" \
    "serviceRunning: $service_running_value" \
    "serviceExitCodePresent: $service_exit_code_present" \
    "expectedInternalPort: 7007" \
    "publishedLoopbackPresent: $published_loopback_present" \
    "serverStartupMarkerPresent: $server_startup_marker_present" \
    "serverListeningMarkerPresent: $server_listening_marker_present" \
    "requestAcceptedMarkerPresent: $request_accepted_marker_present" \
    "healthResponseStartedMarkerPresent: $health_response_started_marker_present" \
    "healthResponseCompletedMarkerPresent: $health_response_completed_marker_present" \
    "curlExitCategory: $curl_exit_category" \
    "httpStatusPresent: $http_status_present" \
    "httpStatusAccepted: $http_status_accepted" \
    "contentTypePresent: $content_type_present" \
    "contentTypeAccepted: $content_type_accepted" \
    "bodyPresent: $body_present" \
    "jsonValid: $json_valid" \
    "healthStatusValid: $health_status_valid" \
    "diagnosticCategory: $diagnostic_category"
}

if ! service_running; then
  emit_diagnostic
  main_status=1
  exit "$main_status"
fi

fetch_json() {
  kind=$1
  path=$2
  curl_exit_category=UNKNOWN
  http_status_present=NAO
  http_status_accepted=NAO
  content_type_present=NAO
  content_type_accepted=NAO
  body_present=NAO
  json_valid=NAO
  health_status_valid=NAO

  if local_http_get "$port" "$path" "$headers" "$body" "$status_file"; then
    last_curl_status=0
  else
    last_curl_status=$?
  fi
  case "$last_curl_status" in
    0) curl_exit_category=SUCCESS;;
    7) curl_exit_category=CONNECT_FAILED;;
    22) curl_exit_category=HTTP_ERROR;;
    28) curl_exit_category=TIMEOUT;;
    35|52) curl_exit_category=PROTOCOL_ERROR;;
    56) curl_exit_category=CONNECTION_RESET;;
    *) curl_exit_category=UNKNOWN;;
  esac

  http_status=$(sed -n '1p' "$status_file" | tr -d '\r\n')
  content_type=$(sed -n '2p' "$status_file" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
  case "$http_status" in [0-9][0-9][0-9]) http_status_present=SIM;; esac
  [ "$http_status" = 200 ] && http_status_accepted=SIM
  [ -n "$content_type" ] && content_type_present=SIM
  case "$content_type" in application/json|application/json\;*) content_type_accepted=SIM;; esac
  [ -s "$body" ] && body_present=SIM

  [ "$last_curl_status" -eq 0 ] || return 1
  [ "$http_status_accepted" = SIM ] || return 1
  [ "$content_type_accepted" = SIM ] || return 1
  [ "$body_present" = SIM ] || return 1
  if compose exec -T addon-runtime-http-lab /opt/runtime-tools/node_modules/.bin/tsx /workspace/lab/real-debrid-addon-runtime/tools/http-response-validator.ts "$kind" < "$body" >/dev/null 2>&1; then
    json_valid=SIM
    [ "$kind" != health ] || health_status_valid=SIM
  else
    return 1
  fi
}

attempt=0
while :; do
  if fetch_json health health; then break; fi
  if ! service_running; then
    emit_diagnostic
    main_status=1
    exit "$main_status"
  fi
  attempt=$((attempt + 1))
  [ "$attempt" -lt 5 ] || { emit_diagnostic; main_status=1; exit "$main_status"; }
  sleep 1
done
fetch_json manifest manifest.json || { main_status=1; exit "$main_status"; }
fetch_json stream stream/movie/tt0000001.json || { main_status=1; exit "$main_status"; }
