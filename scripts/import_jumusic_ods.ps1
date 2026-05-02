param(
  [string]$MusicRoot = "",
  [string]$PlayHistoryJson = "",
  [string]$DbUrl = "",
  [switch]$SkipMusic,
  [switch]$SkipHistory,
  [int]$MusicLimit = 0
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$musicLoader = Join-Path $repoRoot "scripts\\music_etl\\load_music_info.py"
$historyLoader = Join-Path $repoRoot "scripts\\play_history_etl\\load_play_history.py"

if (-not (Test-Path $musicLoader)) {
  throw "Music loader script not found: $musicLoader"
}

if (-not (Test-Path $historyLoader)) {
  throw "Play history loader script not found: $historyLoader"
}

if ($DbUrl) {
  $env:JUMUSIC_DB_URL = $DbUrl
}

if (-not $SkipMusic) {
  if (-not $MusicRoot) {
    throw "MusicRoot is required unless SkipMusic is set."
  }
  $resolvedMusicRoot = if ([System.IO.Path]::IsPathRooted($MusicRoot)) { $MusicRoot } else { Join-Path (Get-Location).Path $MusicRoot }
  if (-not (Test-Path $resolvedMusicRoot)) {
    throw "Music root not found: $resolvedMusicRoot"
  }

  $musicArgs = @($musicLoader, "--root-path", $resolvedMusicRoot)
  if ($MusicLimit -gt 0) {
    $musicArgs += @("--limit", "$MusicLimit")
  }

  Write-Host "Importing music dimension..." -ForegroundColor Cyan
  Write-Host "MusicRoot: $resolvedMusicRoot"
  & python @musicArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Music dimension import failed, exit code: $LASTEXITCODE"
  }
}

if (-not $SkipHistory) {
  if (-not $PlayHistoryJson) {
    throw "PlayHistoryJson is required unless SkipHistory is set."
  }
  $resolvedPlayHistoryJson = if ([System.IO.Path]::IsPathRooted($PlayHistoryJson)) { $PlayHistoryJson } else { Join-Path (Get-Location).Path $PlayHistoryJson }
  if (-not (Test-Path $resolvedPlayHistoryJson)) {
    throw "Play history json not found: $resolvedPlayHistoryJson"
  }

  Write-Host "Importing play history fact..." -ForegroundColor Cyan
  Write-Host "PlayHistoryJson: $resolvedPlayHistoryJson"
  & python $historyLoader "--input" $resolvedPlayHistoryJson
  if ($LASTEXITCODE -ne 0) {
    throw "Play history import failed, exit code: $LASTEXITCODE"
  }
}

Write-Host "juMusic ODS import completed." -ForegroundColor Green

