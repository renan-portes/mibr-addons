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
main_status=0
cleaned=0
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

if ! service_running; then
  printf '%s\n' SERVICE_EXITED
  main_status=1
  exit "$main_status"
fi

fetch_json() {
  path=$1
  : > "$headers"; : > "$body"
  curl --silent --show-error --max-time 2 --max-redirs 0 --noproxy '*' -D "$headers" -o "$body" -w '%{http_code}' "http://127.0.0.1:${port}/${path}" > "$status_file" || return 1
  [ "$(cat "$status_file")" = 200 ] || return 1
  grep -Eiq '^content-type:[[:space:]]*application/json([;[:space:]]|$)' "$headers" || return 1
  node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$body" >/dev/null 2>&1 || return 1
}

attempt=0
while :; do
  if fetch_json health && node -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.exit(x.status === "ok" ? 0 : 1)' "$body" >/dev/null 2>&1; then break; fi
  if ! service_running; then
    printf '%s\n' SERVICE_EXITED
    main_status=1
    exit "$main_status"
  fi
  attempt=$((attempt + 1))
  [ "$attempt" -lt 5 ] || { printf '%s\n' HEALTH_TIMEOUT; main_status=1; exit "$main_status"; }
  sleep 1
done
fetch_json manifest.json || { main_status=1; exit "$main_status"; }
node -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.exit(typeof x.id === "string" && typeof x.name === "string" && Array.isArray(x.resources) ? 0 : 1)' "$body" >/dev/null 2>&1 || { main_status=1; exit "$main_status"; }
fetch_json stream/movie/tt0000001.json || { main_status=1; exit "$main_status"; }
node -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.exit(Array.isArray(x.streams) ? 0 : 1)' "$body" >/dev/null 2>&1 || { main_status=1; exit "$main_status"; }
