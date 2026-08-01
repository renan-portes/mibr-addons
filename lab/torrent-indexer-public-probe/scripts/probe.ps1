$ErrorActionPreference = "Stop"

if ($args.Count -ne 1) { throw "Usage: probe.ps1 <one-allowed-indexer>" }
$env:PROBE_INDEXER = $args[0]
$labRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Executing one public probe for indexer: $($env:PROBE_INDEXER) (no retry)"
# PUBLIC_PROBE_ONCE
& docker compose -f (Join-Path $labRoot "compose.yml") run --rm -T probe lab/torrent-indexer-public-probe/tools/probe.ts
exit $LASTEXITCODE
