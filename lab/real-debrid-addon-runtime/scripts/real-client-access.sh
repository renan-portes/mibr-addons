#!/bin/sh
# Explicitly authorized laboratory launcher. It never places a token in Compose.
set -eu
umask 077
main_status=0; cleaned=0; started=0; tmp_dir=; override=; secret=; candidates=; headers=; body=; metadata=
compose_file=lab/real-debrid-addon-runtime/compose.yml
invalid() { main_status=2; printf '%s\n' CONFIGURATION_INVALID; exit "$main_status"; }
cleanup() {
  [ "$cleaned" -eq 0 ] || return 0; cleaned=1
  if [ "$started" -eq 1 ]; then docker compose -f "$compose_file" -f "$override" --profile experimental-http down --remove-orphans >/dev/null 2>&1 || :; fi
  [ -z "$tmp_dir" ] || rm -f -- "$override" "$secret" "$candidates" "$headers" "$body" "$metadata" >/dev/null 2>&1 || :
  [ -z "$tmp_dir" ] || rmdir -- "$tmp_dir" >/dev/null 2>&1 || :
  unset REAL_DEBRID_TOKEN_FILE_HOST EXPERIMENTAL_ADDON_CANDIDATES_FILE_HOST REAL_DEBRID_ADDON_RUNTIME_ENABLED EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED
}
on_exit() { trap - EXIT; cleanup; exit "$main_status"; }
trap on_exit EXIT; trap 'main_status=130; exit 130' INT; trap 'main_status=143; exit 143' TERM; trap 'main_status=146; exit 146' TSTP
[ "${EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED:-}" = true ] || invalid
[ "${EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED:-}" = true ] || invalid
[ "${EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED:-}" = true ] || invalid
[ -n "${EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS:-}" ] || invalid
source_file=${EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE:-}; candidate_source=${EXPERIMENTAL_ADDON_CANDIDATES_FILE:-}; [ -f "$source_file" ] && [ ! -L "$source_file" ] && [ -f "$candidate_source" ] && [ ! -L "$candidate_source" ] || { printf '%s\n' TOKEN_FILE_INVALID; main_status=2; exit 2; }
[ -s "$source_file" ] && [ -n "$(tr -d '[:space:]' < "$source_file")" ] || { printf '%s\n' TOKEN_FILE_INVALID; main_status=2; exit 2; }
tmp_dir=$(mktemp -d); secret="$tmp_dir/real_debrid_token"; candidates="$tmp_dir/authorized_candidates.json"; override="$tmp_dir/compose.override.yml"; headers="$tmp_dir/headers"; body="$tmp_dir/body"; metadata="$tmp_dir/metadata"
cp -- "$source_file" "$secret" || { printf '%s\n' TOKEN_FILE_INVALID; main_status=2; exit 2; }
chown 1000:1000 "$secret" && chmod 400 "$secret" || { printf '%s\n' TOKEN_FILE_INVALID; main_status=2; exit 2; }
[ -s "$candidate_source" ] && cp -- "$candidate_source" "$candidates" && chown 1000:1000 "$candidates" && chmod 400 "$candidates" || { printf '%s\n' CONFIGURATION_INVALID; main_status=2; exit 2; }
[ -s "$secret" ] && [ "$(stat -c %a "$secret")" = 400 ] && [ "$(stat -c %u "$secret")" = 1000 ] && [ "$(stat -c %g "$secret")" = 1000 ] || { printf '%s\n' TOKEN_FILE_INVALID; main_status=2; exit 2; }
export REAL_DEBRID_TOKEN_FILE_HOST="$secret" EXPERIMENTAL_ADDON_CANDIDATES_FILE_HOST="$candidates" REAL_DEBRID_ADDON_RUNTIME_ENABLED=true
host=${EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST:-127.0.0.1}; port=${EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT:-17007}
case "$port" in ''|*[!0-9]*) invalid;; esac; [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || invalid
is_private_ipv4() { old_ifs=$IFS; IFS=.; set -- $1; IFS=$old_ifs; [ "$#" -eq 4 ] || return 1; for octet do case "$octet" in ''|*[!0-9]*) return 1;; esac; [ "$octet" -le 255 ] || return 1; done; [ "$1" -eq 10 ] && return 0; [ "$1" -eq 172 ] && [ "$2" -ge 16 ] && [ "$2" -le 31 ] && return 0; [ "$1" -eq 192 ] && [ "$2" -eq 168 ]; }
case "${EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE:-LOOPBACK}" in
  LOOPBACK) [ "$host" = 127.0.0.1 ] || invalid;;
  LAN) [ "${EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED:-}" = true ] || invalid; is_private_ipv4 "$host" || invalid; command -v ip >/dev/null 2>&1 || invalid; ip -o -4 addr show up | grep -Eq "[[:space:]]${host}/" || invalid;;
  *) invalid;;
esac
command -v ss >/dev/null 2>&1 || invalid
ss -H -ltn | awk '{print $4}' | grep -Eq "(^|:)${port}$" && invalid
cat > "$override" <<EOF
services:
  addon-runtime-http-lab:
    ports:
      - "${host}:${port}:7007"
EOF
chmod 600 "$override"; [ "$(wc -l < "$override" | tr -d ' ' )" = 4 ] || invalid
docker compose -f "$compose_file" -f "$override" --profile experimental-http config >/dev/null 2>&1 || invalid
started=1; docker compose -f "$compose_file" -f "$override" --profile experimental-http up -d addon-runtime-http-lab >/dev/null 2>&1 || invalid
validate_local_json() {
  request=$1
  : > "$headers"; : > "$body"; : > "$metadata"; chmod 600 "$headers" "$body" "$metadata"
  curl --silent --show-error --fail --http1.1 --noproxy '*' --proto '=http' --connect-timeout 2 --max-time 2 --max-redirs 0 --request GET --dump-header "$headers" --output "$body" --write-out '%{http_code}\n%{content_type}\n' "http://${host}:${port}/${request}" > "$metadata" 2>/dev/null || return 1
  [ "$(sed -n '1p' "$metadata" | tr -d '\r\n')" = 200 ] || return 1
  case "$(sed -n '2p' "$metadata" | tr -d '\r' | tr '[:upper:]' '[:lower:]')" in application/json|application/json\;*) :;; *) return 1;; esac
  [ -s "$body" ]
}
attempt=0
while ! validate_local_json health; do attempt=$((attempt + 1)); [ "$attempt" -lt 5 ] || { main_status=1; exit 1; }; sleep 1; done
validate_local_json manifest.json || { main_status=1; exit 1; }
printf '%s\n' CLIENT_ACCESS_READY REAL_DEBRID_MODE_ENABLED "accessMode: ${EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE:-LOOPBACK}" "hostPortPresent: SIM" "manifestPath: /manifest.json"
access_timeout=${EXPERIMENTAL_ADDON_CLIENT_ACCESS_TIMEOUT_SECONDS:-0}
case "$access_timeout" in ''|*[!0-9]*) invalid;; esac
[ "$access_timeout" -le 3600 ] || invalid
if [ "$access_timeout" -gt 0 ]; then sleep "$access_timeout"; exit 0; fi
while :; do sleep 60; done
