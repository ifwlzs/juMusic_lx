param(
  [string]$NodeVersion = '18.20.8',
  [string]$JavaHome = 'D:\Program Files\Java\jdk-17.0.2',
  [switch]$CleanInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  if (-not (Get-Command nvm -ErrorAction SilentlyContinue)) {
    throw 'nvm is not available.'
  }

  if (-not (Test-Path $JavaHome)) {
    throw "JDK directory not found: $JavaHome"
  }

  Write-Host "Using Node $NodeVersion"
  nvm use $NodeVersion | Out-Host

  $env:JAVA_HOME = $JavaHome
  $env:Path = "$env:JAVA_HOME\bin;$env:Path"

  Write-Host "JAVA_HOME=$env:JAVA_HOME"

  if ($CleanInstall -or -not (Test-Path 'node_modules')) {
    Write-Host 'Installing dependencies with npm ci'
    npm ci
  } else {
    Write-Host 'Reusing existing node_modules'
  }

  npm run release:prepare
  npm run pack:android

  Write-Host 'Release APK output:'
  Get-ChildItem 'android/app/build/outputs/apk/release' | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize | Out-Host
}
finally {
  Pop-Location
}
