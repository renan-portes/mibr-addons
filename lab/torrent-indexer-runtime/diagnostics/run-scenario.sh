#!/bin/sh
set -eu

scenario=${1:-}
case "$scenario" in
  A) scenario_file=compose.a.yml ;;
  B) scenario_file=compose.b.yml ;;
  C-cap-drop) scenario_file=compose.c-cap-drop.yml ;;
  C-no-nnp) scenario_file=compose.c-no-nnp.yml ;;
  D) scenario_file=compose.d.yml ;;
  *)
    printf '%s\n' 'usage: run-scenario.sh A|B|C-cap-drop|C-no-nnp|D' >&2
    exit 64
    ;;
esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
base_file=$script_dir/compose.diagnostic-base.yml
override_file=$script_dir/$scenario_file
project=mibr-flaresolverr-diagnostic-$(printf '%s' "$scenario" | tr '[:upper:]' '[:lower:]')
evidence_dir=$(mktemp -d "${TMPDIR:-/tmp}/mibr-flaresolverr-${scenario}.XXXXXX")
started_at=$(date +%s)
container_started=false
browser_test_passed=false
api_internal=false
exit_code=unavailable
restart_count=unavailable
category=UNDETERMINED
container_id=

compose() {
  docker compose -p "$project" -f "$base_file" -f "$override_file" "$@"
}

cleanup() {
  compose down --remove-orphans --volumes >/dev/null 2>&1 || :
}
trap cleanup EXIT INT TERM

compose up -d --build flaresolverr >/dev/null
container_id=$(compose ps -q flaresolverr)
if [ -n "$container_id" ]; then
  container_started=true
fi

deadline=$((started_at + 120))
while [ "$(date +%s)" -lt "$deadline" ]; do
  compose logs --no-color flaresolverr >"$evidence_dir/container.log" 2>&1 || :
  docker top "$container_id" -eo pid,ppid,user,stat,args >"$evidence_dir/processes.txt" 2>&1 || :
  compose exec -T flaresolverr sh -c '
    for pid in $(pgrep -f "chromium|chromedriver" 2>/dev/null || true); do
      printf "===== pid=%s =====\n" "$pid"
      cat "/proc/$pid/status" 2>/dev/null || true
    done
  ' >"$evidence_dir/proc-status.txt" 2>&1 || :

  if grep -q 'Test successful!' "$evidence_dir/container.log"; then
    browser_test_passed=true
  fi
  if compose exec -T flaresolverr python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8191/', timeout=2)" >/dev/null 2>&1; then
    api_internal=true
  fi
  if [ "$browser_test_passed" = true ] && [ "$api_internal" = true ]; then
    break
  fi

  state=$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || printf unknown)
  if [ "$state" = exited ] || [ "$state" = dead ]; then
    break
  fi
  sleep 2
done

compose logs --no-color flaresolverr >"$evidence_dir/container.log" 2>&1 || :
docker inspect "$container_id" >"$evidence_dir/container-inspect.json" 2>/dev/null || :
exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$container_id" 2>/dev/null || printf unavailable)
restart_count=$(docker inspect --format '{{.RestartCount}}' "$container_id" 2>/dev/null || printf unavailable)
status=$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || printf unavailable)
duration=$(( $(date +%s) - started_at ))

if [ "$browser_test_passed" = true ] && [ "$api_internal" = true ]; then
  category=FUNCTIONAL
elif [ "$scenario" = A ]; then
  category=BASELINE_OR_HOST
elif [ "$scenario" = C-cap-drop ]; then
  category=CAP_DROP_ALL
elif [ "$scenario" = C-no-nnp ]; then
  category=NO_NEW_PRIVILEGES_OR_FILESYSTEM
elif [ "$scenario" = D ]; then
  category=FILESYSTEM_OR_HOST
else
  category=HARDENING_OR_FILESYSTEM
fi

printf 'scenario=%s\n' "$scenario"
printf 'container_started=%s\n' "$container_started"
printf 'browser_test_passed=%s\n' "$browser_test_passed"
printf 'api_internal=%s\n' "$api_internal"
printf 'container_status=%s\n' "$status"
printf 'exit_code=%s\n' "$exit_code"
printf 'restart_count=%s\n' "$restart_count"
printf 'duration_seconds=%s\n' "$duration"
printf 'probable_category=%s\n' "$category"
printf 'evidence_dir=%s\n' "$evidence_dir"
