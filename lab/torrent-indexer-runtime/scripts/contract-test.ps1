$ErrorActionPreference = "Stop"

function Invoke-RuntimeContractTest {
  $script:ContractExitCode = 1
  $labRoot = Split-Path -Parent $PSScriptRoot
  $composeFile = Join-Path $labRoot "compose.yml"
  $toolsComposeFile = Join-Path $labRoot "compose.tools.yml"
  $envFile = Join-Path $labRoot ".env"
  if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Copy .env.example to .env and explicitly confirm authorization"
  }

  Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') {
      $value = $Matches[2].Trim()
      if ($value.Length -ge 2 -and $value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') {
        $value = $value.Substring(1, $value.Length - 2)
      }
      [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $value, "Process")
    }
  }

  $tempDir = Join-Path ([IO.Path]::GetTempPath()) "mibr-runtime-contract-$([guid]::NewGuid().ToString('N'))"
  $null = New-Item -ItemType Directory -Path $tempDir
  $rawFile = Join-Path $tempDir "http-response.raw"
  $bodyFile = Join-Path $tempDir "response.json"
  $stderrFile = Join-Path $tempDir "docker-stderr.log"
  $logFile = Join-Path $tempDir "error-logs.raw"
  $environmentFile = Join-Path $tempDir "environment.presence"
  $dnsFile = Join-Path $tempDir "dns.status"
  $egressFile = Join-Path $tempDir "egress.status"
  $flaresolverrLogFile = Join-Path $tempDir "flaresolverr-logs.raw"
  $markerFile = Join-Path $tempDir "query-marker.txt"
  $queryProcess = $null
  $queryStarted = $false
  [Environment]::SetEnvironmentVariable("CONTRACT_TEMP_DIR", $tempDir, "Process")
  [Environment]::SetEnvironmentVariable("CONTRACT_TOOLS_UID", "1000", "Process")
  [Environment]::SetEnvironmentVariable("CONTRACT_TOOLS_GID", "1000", "Process")

  function Invoke-Compose {
    & docker compose --env-file $envFile -f $composeFile @args
    if ($LASTEXITCODE -ne 0) { throw "docker compose failed: $($args -join ' ')" }
  }

  function Invoke-ToolsCompose {
    & docker compose --env-file $envFile -f $composeFile -f $toolsComposeFile @args
    if ($LASTEXITCODE -ne 0) { throw "docker compose tools failed: $($args -join ' ')" }
  }

  function Get-ContainerId([string]$Service) {
    $id = (& docker compose --env-file $envFile -f $composeFile ps -q $Service)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($id)) {
      throw "$Service container ID lookup failed"
    }
    return $id.Trim()
  }

  try {
    Write-Host "Validating the fixed, explicitly authorized query configuration..."
    Invoke-ToolsCompose build contract-tools
    Invoke-ToolsCompose run --rm -T contract-tools lab/torrent-indexer-runtime/tools/validate-config.ts

    Write-Host "Starting the pinned runtime-contract laboratory..."
    Invoke-Compose up -d --build --wait --wait-timeout 120

    Write-Host "Confirming that neither container publishes a host port..."
    foreach ($service in @("redis", "flaresolverr", "torrent-indexer")) {
      $containerId = Get-ContainerId $service
      $hostBindings = (& docker inspect --format '{{json .HostConfig.PortBindings}}' $containerId)
      if ($LASTEXITCODE -ne 0 -or $hostBindings.Trim() -ne "{}") { throw "$service has configured host bindings" }
      $runtimePorts = (& docker inspect --format '{{json .NetworkSettings.Ports}}' $containerId)
      if ($LASTEXITCODE -ne 0 -or $runtimePorts -match 'HostIp') { throw "$service has runtime host bindings" }
    }

    Write-Host "Executing the single authorized contract query (no retry)..."
    $queryMarker = [DateTimeOffset]::UtcNow.ToString("o")
    [IO.File]::WriteAllText($markerFile, $queryMarker)
    $timeout = [int]$env:CONTRACT_TEST_TIMEOUT_SECONDS
    $maxBytes = [int]$env:CONTRACT_TEST_MAX_RESPONSE_BYTES
    $request = "timeout ${timeout}s sh -c `"printf '%s\r\n%s\r\n%s\r\n\r\n' 'GET /indexers/$($env:CONTRACT_TEST_INDEXER)?q=Big%20Buck%20Bunny&filter_results=true&limit=1 HTTP/1.0' 'Host: 127.0.0.1' 'Connection: close' | nc -w $timeout 127.0.0.1 7006`" | head -c $($maxBytes + 1)"
    $arguments = @("compose", "--env-file", $envFile, "-f", $composeFile, "exec", "-T", "torrent-indexer", "sh", "-c", $request)
    $queryProcess = [Diagnostics.Process]::new()
    $queryProcess.StartInfo.FileName = "docker"
    $queryProcess.StartInfo.UseShellExecute = $false
    $queryProcess.StartInfo.RedirectStandardOutput = $true
    $queryProcess.StartInfo.RedirectStandardError = $true
    foreach ($argument in $arguments) { $null = $queryProcess.StartInfo.ArgumentList.Add($argument) }
    # CONTRACT_QUERY_ONCE
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $null = $queryProcess.Start()
    $queryStarted = $true
    $stdoutTask = $queryProcess.StandardOutput.ReadToEndAsync()
    $stderrTask = $queryProcess.StandardError.ReadToEndAsync()
    if (-not $queryProcess.WaitForExit(20 * 1000)) {
      $queryProcess.Kill($true)
      $queryProcess.WaitForExit()
      & docker compose --env-file $envFile -f $composeFile kill torrent-indexer 2>$null
      throw "consulta excedeu 20 segundos; the complete query process tree was terminated"
    }
    $stopwatch.Stop()
    [IO.File]::WriteAllText($rawFile, $stdoutTask.GetAwaiter().GetResult())
    [IO.File]::WriteAllText($stderrFile, $stderrTask.GetAwaiter().GetResult())
    if ($queryProcess.ExitCode -ne 0) { throw "Single contract query transport failed with exit $($queryProcess.ExitCode)" }
    $queryProcess = $null

    $responseBytes = (Get-Item -LiteralPath $rawFile).Length
    if ($responseBytes -gt $maxBytes) { throw "Response exceeded configured byte limit" }
    $raw = ([IO.File]::ReadAllText($rawFile) -replace "`r", "")
    $parts = $raw -split "`n`n", 2
    if ($parts.Count -ne 2 -or $parts[0] -notmatch '^HTTP/[0-9.]+\s+([0-9]{3})') {
      throw "Response did not contain a parseable HTTP status"
    }
    $httpCode = [int]$Matches[1]
    [IO.File]::WriteAllText($bodyFile, $parts[1])
    if ((Get-Item -LiteralPath $bodyFile).Length -eq 0) { throw "Response body was empty" }

    Write-Host "HTTP status: $httpCode"
    Write-Host "Duration: $($stopwatch.ElapsedMilliseconds) ms"
    Write-Host "Response size: $responseBytes bytes"
    if ($httpCode -ne 200) {
      Write-Host "Collecting sanitized failure diagnostics without printing raw response or logs."
      $logs = (& docker compose --env-file $envFile -f $composeFile logs --no-color --timestamps --since $queryMarker torrent-indexer 2>$null) -join "`n"
      [IO.File]::WriteAllText($logFile, $logs)
      $flaresolverrLogs = (& docker compose --env-file $envFile -f $composeFile logs --no-color --timestamps --since $queryMarker flaresolverr 2>$null) -join "`n"
      [IO.File]::WriteAllText($flaresolverrLogFile, $flaresolverrLogs)
      $presenceCommand = 'for name in FLARESOLVERR_ADDRESS FLARESOLVERR_POOL_SIZE REDIS_HOST REQUEST_TIMEOUT_MILLISECONDS; do if printenv "$name" >/dev/null 2>&1; then printf "%s=PRESENT\n" "$name"; else printf "%s=ABSENT\n" "$name"; fi; done'
      $presence = (& docker compose --env-file $envFile -f $composeFile exec -T torrent-indexer sh -c $presenceCommand 2>$null) -join "`n"
      [IO.File]::WriteAllText($environmentFile, $presence)
      & docker compose --env-file $envFile -f $composeFile exec -T torrent-indexer sh -c 'getent hosts torrent-indexer.darklyn.org >/dev/null 2>&1'
      [IO.File]::WriteAllText($dnsFile, $(if ($LASTEXITCODE -eq 0) { "AVAILABLE" } else { "UNAVAILABLE" }))
      & docker compose --env-file $envFile -f $composeFile exec -T torrent-indexer sh -c 'timeout 5s wget --spider -q https://torrent-indexer.darklyn.org/'
      [IO.File]::WriteAllText($egressFile, $(if ($LASTEXITCODE -eq 0) { "AVAILABLE" } else { "UNAVAILABLE" }))
      & docker compose --env-file $envFile -f $composeFile -f $toolsComposeFile run --rm -T contract-tools lab/torrent-indexer-runtime/tools/diagnose-error.ts /contract-input/response.json /contract-input/error-logs.raw /contract-input/environment.presence /contract-input/dns.status /contract-input/egress.status /contract-input/error-logs.raw /contract-input/flaresolverr-logs.raw /contract-input/query-marker.txt | ForEach-Object { Write-Host $_ }
      if ($LASTEXITCODE -ne 0) { throw "Sanitized error diagnosis failed" }
      $bodyFile = $null
      throw "Contract endpoint returned HTTP $httpCode"
    }
    Remove-Item -LiteralPath $rawFile -Force
    $rawFile = $null

    Write-Host "Producing the sanitized parser compatibility report..."
    & docker compose --env-file $envFile -f $composeFile -f $toolsComposeFile run --rm -T contract-tools lab/torrent-indexer-runtime/tools/analyze-response.ts /contract-input/response.json | ForEach-Object { Write-Host $_ }
    $analysisStatus = $LASTEXITCODE
    $bodyFile = $null

    if ($analysisStatus -eq 2) {
      Write-Host "Validação parcial: zero resultados. No second query was attempted."
      $script:ContractExitCode = 2
      return
    }
    if ($analysisStatus -ne 0) { throw "JSON/parser analysis failed" }
    $script:ContractExitCode = 0

    Write-Host "Contract test completed. No response values, magnets, hashes, trackers, titles, or URLs were printed."
  } finally {
    Write-Host "Cleanup: deleting temporary payloads, stopping containers, and removing the dedicated network."
    if ($queryStarted -and $null -ne $queryProcess -and -not $queryProcess.HasExited) {
      $queryProcess.Kill($true)
      $queryProcess.WaitForExit()
    }
    & docker compose --env-file $envFile -f $composeFile kill torrent-indexer 2>$null
    if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
    & docker compose --env-file $envFile -f $composeFile down --remove-orphans
    if ($LASTEXITCODE -ne 0) { Write-Warning "docker compose down failed" }
  }
}

try {
  & { Invoke-RuntimeContractTest }
  exit $script:ContractExitCode
} catch {
  Write-Error "Contract test failed without automatic query retry: $($_.Exception.Message)"
  exit 1
}
