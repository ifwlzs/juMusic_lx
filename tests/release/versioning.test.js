const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const versioningPath = path.resolve(__dirname, '../../scripts/release/versioning.js')

test('release versioning module exists', () => {
  assert.equal(fs.existsSync(versioningPath), true)
})

test('formatReleaseVersion uses Asia/Shanghai yymmddhh', () => {
  assert.equal(fs.existsSync(versioningPath), true)
  const { formatReleaseVersion } = require(versioningPath)

  assert.equal(
    formatReleaseVersion(new Date('2026-04-05T15:00:00.000Z')),
    '26040523',
  )
})

test('applyReleaseVersion syncs package, version json, and changelog content', () => {
  assert.equal(fs.existsSync(versioningPath), true)
  const { applyReleaseVersion } = require(versioningPath)

  const result = applyReleaseVersion({
    packageJson: {
      name: 'lx-music-mobile',
      version: '1.8.2',
      versionCode: 74,
      repository: {
        url: 'git+https://github.com/ifwlzs/juMusic_lx.git',
      },
    },
    versionJson: {
      version: '1.8.2',
      desc: 'old desc',
      history: [],
    },
    changelogMarkdown: [
      '# Changelog',
      '',
      '## [1.8.2](https://github.com/ifwlzs/juMusic_lx/compare/v1.8.1...v1.8.2) - 2026-03-28',
      '',
      'old body',
      '',
    ].join('\n'),
    releaseNotesMarkdown: [
      '### 修复',
      '',
      '- 修复自动发版',
      '- 修复本地打包',
      '',
    ].join('\n'),
    version: '26040523',
    releaseDate: '2026-04-05',
  })

  assert.equal(result.packageJson.version, '26040523')
  assert.equal(result.packageJson.versionCode, 26040523)
  assert.equal(result.versionJson.version, '26040523')
  assert.equal(result.versionJson.history[0].version, '1.8.2')
  assert.equal(result.versionJson.desc, '修复\n\n- 修复自动发版\n- 修复本地打包')
  assert.match(
    result.changelogMarkdown,
    /## \[26040523\]\(https:\/\/github\.com\/ifwlzs\/juMusic_lx\/compare\/v1\.8\.2\.\.\.v26040523\) - 2026-04-05/,
  )
  assert.match(result.changelogMarkdown, /- 修复自动发版/)
})

test('package.json exposes release helper scripts', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'))

  assert.equal(typeof packageJson.scripts['release:prepare'], 'string')
  assert.equal(typeof packageJson.scripts['pack:android:release:local'], 'string')
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

test('release workflow protects against recursive release commits', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')

  assert.match(workflow, /\[skip release\]/)
  assert.match(workflow, /concurrency:/)
})

test('release workflow restores gradlew execute permission on Linux runners', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')

  assert.match(workflow, /chmod \+x gradlew/)
})

test('local PowerShell packaging script parses without syntax errors', () => {
  const scriptPath = path.resolve(__dirname, '../../scripts/pack-android-release.ps1')
  const escapedPath = scriptPath.replace(/'/g, "''")
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `$errors = @(); [void][System.Management.Automation.Language.Parser]::ParseFile('${escapedPath}', [ref]$null, [ref]$errors); if ($errors.Count -gt 0) { $errors | ForEach-Object { $_.Message }; exit 1 }`,
  ], { stdio: 'pipe' })
})
