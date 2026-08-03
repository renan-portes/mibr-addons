#!/bin/sh
set -eu
umask 077

lab_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$lab_dir/compose.yml"

main_status=0
cleaned=0
started=0
tmp_dir=
override=
placeholder=
headers=
body=
metadata=
compose_stdout=
compose_stderr=
access_mode=${EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE:-LOOPBACK}
host=${EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST:-127.0.0.1}
port=${EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT-17007}
access_timeout=${EXPERIMENTAL_ADDON_CLIENT_ACCESS_TIMEOUT_SECONDS-0}

cleanup() {
  [ "$cleaned" -eq 0 ] || return 0
  cleaned=1
  if [ "$started" -eq 1 ] && [ -n "$override" ]; then
    if ! docker compose -f "$compose_file" -f "$override" --profile experimental-http down --remove-orphans >"$compose_stdout" 2>"$compose_stderr"; then
      printf '%s\n' COMPOSE_DOWN_FAILED
    fi
  fi
  [ -z "$tmp_dir" ] || rm -f -- "$override" "$placeholder" "$headers" "$body" "$metadata" "$compose_stdout" "$compose_stderr" >/dev/null 2>&1 || :
  [ -z "$tmp_dir" ] || rmdir -- "$tmp_dir" >/dev/null 2>&1 || :
  unset REAL_DEBRID_TOKEN_FILE_HOST REAL_DEBRID_ADDON_RUNTIME_ENABLED
  unset EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED
  unset EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT EXPERIMENTAL_ADDON_CLIENT_ACCESS_TIMEOUT_SECONDS
}
on_exit() { trap - EXIT; cleanup; exit "$main_status"; }
trap on_exit EXIT
trap 'main_status=130; exit "$main_status"' INT
trap 'main_status=143; exit "$main_status"' TERM
trap 'main_status=146; exit "$main_status"' TSTP

invalid() { main_status=2; exit "$main_status"; }
[ "${EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED:-}" = true ] || invalid
[ "${REAL_DEBRID_ADDON_RUNTIME_ENABLED:-false}" = false ] || invalid
export REAL_DEBRID_ADDON_RUNTIME_ENABLED=false

case "$port" in *[!0-9]*|'') invalid;; esac
[ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || invalid
case "$access_timeout" in *[!0-9]*|'') invalid;; esac
[ "$access_timeout" -le 3600 ] || invalid

is_private_ipv4() {
  old_ifs=$IFS
  IFS=.
  set -- $1
  IFS=$old_ifs
  [ "$#" -eq 4 ] || return 1
  for octet do
    case "$octet" in ''|*[!0-9]*) return 1;; esac
    [ "$octet" -le 255 ] || return 1
  done
  [ "$1" -eq 10 ] && return 0
  [ "$1" -eq 172 ] && [ "$2" -ge 16 ] && [ "$2" -le 31 ] && return 0
  [ "$1" -eq 192 ] && [ "$2" -eq 168 ] && return 0
  return 1
}

case "$access_mode" in
  LOOPBACK) [ "$host" = 127.0.0.1 ] || invalid;;
  LAN)
    [ "${EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED:-}" = true ] || invalid
    [ -n "${EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST:-}" ] || invalid
    is_private_ipv4 "$host" || invalid
    command -v ip >/dev/null 2>&1 || invalid
    ip -o -4 addr show up | grep -Eq "[[:space:]]${host}/" || invalid
    ;;
  *) invalid;;
esac

command -v ss >/dev/null 2>&1 || invalid
if ss -H -ltn | awk '{print $4}' | grep -Eq "(^|:)${port}$"; then invalid; fi

tmp_dir=$(mktemp -d)
override="$tmp_dir/compose.override.yml"
placeholder="$tmp_dir/real_debrid_token"
headers="$tmp_dir/headers"
body="$tmp_dir/body"
metadata="$tmp_dir/metadata"
compose_stdout="$tmp_dir/compose.stdout"
compose_stderr="$tmp_dir/compose.stderr"

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
      - "${host}:${port}:7007"
EOF
chmod 600 "$override"
[ -f "$override" ] && [ ! -L "$override" ] && [ "$(stat -c %a "$override")" = 600 ] || invalid
[ "$(wc -l < "$override" | tr -d '[:space:]')" = 4 ] || invalid
[ "$(sed -n '1p' "$override")" = services: ] || invalid
[ "$(sed -n '2p' "$override")" = '  addon-runtime-http-lab:' ] || invalid
[ "$(sed -n '3p' "$override")" = '    ports:' ] || invalid
[ "$(sed -n '4p' "$override")" = "      - \"${host}:${port}:7007\"" ] || invalid

: > "$compose_stdout"; : > "$compose_stderr"
chmod 600 "$compose_stdout" "$compose_stderr"

compose() { docker compose -f "$compose_file" -f "$override" --profile experimental-http "$@"; }
client_http_get() {
  request_path=$1
  : > "$headers"; : > "$body"; : > "$metadata"
  chmod 600 "$headers" "$body" "$metadata"
  curl --silent --show-error --fail --http1.1 --noproxy '*' --proto '=http' \
    --connect-timeout 2 --max-time 2 --max-redirs 0 --request GET \
    --dump-header "$headers" --output "$body" \
    --write-out '%{http_code}\n%{content_type}\n' \
    "http://${host}:${port}/${request_path}" > "$metadata" 2>/dev/null
}
validate_response() {
  kind=$1
  path=$2
  client_http_get "$path" || return 1
  http_status=$(sed -n '1p' "$metadata" | tr -d '\r\n')
  content_type=$(sed -n '2p' "$metadata" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
  [ "$http_status" = 200 ] || return 1
  case "$content_type" in application/json|application/json\;*) :;; *) return 1;; esac
  [ -s "$body" ] || return 1
  compose exec -T addon-runtime-http-lab /opt/runtime-tools/node_modules/.bin/tsx /workspace/lab/real-debrid-addon-runtime/tools/http-response-validator.ts "$kind" < "$body" >/dev/null 2>&1
}

if compose config >"$compose_stdout" 2>"$compose_stderr"; then :; else
  main_status=$?
  printf '%s\n' COMPOSE_CONFIG_FAILED
  exit "$main_status"
fi
started=1
if compose up -d addon-runtime-http-lab >"$compose_stdout" 2>"$compose_stderr"; then :; else
  main_status=$?
  printf '%s\n' COMPOSE_UP_FAILED
  exit "$main_status"
fi

attempt=0
while ! validate_response health health; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 5 ] || { main_status=1; exit "$main_status"; }
  sleep 1
done
validate_response manifest manifest.json || { main_status=1; exit "$main_status"; }
validate_response stream stream/movie/tt0000001.json || { main_status=1; exit "$main_status"; }

printf '%s\n' \
  CLIENT_ACCESS_READY \
  "accessMode: $access_mode" \
  "hostPortPresent: SIM" \
  "manifestPath: /manifest.json"

if [ "$access_timeout" -gt 0 ]; then
  sleep "$access_timeout"
  exit 0
fi
while :; do sleep 60; done
