#!/usr/bin/env sh
set -eu

[ "$#" -eq 1 ] || { printf '%s\n' "Usage: $0 <one-allowed-indexer>" >&2; exit 1; }
LAB_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PROBE_INDEXER=$1
export PROBE_INDEXER

printf 'Executing one public probe for indexer: %s (no retry)\n' "$PROBE_INDEXER"
# PUBLIC_PROBE_ONCE
docker compose -f "$LAB_ROOT/compose.yml" run --rm -T probe lab/torrent-indexer-public-probe/tools/probe.ts
