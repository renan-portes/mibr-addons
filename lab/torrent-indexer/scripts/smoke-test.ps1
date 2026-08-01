$ErrorActionPreference = "Stop"

$labRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $labRoot "compose.yml"
$envFile = Join-Path $labRoot ".env"
if (-not (Test-Path -LiteralPath $envFile)) {
  $envFile = Join-Path $labRoot ".env.example"
}

function Invoke-Compose {
  & docker compose --env-file $envFile -f $composeFile @args
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed: $($args -join ' ')"
  }
}

function Get-HttpResponse([string]$Uri) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 10
    return @{ Status = [int]$response.StatusCode; Body = $response.Content }
  } catch {
    if ($null -eq $_.Exception.Response) { throw }
    $response = $_.Exception.Response
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    try {
      return @{ Status = [int]$response.StatusCode; Body = $reader.ReadToEnd() }
    } finally {
      $reader.Dispose()
    }
  }
}

try {
  Invoke-Compose up -d --build --wait --wait-timeout 120

  $running = (& docker compose --env-file $envFile -f $composeFile ps --status running --services)
  if ($running -notcontains "redis" -or $running -notcontains "torrent-indexer") {
    throw "Expected containers are not running"
  }

  $redisPing = (& docker compose --env-file $envFile -f $composeFile exec -T redis redis-cli ping)
  if ($LASTEXITCODE -ne 0 -or $redisPing.Trim() -ne "PONG") {
    throw "Redis health check failed"
  }

  $redisPort = (& docker compose --env-file $envFile -f $composeFile port redis 6379 2>$null)
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($redisPort)) {
    throw "Redis must not publish a host port"
  }

  $appPort = (& docker compose --env-file $envFile -f $composeFile port torrent-indexer 7006)
  $metricsPort = (& docker compose --env-file $envFile -f $composeFile port torrent-indexer 8081)
  if ($appPort -notmatch '^127\.0\.0\.1:' -or $metricsPort -notmatch '^127\.0\.0\.1:') {
    throw "Published ports must bind only to 127.0.0.1"
  }

  $root = Get-HttpResponse "http://$appPort/"
  if ($root.Status -ne 200) { throw "Root endpoint returned HTTP $($root.Status)" }
  $null = $root.Body | ConvertFrom-Json

  $health = Get-HttpResponse "http://$appPort/search/health"
  if ($health.Status -notin @(200, 503)) { throw "Health endpoint returned HTTP $($health.Status)" }
  $null = $health.Body | ConvertFrom-Json

  $metrics = Get-HttpResponse "http://$metricsPort/metrics"
  if ($metrics.Status -ne 200) { throw "Metrics endpoint returned HTTP $($metrics.Status)" }

  $containerIds = (& docker compose --env-file $envFile -f $composeFile ps -q)
  if ($LASTEXITCODE -ne 0 -or $containerIds.Count -eq 0) { throw "Unable to resolve container IDs" }
  & docker stats --no-stream $containerIds
  if ($LASTEXITCODE -ne 0) { throw "Unable to collect container resource usage" }

  $logs = (& docker compose --env-file $envFile -f $composeFile logs --no-color)
  if ($logs -match '(?i)(password|token|secret|cookie)\s*[=:]\s*\S+') {
    throw "Logs may contain credential-like data"
  }

  Write-Host "Safe localhost smoke tests passed. No search endpoint was called."
} finally {
  & docker compose --env-file $envFile -f $composeFile down --remove-orphans
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "docker compose down failed"
  }
}
