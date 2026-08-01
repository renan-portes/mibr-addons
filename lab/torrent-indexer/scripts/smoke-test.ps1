$ErrorActionPreference = "Stop"

function Invoke-LabSmokeTests {
  $labRoot = Split-Path -Parent $PSScriptRoot
  $composeFile = Join-Path $labRoot "compose.yml"
  $envFile = Join-Path $labRoot ".env"
  if (-not (Test-Path -LiteralPath $envFile)) {
    $envFile = Join-Path $labRoot ".env.example"
  }

  function Invoke-Compose {
    & docker compose --env-file $envFile -f $composeFile @args
    if ($LASTEXITCODE -ne 0) { throw "docker compose failed: $($args -join ' ')" }
  }

  function Get-ContainerId([string]$Service) {
    $id = (& docker compose --env-file $envFile -f $composeFile ps -q $Service)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($id)) {
      throw "$Service container ID lookup failed"
    }
    return $id.Trim()
  }

  function Invoke-InternalHttpProbe([int]$Port, [string]$Path) {
    $command = "printf 'GET $Path HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n' | nc -w 10 127.0.0.1 $Port"
    $raw = (& docker compose --env-file $envFile -f $composeFile exec -T torrent-indexer sh -c $command)
    if ($LASTEXITCODE -ne 0) { throw "GET $Path transport failed" }
    $text = (($raw -join "`n") -replace "`r", "")
    $parts = $text -split "`n`n", 2
    if ($parts.Count -ne 2 -or $parts[0] -notmatch '^HTTP/[0-9.]+\s+([0-9]{3})') {
      throw "GET $Path did not return a parseable HTTP response"
    }
    return @{ Status = [int]$Matches[1]; Body = $parts[1] }
  }

  try {
    Write-Host "Starting the pinned laboratory build and containers..."
    Invoke-Compose up -d --build --wait --wait-timeout 120

    Write-Host "Checking that Redis and torrent-indexer are running..."
    $running = (& docker compose --env-file $envFile -f $composeFile ps --status running --services)
    if ($LASTEXITCODE -ne 0) { throw "Container status query failed" }
    if ($running -notcontains "redis") { throw "Redis is not running" }
    if ($running -notcontains "torrent-indexer") { throw "torrent-indexer is not running" }

    Write-Host "Checking Redis health inside its container..."
    $redisPing = (& docker compose --env-file $envFile -f $composeFile exec -T redis redis-cli ping)
    if ($LASTEXITCODE -ne 0 -or $redisPing.Trim() -ne "PONG") { throw "Redis PING failed" }

    Write-Host "Checking with docker inspect that neither container publishes host ports..."
    foreach ($service in @("redis", "torrent-indexer")) {
      $containerId = Get-ContainerId $service
      $hostConfig = (& docker inspect --format '{{json .HostConfig.PortBindings}}' $containerId)
      if ($LASTEXITCODE -ne 0) { throw "$service HostConfig inspection failed" }
      $networkPorts = (& docker inspect --format '{{json .NetworkSettings.Ports}}' $containerId)
      if ($LASTEXITCODE -ne 0) { throw "$service NetworkSettings inspection failed" }
      if ($hostConfig.Trim() -ne "{}") { throw "$service has configured host port bindings: $hostConfig" }
      if ($networkPorts -match 'HostIp') { throw "$service has runtime host port bindings: $networkPorts" }
    }

    Write-Host "Checking the safe root endpoint from inside torrent-indexer..."
    $root = (& docker compose --env-file $envFile -f $composeFile exec -T torrent-indexer wget -qO- http://127.0.0.1:7006/)
    if ($LASTEXITCODE -ne 0) { throw "GET / failed" }
    $rootJson = $root | ConvertFrom-Json
    if ($null -eq $rootJson.endpoints) { throw "GET / returned unexpected JSON" }

    Write-Host "Checking the safe search health endpoint from inside torrent-indexer..."
    $health = Invoke-InternalHttpProbe 7006 "/search/health"
    if ($health.Status -notin @(200, 503)) { throw "GET /search/health returned HTTP $($health.Status) (expected 200 or 503)" }
    if ([string]::IsNullOrWhiteSpace($health.Body)) { throw "GET /search/health returned an empty body with HTTP $($health.Status)" }
    try { $null = $health.Body | ConvertFrom-Json -ErrorAction Stop } catch { throw "GET /search/health returned invalid JSON with HTTP $($health.Status)" }
    Write-Host "GET /search/health returned expected HTTP $($health.Status) with valid JSON."

    Write-Host "Checking the safe metrics endpoint from inside torrent-indexer..."
    $metrics = Invoke-InternalHttpProbe 8081 "/metrics"
    if ($metrics.Status -ne 200) { throw "GET /metrics returned HTTP $($metrics.Status) (expected 200)" }
    if ($metrics.Body -notmatch '(?m)^(# (HELP|TYPE) |[a-zA-Z_:][a-zA-Z0-9_:]*(\{|\s))') { throw "Metrics response is not recognizable Prometheus text" }
    Write-Host "GET /metrics returned expected HTTP 200 with Prometheus text."

    Write-Host "Collecting one resource-usage snapshot..."
    $containerIds = (& docker compose --env-file $envFile -f $composeFile ps -q)
    if ($LASTEXITCODE -ne 0 -or $containerIds.Count -eq 0) { throw "Container ID collection failed" }
    & docker stats --no-stream $containerIds
    if ($LASTEXITCODE -ne 0) { throw "docker stats failed" }

    Write-Host "Checking logs for credential-like values..."
    $logs = (& docker compose --env-file $envFile -f $composeFile logs --no-color)
    if ($LASTEXITCODE -ne 0) { throw "Log collection failed" }
    if ($logs -match '(?i)(password|token|secret|cookie)\s*[=:]\s*\S+') {
      throw "Logs may contain credential-like data"
    }

    Write-Host "All isolated smoke tests passed. No search or indexer endpoint was called."
  } finally {
    Write-Host "Cleanup: stopping and removing laboratory resources."
    & docker compose --env-file $envFile -f $composeFile down --remove-orphans
    if ($LASTEXITCODE -ne 0) { Write-Warning "docker compose down failed" }
  }
}

try {
  & { Invoke-LabSmokeTests }
} catch {
  Write-Error "Smoke test failed: $($_.Exception.Message)"
  exit 1
}
