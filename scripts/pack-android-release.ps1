param(
  [string]$NodeVersion = '18.20.8',
  [string]$JavaHome = 'D:\Program Files\Java\jdk-17.0.2',
  [switch]$CleanInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$exitCode = 0

function Invoke-CheckedCommand {
  param(
    [scriptblock]$Command,
    [string]$Description
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    $script:exitCode = $LASTEXITCODE
    throw "$Description failed with exit code $LASTEXITCODE"
  }
}

Push-Location $repoRoot

try {
  if (-not (Get-Command nvm -ErrorAction SilentlyContinue)) {
    throw 'nvm is not available.'
  }

  if (-not (Test-Path $JavaHome)) {
    throw "JDK directory not found: $JavaHome"
  }

  $keystorePropertiesPath = Join-Path $repoRoot 'android/keystore.properties'
  $hasReleaseSigningEnv = [bool]$env:ORG_GRADLE_PROJECT_MYAPP_UPLOAD_STORE_FILE -or [bool]$env:MYAPP_UPLOAD_STORE_FILE
  if (-not $hasReleaseSigningEnv -and -not (Test-Path $keystorePropertiesPath)) {
    throw "Release signing config not found. Expected '$keystorePropertiesPath' or ORG_GRADLE_PROJECT_MYAPP_UPLOAD_STORE_FILE."
  }

  Write-Host "Using Node $NodeVersion"
  Invoke-CheckedCommand -Description "nvm use $NodeVersion" -Command {
    nvm use $NodeVersion | Out-Host
  }

  $env:JAVA_HOME = $JavaHome
  $env:Path = "$env:JAVA_HOME\bin;$env:Path"

  Write-Host "JAVA_HOME=$env:JAVA_HOME"

  if ($CleanInstall -or -not (Test-Path 'node_modules')) {
    Write-Host 'Installing dependencies with npm ci'
    Invoke-CheckedCommand -Description 'npm ci' -Command {
      npm ci
    }
  } else {
    Write-Host 'Reusing existing node_modules'
  }

  Invoke-CheckedCommand -Description 'npm run release:prepare' -Command {
    npm run release:prepare
  }
  Invoke-CheckedCommand -Description 'npm run pack:android' -Command {
    npm run pack:android
  }

  $releaseOutputDir = 'android/app/build/outputs/apk/release'
  if (-not (Test-Path $releaseOutputDir)) {
    throw "Release APK output directory not found: $releaseOutputDir"
  }
  Write-Host 'Release APK output:'
  Get-ChildItem $releaseOutputDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize | Out-Host
} catch {
  [Console]::Error.WriteLine($_)
  if ($exitCode -eq 0) {
    $exitCode = 1
  }
}
finally {
  Pop-Location
}

exit $exitCode
