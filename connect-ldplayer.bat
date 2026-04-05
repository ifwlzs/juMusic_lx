@echo off
setlocal

set "TARGET=%~1"
if not defined TARGET set "TARGET=5555"
echo(%TARGET%| findstr /c=":" >nul || set "TARGET=127.0.0.1:%TARGET%"

set "ADB_EXE=%ADB_EXE%"
if not defined ADB_EXE set "ADB_EXE=adb"

echo [juMusic] Connecting to LDPlayer at %TARGET%...
call "%ADB_EXE%" connect "%TARGET%"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" goto :finish

echo [juMusic] Current ADB devices:
call "%ADB_EXE%" devices
set "EXIT_CODE=%ERRORLEVEL%"

:finish
if "%EXIT_CODE%"=="0" (
  echo [juMusic] LDPlayer connection finished.
) else (
  echo [juMusic] LDPlayer connection failed with exit code %EXIT_CODE%.
)

if not defined NO_PAUSE pause
exit /b %EXIT_CODE%
