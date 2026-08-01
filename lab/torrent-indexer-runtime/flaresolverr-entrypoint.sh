#!/bin/sh
set -eu

runtime_dir=/app/.local
driver_original=/app/chromedriver.original
driver_runtime=/app/.local/chromedriver

if [ "$(id -u)" -eq 0 ]; then
  printf '%s\n' "FlareSolverr runtime must not run as root" >&2
  exit 1
fi

if [ ! -w "$runtime_dir" ]; then
  printf '%s\n' "FlareSolverr runtime directory is not writable: $runtime_dir" >&2
  exit 1
fi

if [ ! -f "$driver_original" ]; then
  printf '%s\n' "Original ChromeDriver is missing: $driver_original" >&2
  exit 1
fi

umask 022
cp "$driver_original" "$driver_runtime"
chmod 0755 "$driver_runtime"

exec "$@"
