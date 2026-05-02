param(
  [string]$InputPathArg = "tests/lx_play_history_all.json",
  [string]$DbUrl = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$loaderPath = Join-Path $PSScriptRoot "load_play_history.py"
$inputPath = if ([System.IO.Path]::IsPathRooted($InputPathArg)) { $InputPathArg } else { Join-Path $repoRoot $InputPathArg }

if (-not (Test-Path $loaderPath)) {
  throw "Import loader script not found: $loaderPath"
}

if (-not (Test-Path $inputPath)) {
  $fallbackInputPath = Join-Path (Get-Location).Path $InputPathArg
  if (Test-Path $fallbackInputPath) {
    $inputPath = $fallbackInputPath
  } else {
    throw "Play history file not found: $inputPath"
  }
}

$arguments = @($loaderPath, "--input", $inputPath)
if ($DbUrl) {
  $arguments += @("--db-url", $DbUrl)
}

Write-Host "Start importing play history..." -ForegroundColor Cyan
Write-Host "Input: $inputPath"
if ($DbUrl) {
  Write-Host "DB URL: $DbUrl"
} elseif ($env:JUMUSIC_DB_URL) {
  Write-Host "DB URL: using environment variable JUMUSIC_DB_URL"
} else {
  Write-Host "DB Config: using JUMUSIC_DB_SERVER / USER / PASSWORD / DATABASE env vars or CLI args"
}

& python @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Play history import failed, exit code: $LASTEXITCODE"
}

Write-Host "Play history import completed." -ForegroundColor Green
