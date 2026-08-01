$ErrorActionPreference = "Stop"

function Invoke-RuntimeContractTest {
  $script:ContractExitCode = 1
  $labRoot = Split-Path -Parent $PSScriptRoot
  $repoRoot = Split-Path -Parent (Split-Path -Parent $labRoot)
  $composeFile = Join-Path $labRoot "compose.yml"
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

  $rawFile = [IO.Path]::GetTempFileName()
  $bodyFile = [IO.Path]::GetTempFileName()
  $stderrFile = [IO.Path]::GetTempFileName()

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

  try {
    Write-Host "Validating the fixed, explicitly authorized query configuration..."
    Push-Location $repoRoot
    try {
      & npx --no-install tsx lab/torrent-indexer-runtime/tools/validate-config.ts
      if ($LASTEXITCODE -ne 0) { throw "Configuration validation failed" }
    } finally { Pop-Location }

    Write-Host "Starting the pinned runtime-contract laboratory..."
    Invoke-Compose up -d --build --wait --wait-timeout 120

    Write-Host "Confirming that neither container publishes a host port..."
    foreach ($service in @("redis", "torrent-indexer")) {
      $containerId = Get-ContainerId $service
      $hostBindings = (& docker inspect --format '{{json .HostConfig.PortBindings}}' $containerId)
      if ($LASTEXITCODE -ne 0 -or $hostBindings.Trim() -ne "{}") { throw "$service has configured host bindings" }
      $runtimePorts = (& docker inspect --format '{{json .NetworkSettings.Ports}}' $containerId)
      if ($LASTEXITCODE -ne 0 -or $runtimePorts -match 'HostIp') { throw "$service has runtime host bindings" }
    }

    Write-Host "Executing the single authorized contract query (no retry)..."
    $timeout = [int]$env:CONTRACT_TEST_TIMEOUT_SECONDS
    $maxBytes = [int]$env:CONTRACT_TEST_MAX_RESPONSE_BYTES
    $request = "timeout ${timeout}s sh -c `"printf 'GET /indexers/$($env:CONTRACT_TEST_INDEXER)?q=Big%20Buck%20Bunny&filter_results=true&limit=1 HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n' | nc -w $timeout 127.0.0.1 7006`" | head -c $($maxBytes + 1)"
    $arguments = @("compose", "--env-file", $envFile, "-f", $composeFile, "exec", "-T", "torrent-indexer", "sh", "-c", $request)
    $process = [Diagnostics.Process]::new()
    $process.StartInfo.FileName = "docker"
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    foreach ($argument in $arguments) { $null = $process.StartInfo.ArgumentList.Add($argument) }
    # CONTRACT_QUERY_ONCE
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $null = $process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(20 * 1000)) {
      $process.Kill($true)
      throw "Single contract query exceeded the global timeout"
    }
    $stopwatch.Stop()
    [IO.File]::WriteAllText($rawFile, $stdoutTask.GetAwaiter().GetResult())
    [IO.File]::WriteAllText($stderrFile, $stderrTask.GetAwaiter().GetResult())
    if ($process.ExitCode -ne 0) { throw "Single contract query transport failed with exit $($process.ExitCode)" }

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
    if ($httpCode -ne 200) { throw "Contract endpoint returned HTTP $httpCode" }

    Write-Host "Producing the sanitized parser compatibility report..."
    Push-Location $repoRoot
    try {
      & npx --no-install tsx lab/torrent-indexer-runtime/tools/analyze-response.ts $bodyFile | ForEach-Object { Write-Host $_ }
      $analysisStatus = $LASTEXITCODE
    } finally { Pop-Location }
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
    foreach ($path in @($rawFile, $bodyFile, $stderrFile)) {
      if (-not [string]::IsNullOrWhiteSpace($path)) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
    }
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
