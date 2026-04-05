const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const repoRoot = path.resolve(__dirname, '../..')
const packReleaseBatPath = path.join(repoRoot, 'pack-release.bat')
const connectLdplayerBatPath = path.join(repoRoot, 'connect-ldplayer.bat')

const createTempDir = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

const writeFile = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

const runBatchFile = (batchFilePath, args, env = {}, cwd = repoRoot) => spawnSync(
  'cmd.exe',
  ['/d', '/c', batchFilePath, ...args],
  {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  },
)

test('pack-release.bat delegates to the local PowerShell release pack script and forwards args', () => {
  const tempDir = createTempDir('jumusic-pack-release-')
  const logPath = path.join(tempDir, 'powershell.log')
  const fakePowerShellPath = path.join(tempDir, 'powershell.cmd')

  writeFile(fakePowerShellPath, `@echo off
setlocal EnableDelayedExpansion
set "LOG_PATH=%PACK_RELEASE_LOG%"
if exist "%LOG_PATH%" del "%LOG_PATH%"
set index=0
:loop
if "%~1"=="" goto done
>> "%LOG_PATH%" echo arg!index!=%~1
set /a index+=1
shift
goto loop
:done
exit /b 0
`)

  const result = runBatchFile(
    packReleaseBatPath,
    ['-CleanInstall'],
    {
      NO_PAUSE: '1',
      POWERSHELL_EXE: fakePowerShellPath,
      PACK_RELEASE_LOG: logPath,
    },
    tempDir,
  )

  assert.equal(result.status, 0, result.stderr || result.stdout)

  const log = fs.readFileSync(logPath, 'utf8')
  assert.match(log, /arg0=-NoProfile/)
  assert.match(log, /arg1=-ExecutionPolicy/)
  assert.match(log, /arg2=Bypass/)
  assert.match(log, /arg3=-File/)
  assert.match(
    log,
    new RegExp(`arg4=${escapeRegExp(path.join(repoRoot, 'scripts', 'pack-android-release.ps1'))}`),
  )
  assert.match(log, /arg5=-CleanInstall/)
})

test('pack-release.bat returns the delegated PowerShell exit code', () => {
  const tempDir = createTempDir('jumusic-pack-release-exit-')
  const fakePowerShellPath = path.join(tempDir, 'powershell.cmd')

  writeFile(fakePowerShellPath, `@echo off
exit /b %POWERSHELL_EXIT_CODE%
`)

  const result = runBatchFile(packReleaseBatPath, [], {
    NO_PAUSE: '1',
    POWERSHELL_EXE: fakePowerShellPath,
    POWERSHELL_EXIT_CODE: '23',
  }, tempDir)

  assert.equal(result.status, 23, result.stderr || result.stdout)
})

test('connect-ldplayer.bat defaults to localhost port 5555 and lists devices', () => {
  const tempDir = createTempDir('jumusic-ldplayer-default-')
  const logPath = path.join(tempDir, 'adb.log')
  const fakeAdbPath = path.join(tempDir, 'adb.cmd')

  writeFile(fakeAdbPath, `@echo off
>> "%ADB_LOG%" echo %~1^|%~2^|%~3
if /I "%~1"=="connect" (
  echo connected to %~2
  exit /b 0
)
if /I "%~1"=="devices" (
  echo List of devices attached
  echo %~2 device
  exit /b 0
)
exit /b 0
`)

  const result = runBatchFile(connectLdplayerBatPath, [], {
    NO_PAUSE: '1',
    ADB_EXE: fakeAdbPath,
    ADB_LOG: logPath,
  }, tempDir)

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.deepEqual(
    fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/),
    [
      'connect|127.0.0.1:5555|',
      'devices||',
    ],
  )
})

test('connect-ldplayer.bat accepts a custom LDPlayer port', () => {
  const tempDir = createTempDir('jumusic-ldplayer-port-')
  const logPath = path.join(tempDir, 'adb.log')
  const fakeAdbPath = path.join(tempDir, 'adb.cmd')

  writeFile(fakeAdbPath, `@echo off
>> "%ADB_LOG%" echo %~1^|%~2^|%~3
exit /b 0
`)

  const result = runBatchFile(connectLdplayerBatPath, ['5557'], {
    NO_PAUSE: '1',
    ADB_EXE: fakeAdbPath,
    ADB_LOG: logPath,
  }, tempDir)

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(fs.readFileSync(logPath, 'utf8'), /connect\|127\.0\.0\.1:5557\|/)
})

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
