@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "SCRIPT_PATH=%ROOT_DIR%scripts\pack-android-release.ps1"

if not exist "%SCRIPT_PATH%" (
  echo [juMusic] Missing script: "%SCRIPT_PATH%"
  set "EXIT_CODE=1"
  goto :finish
)

set "POWERSHELL_EXE=%POWERSHELL_EXE%"
if not defined POWERSHELL_EXE set "POWERSHELL_EXE=powershell"

pushd "%ROOT_DIR%" >nul 2>&1
if errorlevel 1 (
  echo [juMusic] Failed to enter repo root: "%ROOT_DIR%"
  set "EXIT_CODE=1"
  goto :finish
)

echo [juMusic] Starting Android release packaging...
call "%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd >nul

if "%EXIT_CODE%"=="0" (
  echo [juMusic] Release packaging finished.
) else (
  echo [juMusic] Release packaging failed with exit code %EXIT_CODE%.
)

:finish
if not defined NO_PAUSE pause
exit /b %EXIT_CODE%
