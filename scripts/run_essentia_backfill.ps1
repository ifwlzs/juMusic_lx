param(
  [string]$PythonExe = "python",
  [string]$TmpDir = "",
  [int]$BatchSize = 100,
  [int]$PollSec = 30,
  [int]$StartBatchNo = 1,
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$scriptPath = Join-Path $repoRoot "scripts\\music_etl\\backfill_essentia_genre.py"

if (-not (Test-Path $scriptPath)) {
  throw "Backfill script not found: $scriptPath"
}

$args = @(
  $scriptPath,
  "--batch-size", "$BatchSize",
  "--poll-sec", "$PollSec",
  "--start-batch-no", "$StartBatchNo"
)

if ($TmpDir) {
  $args += @("--tmp-dir", $TmpDir)
}

if ($Foreground) {
  Write-Host "Running Essentia backfill in foreground..." -ForegroundColor Cyan
  & $PythonExe @args
  if ($LASTEXITCODE -ne 0) {
    throw "Essentia backfill failed, exit code: $LASTEXITCODE"
  }
  exit 0
}

$process = Start-Process -FilePath $PythonExe -ArgumentList $args -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
Write-Host "Essentia backfill started in background, PID: $($process.Id)" -ForegroundColor Green
