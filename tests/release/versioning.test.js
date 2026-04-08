const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const versioningPath = path.resolve(__dirname, '../../scripts/release/versioning.js')
const packScriptPath = path.resolve(__dirname, '../../scripts/pack-android-release.ps1')

const createTempDir = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

const writeFile = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

const runPowerShellScript = (scriptPath, args, env = {}, cwd = repoRoot) => spawnSync(
  'powershell',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
  {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  },
)

test('release versioning module exists', () => {
  assert.equal(fs.existsSync(versioningPath), true)
})

test('formatDisplayVersion uses Asia/Shanghai 0.yy.MMddhhmm', () => {
  assert.equal(fs.existsSync(versioningPath), true)
  const { formatDisplayVersion } = require(versioningPath)

  assert.equal(
    formatDisplayVersion(new Date('2026-04-08T03:32:00.000Z')),
    '0.26.04081132',
  )
})

test('selectReleaseVersion returns displayVersion, versionCode, and hourlySerial', () => {
  assert.equal(fs.existsSync(versioningPath), true)
  const { selectReleaseVersion } = require(versioningPath)

  assert.deepEqual(
    selectReleaseVersion({
      date: new Date('2026-04-08T03:32:00.000Z'),
      existingVersions: ['0.26.04081101', '0.26.04081115'],
    }),
    {
      displayVersion: '0.26.04081132',
      versionCode: 1302040560,
      hourlySerial: 2,
    },
  )
})

test('selectReleaseVersion adds a minute-level suffix when displayVersion collides', () => {
  assert.equal(fs.existsSync(versioningPath), true)
  const { selectReleaseVersion } = require(versioningPath)

  assert.equal(
    selectReleaseVersion({
      date: new Date('2026-04-08T03:32:00.000Z'),
      existingVersions: ['0.26.04081132', '0.26.04081132.1'],
    }).displayVersion,
    '0.26.04081132.2',
  )
})

test('applyReleaseVersion writes displayVersion and keeps versionCode numeric', () => {
  assert.equal(fs.existsSync(versioningPath), true)
  const { applyReleaseVersion } = require(versioningPath)

  const result = applyReleaseVersion({
    packageJson: {
      name: 'lx-music-mobile',
      version: '260408091',
      versionCode: 260408091,
      repository: {
        url: 'git+https://github.com/ifwlzs/juMusic_lx.git',
      },
    },
    versionJson: {
      version: '260408091',
      desc: 'old desc',
      history: [],
    },
    changelogMarkdown: [
      '# Changelog',
      '',
      '## [260408091](https://github.com/ifwlzs/juMusic_lx/compare/v26040809...v260408091) - 2026-04-08',
      '',
      'old body',
      '',
    ].join('\n'),
    releaseNotesMarkdown: [
      '### 修复',
      '',
      '- 修复自动发版',
      '- 修复本地打包 (#994, @ikun0014)',
      '- 修复文案引用（thanks @Folltoshe）',
      '',
    ].join('\n'),
    version: '0.26.04081132',
    versionCode: 1302040560,
    releaseDate: '2026-04-08',
  })

  assert.equal(result.packageJson.version, '0.26.04081132')
  assert.equal(result.packageJson.versionCode, 1302040560)
  assert.equal(result.versionJson.version, '0.26.04081132')
  assert.equal(result.versionJson.history[0].version, '260408091')
  assert.equal(result.versionJson.desc, '修复\n\n- 修复自动发版\n- 修复本地打包 (#994)\n- 修复文案引用')
  assert.match(
    result.changelogMarkdown,
    /## \[0\.26\.04081132\]\(https:\/\/github\.com\/ifwlzs\/juMusic_lx\/compare\/v260408091\.\.\.v0\.26\.04081132\) - 2026-04-08/,
  )
  assert.match(result.changelogMarkdown, /- 修复自动发版/)
  assert.match(result.changelogMarkdown, /- 修复本地打包 \(#994\)/)
  assert.doesNotMatch(result.changelogMarkdown, /@ikun0014|Folltoshe|thanks/i)
})

test('buildVersionCodeFromDisplayVersion keeps hourly serial stable when the displayVersion already exists', () => {
  assert.equal(fs.existsSync(versioningPath), true)
  const { buildVersionCodeFromDisplayVersion } = require(versioningPath)

  assert.equal(
    buildVersionCodeFromDisplayVersion({
      version: '0.26.04081132',
      existingVersions: [
        '0.26.04081101',
        '0.26.04081115',
        '0.26.04081132',
        '0.26.04081150',
      ],
    }),
    1302040560,
  )
})

test('sanitizeReleaseNotesMarkdown removes contributor mentions but preserves issue references', () => {
  assert.equal(fs.existsSync(versioningPath), true)
  const { sanitizeReleaseNotesMarkdown } = require(versioningPath)

  const result = sanitizeReleaseNotesMarkdown([
    '### 修复',
    '',
    '- 修复自动发版 (#994, @ikun0014)',
    '- 修复文案引用（thanks @Folltoshe）',
    '- 修复注释格式（By: @foo, @bar）',
    '- 调整目录扫描（感谢@baz）',
    '',
  ].join('\n'))

  assert.equal(result, [
    '### 修复',
    '',
    '- 修复自动发版 (#994)',
    '- 修复文案引用',
    '- 修复注释格式',
    '- 调整目录扫描',
  ].join('\n'))
})

test('getLatestChangelogBody returns the newest changelog section body for GitHub release notes', () => {
  assert.equal(fs.existsSync(versioningPath), true)
  const { getLatestChangelogBody } = require(versioningPath)

  const result = getLatestChangelogBody([
    '# Changelog',
    '',
    '## [26040523](https://github.com/ifwlzs/juMusic_lx/compare/v1.8.2...v26040523) - 2026-04-05',
    '',
    '修复',
    '',
    '- 修复自动发版',
    '',
    '## [1.8.2](https://github.com/ifwlzs/juMusic_lx/compare/v1.8.1...v1.8.2) - 2026-03-28',
    '',
    '旧内容',
    '',
  ].join('\n'))

  assert.equal(result, [
    '修复',
    '',
    '- 修复自动发版',
  ].join('\n'))
})

test('package.json exposes release helper scripts', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'))

  assert.equal(typeof packageJson.scripts['release:prepare'], 'string')
  assert.equal(typeof packageJson.scripts['pack:android:release:local'], 'string')
})

test('test:release runs both versioning and windows shortcut regressions', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'))

  assert.match(packageJson.scripts['test:release'], /tests\/release\/versioning\.test\.js/)
  assert.match(packageJson.scripts['test:release'], /tests\/release\/windows-shortcuts\.test\.js/)
})

test('package.json release metadata points to the current GitHub repository', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'))

  assert.match(packageJson.repository.url, /ifwlzs\/juMusic_lx/)
  assert.match(packageJson.bugs.url, /ifwlzs\/juMusic_lx/)
  assert.match(packageJson.homepage, /ifwlzs\/juMusic_lx/)
})

test('release workflow supports main push and manual dispatch', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')

  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /branches:\s*\r?\n\s*-\s*main/)
})

test('release workflow generates the next displayVersion and release artifacts use the displayVersion file names', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')
  const uploadAction = fs.readFileSync(path.resolve(__dirname, '../../.github/actions/upload-artifact/action.yml'), 'utf8')

  assert.match(workflow, /selectReleaseVersion\(\{ existingVersions \}\)\.displayVersion/)
  assert.match(workflow, /tag_name:\s*v\$\{\{\s*env\.PACKAGE_VERSION\s*\}\}/)
  assert.match(workflow, /lx-music-mobile-v\$\{\{\s*env\.PACKAGE_VERSION\s*\}\}-universal\.apk/)
  assert.match(uploadAction, /lx-music-mobile-v\$\{\{\s*env\.PACKAGE_VERSION\s*\}\}-arm64-v8a\.apk/)
  assert.match(uploadAction, /lx-music-mobile-v\$\{\{\s*env\.PACKAGE_VERSION\s*\}\}-x86\.apk/)
})

test('release workflow protects against recursive release commits', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')

  assert.match(workflow, /\[skip release\]/)
  assert.match(workflow, /concurrency:/)
})

test('release workflow restores gradlew execute permission on Linux runners', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')

  assert.match(workflow, /chmod \+x gradlew/)
})

test('release workflow uses sanitized release body, disables generated notes, and sets a Chinese release title', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')
  const updateChangeLog = fs.readFileSync(path.resolve(__dirname, '../../publish/utils/updateChangeLog.js'), 'utf8')

  assert.match(workflow, /body_path:\s*\.\/publish\/releaseBody\.md/)
  assert.match(workflow, /generate_release_notes:\s*false/)
  assert.match(workflow, /name:\s*juMusic 安卓版 v\$\{\{\s*env\.PACKAGE_VERSION\s*\}\}/)
  assert.match(workflow, /### 安装包 MD5/)
  assert.match(updateChangeLog, /releaseBody\.md/)
  assert.match(updateChangeLog, /getLatestChangelogBody/)
})

test('release workflow uses a no-daemon release build on CI', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')

  assert.match(workflow, /gradlew --no-daemon --stacktrace --max-workers=2 assembleRelease/)
})

test('beta workflow uses a no-daemon release build on CI', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/beta-pack.yml'), 'utf8')

  assert.match(workflow, /gradlew --no-daemon --stacktrace --max-workers=2 assembleRelease/)
})

test('setup action uses temurin jdk for android builds', () => {
  const setupAction = fs.readFileSync(path.resolve(__dirname, '../../.github/actions/setup/action.yml'), 'utf8')

  assert.match(setupAction, /setup-java@v4/)
  assert.match(setupAction, /distribution:\s*'temurin'/)
})

test('local PowerShell packaging script parses without syntax errors', () => {
  const escapedPath = packScriptPath.replace(/'/g, "''")
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `$errors = @(); [void][System.Management.Automation.Language.Parser]::ParseFile('${escapedPath}', [ref]$null, [ref]$errors); if ($errors.Count -gt 0) { $errors | ForEach-Object { $_.Message }; exit 1 }`,
  ], { stdio: 'pipe' })
})

test('prepare-release defaults to the new displayVersion formatter', () => {
  const prepareRelease = fs.readFileSync(path.resolve(__dirname, '../../scripts/release/prepare-release.js'), 'utf8')

  assert.match(prepareRelease, /formatDisplayVersion/)
  assert.doesNotMatch(prepareRelease, /process\.argv\[2\] \|\| formatReleaseVersion\(\)/)
})

test('updateChangeLog derives and writes versionCode separately from displayVersion', () => {
  const updateChangeLog = fs.readFileSync(path.resolve(__dirname, '../../publish/utils/updateChangeLog.js'), 'utf8')

  assert.match(updateChangeLog, /buildVersionCodeFromDisplayVersion/)
  assert.match(updateChangeLog, /versionCode:/)
  assert.doesNotMatch(updateChangeLog, /versionCode:\s*Number\(newVerNum\)/)
})

test('android build.gradle offsets ABI version codes instead of multiplying by 1000', () => {
  const buildGradle = fs.readFileSync(path.resolve(__dirname, '../../android/app/build.gradle'), 'utf8')

  assert.match(buildGradle, /output\.versionCodeOverride\s*=\s*defaultConfig\.versionCode \+ versionCodes\.get\(abi\)/)
  assert.doesNotMatch(buildGradle, /defaultConfig\.versionCode \* 1000/)
})

test('local PowerShell packaging script fails before npm when keystore.properties is missing', { concurrency: false }, () => {
  const tempDir = createTempDir('jumusic-release-preflight-')
  const fakeBinDir = path.join(tempDir, 'bin')
  const fakeJavaHome = path.join(tempDir, 'jdk')
  const npmLogPath = path.join(tempDir, 'npm.log')

  fs.mkdirSync(path.join(fakeJavaHome, 'bin'), { recursive: true })
  writeFile(path.join(fakeBinDir, 'nvm.cmd'), '@echo off\r\nexit /b 0\r\n')
  writeFile(path.join(fakeBinDir, 'npm.cmd'), `@echo off
>> "%NPM_LOG%" echo %*
exit /b 0
`)

  const keystorePath = path.join(repoRoot, 'android', 'keystore.properties')
  const backupPath = path.join(tempDir, 'keystore.properties.bak')
  if (fs.existsSync(keystorePath)) fs.renameSync(keystorePath, backupPath)

  try {
    const result = runPowerShellScript(packScriptPath, ['-JavaHome', fakeJavaHome], {
      PATH: `${fakeBinDir};${process.env.PATH}`,
      NPM_LOG: npmLogPath,
    })

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /keystore\.properties/i)
    assert.equal(fs.existsSync(npmLogPath), false)
  } finally {
    if (fs.existsSync(keystorePath)) fs.unlinkSync(keystorePath)
    if (fs.existsSync(backupPath)) fs.renameSync(backupPath, keystorePath)
  }
})

test('local PowerShell packaging script returns pack:android exit code without masking it with later output checks', { concurrency: false }, () => {
  const tempDir = createTempDir('jumusic-release-pack-exit-')
  const fakeBinDir = path.join(tempDir, 'bin')
  const fakeJavaHome = path.join(tempDir, 'jdk')
  const npmLogPath = path.join(tempDir, 'npm.log')
  const keystorePath = path.join(repoRoot, 'android', 'keystore.properties')
  const backupPath = path.join(tempDir, 'keystore.properties.bak')

  fs.mkdirSync(path.join(fakeJavaHome, 'bin'), { recursive: true })
  writeFile(path.join(fakeBinDir, 'nvm.cmd'), '@echo off\r\nexit /b 0\r\n')
  writeFile(path.join(fakeBinDir, 'npm.cmd'), `@echo off
>> "%NPM_LOG%" echo %*
if /I "%~1"=="run" if /I "%~2"=="pack:android" exit /b 7
exit /b 0
`)
  if (fs.existsSync(keystorePath)) fs.renameSync(keystorePath, backupPath)
  writeFile(keystorePath, `storeFile=debug.keystore
storePassword=android
keyAlias=androiddebugkey
keyPassword=android
`)

  try {
    const result = runPowerShellScript(packScriptPath, ['-JavaHome', fakeJavaHome], {
      PATH: `${fakeBinDir};${process.env.PATH}`,
      NPM_LOG: npmLogPath,
    })

    assert.equal(result.status, 7, result.stderr || result.stdout)
    assert.match(fs.readFileSync(npmLogPath, 'utf8'), /run release:prepare/)
    assert.match(fs.readFileSync(npmLogPath, 'utf8'), /run pack:android/)
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Cannot find path .*apk[\\/]+release/i)
  } finally {
    if (fs.existsSync(keystorePath)) fs.unlinkSync(keystorePath)
    if (fs.existsSync(backupPath)) fs.renameSync(backupPath, keystorePath)
  }
})
