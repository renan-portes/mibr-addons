$ErrorActionPreference = 'Stop'
$labRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $labRoot '.env'
$composeFile = Join-Path $labRoot 'compose.yml'
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("mibr-rd-runtime-" + [guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $tempDir)
$secretFile = Join-Path $tempDir 'real_debrid_token'
$overrideFile = Join-Path $tempDir 'secret.override.yml'
$script:runtimeProcess = $null
$script:cleanupDone = $false
$script:cancelRequested = $false

function Invoke-ComposeCleanup {
  if ($script:cleanupDone) { return }
  $script:cleanupDone = $true
  try { & docker compose --env-file $envFile -f $composeFile -f $overrideFile down --remove-orphans *> $null } catch { }
}

function Stop-RuntimeTree {
  if ($null -ne $script:runtimeProcess -and -not $script:runtimeProcess.HasExited) {
    try { & taskkill /PID $script:runtimeProcess.Id /T /F *> $null } catch { try { Stop-Process -Id $script:runtimeProcess.Id -Force } catch { } }
  }
}

try {
  throw 'PowerShell runtime is pending validation of UID 1000 bind-mount ownership; use the validated POSIX launcher.'
  if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) { throw 'Copy .env.example to .env.' }
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $unsafeAcl = (Get-Acl -LiteralPath $envFile).Access | Where-Object {
    $_.AccessControlType -eq 'Allow' -and
    $_.FileSystemRights.ToString() -match '(Read|Write|Modify|FullControl)' -and
    $_.IdentityReference.Value -notin @($currentIdentity, 'NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')
  }
  if ($null -ne $unsafeAcl) { throw '.env ACL must be restricted to the operator.' }
  $lines = Get-Content -LiteralPath $envFile
  if ($lines -notcontains 'REAL_DEBRID_AUTHORIZED=true') { throw 'Explicit authorization is required.' }
  $tokenLine = $lines | Where-Object { $_ -match '^REAL_DEBRID_API_TOKEN=.+$' } | Select-Object -First 1
  if ($null -eq $tokenLine) { throw 'API token is missing.' }
  $token = $tokenLine.Substring('REAL_DEBRID_API_TOKEN='.Length)
  if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -gt 4096 -or $token -match '[\r\n\x00]') { throw 'API token is invalid.' }
  [System.IO.File]::WriteAllText($secretFile, $token, [System.Text.UTF8Encoding]::new($false))
  $token = $null; $tokenLine = $null
  & icacls $secretFile /inheritance:r /grant:r "${env:USERNAME}:(R)" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict token file ACL.' }
  $yamlPath = $secretFile.Replace("'", "''")
  [System.IO.File]::WriteAllText($overrideFile, "services:`n  runtime-tools:`n    volumes:`n      - type: bind`n        source: '$yamlPath'`n        target: /run/secrets/real_debrid_token`n        read_only: true`n", [System.Text.UTF8Encoding]::new($false))
  $modeLine = $lines | Where-Object { $_ -match '^REAL_DEBRID_TEST_MODE=(account|candidate)$' } | Select-Object -First 1
  if ($null -eq $modeLine) { throw 'Test mode must be account or candidate.' }
  $mode = $modeLine.Substring('REAL_DEBRID_TEST_MODE='.Length)
  if ($mode -eq 'candidate') {
    if ($env:REAL_DEBRID_CANDIDATE_AUTHORIZED -ne 'true') { throw 'Candidate mode requires a second explicit authorization.' }
    foreach ($name in 'REAL_DEBRID_CANDIDATE_MAGNET','REAL_DEBRID_CANDIDATE_INFO_HASH','REAL_DEBRID_CANDIDATE_FILE_PATH','REAL_DEBRID_CANDIDATE_FILE_BYTES') {
      if ([string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name))) { throw 'Candidate mode requires temporary authorized input.' }
    }
  }

  & docker compose --env-file $envFile -f $composeFile -f $overrideFile build runtime-tools *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Tools image build failed.' }
  # RUNTIME_INVOCATION_ONCE: one disposable container, no automatic repetition.
  $stdoutFile = Join-Path $tempDir 'result.json'
  $stderrFile = Join-Path $tempDir 'runtime.stderr'
  $arguments = @('compose','--env-file',$envFile,'-f',$composeFile,'-f',$overrideFile,'run','--rm','-T','runtime-tools')
  $cancelHandler = [ConsoleCancelEventHandler]{ param($sender, $eventArgs) $eventArgs.Cancel = $true; $script:cancelRequested = $true; Stop-RuntimeTree }
  [Console]::add_CancelKeyPress($cancelHandler)
  $script:runtimeProcess = Start-Process -FilePath docker -ArgumentList $arguments -PassThru -NoNewWindow -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
  if (-not $script:runtimeProcess.WaitForExit(60000)) { Stop-RuntimeTree; throw 'Global runtime timeout.' }
  $status = $script:runtimeProcess.ExitCode
  if ($script:cancelRequested) { $status = 130 }
  Get-Content -LiteralPath $stdoutFile | Write-Output
  exit $status
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
finally {
  if ($null -ne $cancelHandler) { [Console]::remove_CancelKeyPress($cancelHandler) }
  Stop-RuntimeTree
  Invoke-ComposeCleanup
  Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
