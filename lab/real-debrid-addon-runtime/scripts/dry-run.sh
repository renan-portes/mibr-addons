#!/bin/sh
set -eu
umask 077

lab_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$lab_dir/compose.yml"
temp_dir=$(mktemp -d)
placeholder="$temp_dir/real_debrid_token"
config_file="$temp_dir/compose-config.json"
main_status=0
cleanup_done=0

cleanup() {
  [ "$cleanup_done" -eq 0 ] || return 0
  cleanup_done=1
  docker compose -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || :
  rm -f -- "$placeholder" "$config_file" || :
  rmdir -- "$temp_dir" || :
  unset REAL_DEBRID_TOKEN_FILE_HOST REAL_DEBRID_ADDON_RUNTIME_ENABLED
  # Cleanup is best-effort and never changes the result of the one dry-run.
}

on_exit() { trap - EXIT; cleanup; exit "$main_status"; }
on_int() { main_status=130; exit "$main_status"; }
on_term() { main_status=143; exit "$main_status"; }
on_tstp() { main_status=146; exit "$main_status"; }
trap on_exit EXIT
trap on_int INT
trap on_term TERM
trap on_tstp TSTP

if [ -n "${REAL_DEBRID_TOKEN:-}" ]; then
  main_status=2
  exit "$main_status"
fi
if [ "${REAL_DEBRID_ADDON_RUNTIME_ENABLED:-false}" != "false" ]; then
  main_status=2
  exit "$main_status"
fi

: > "$placeholder"
chmod 400 "$placeholder"
[ -f "$placeholder" ] && [ ! -s "$placeholder" ] && [ "$(stat -c %a "$placeholder")" = "400" ] || {
  main_status=2
  exit "$main_status"
}

export REAL_DEBRID_TOKEN_FILE_HOST="$placeholder"
export REAL_DEBRID_ADDON_RUNTIME_ENABLED=false

docker compose -f "$compose_file" config --format json > "$config_file" || {
  main_status=$?
  exit "$main_status"
}
# The versioned lab has one service and no published ports. Do not print its rendered config.
if grep -Eq '"ports"[[:space:]]*:[[:space:]]*\[[[:space:]]*[^]]' "$config_file"; then
  main_status=2
  exit "$main_status"
fi

set +e
docker compose -f "$compose_file" run --rm --no-deps addon-runtime-lab
main_status=$?
set -e
exit "$main_status"
