# Release Versioning And Play Detail BG Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate release metadata to the new `0.yy.MMddhhmm` display-version scheme with a safe Android `versionCode`, and add a long-lived browser preview tool for the play-detail blur background.

**Architecture:** Keep one release-version source of truth in `scripts/release/versioning.js`, then thread it through metadata writing, Android build version overrides, and GitHub release artifact naming. Build the preview tool as a tiny static app plus a zero-dependency local dev server with live reload so background styling can be edited and inspected outside React Native.

**Tech Stack:** Node.js, PowerShell, GitHub Actions YAML, Gradle/Groovy, static HTML/CSS/JS, Node test runner

---

### File Structure

**Release versioning**
- Modify: `scripts/release/versioning.js`
  - Own display-version formatting, duplicate detection, hourly serial selection, and Android `versionCode` generation.
- Modify: `scripts/release/prepare-release.js`
  - Accept a display version and write both `version` and `versionCode`.
- Modify: `publish/utils/updateChangeLog.js`
  - Continue using the shared release module without assuming `versionCode === version`.
- Modify: `package.json`
  - Add updated scripts and migrate current repo-head version metadata.
- Modify: `publish/version.json`
  - Migrate current repo-head visible version to the new format.
- Modify: `CHANGELOG.md`
  - Migrate the latest changelog heading to the new display-version format.
- Modify: `.github/workflows/release.yml`
  - Generate the next display version, pass it into `release:prepare`, and publish renamed assets/tags.
- Modify: `.github/actions/upload-artifact/action.yml`
  - Upload artifacts whose file names include the display version.
- Modify: `scripts/pack-android-release.ps1`
  - Keep local packaging aligned with the shared release prepare step.
- Modify: `android/app/build.gradle`
  - Stop multiplying `versionCode` by 1000 for ABI outputs; use small ABI offsets.
- Modify: `tests/release/versioning.test.js`
  - Cover new display-version format, hourly serial logic, `versionCode` generation, and file-path naming.

**Play-detail background preview tool**
- Create: `tools/play-detail-bg-preview/index.html`
  - Minimal preview surface with drag/drop input, preset picker, and centered safe area.
- Create: `tools/play-detail-bg-preview/styles.css`
  - Background-layer styles and editable blur/overlay/edge-ring values.
- Create: `tools/play-detail-bg-preview/preview.js`
  - Drag/drop handling, preset switching, and CSS custom property wiring.
- Create: `tools/play-detail-bg-preview/server.js`
  - Tiny static-file server with file watching and live reload.
- Create: `tools/play-detail-bg-preview/README.md`
  - Usage instructions and parameter mapping back to `src/components/PageContent.tsx`.
- Modify: `package.json`
  - Add a `preview:play-detail-bg` script.
- Create: `tests/play-detail/background-preview-tool.test.js`
  - Assert the preview tool exists, has drag/drop support, live-reload script wiring, and README mappings.

### Task 1: Lock The New Release-Version Contract With Tests

**Files:**
- Modify: `tests/release/versioning.test.js`

- [x] **Step 1: Write the failing tests for display version, hourly serial, and Android versionCode**

```js
test('formatDisplayVersion uses 0.yy.MMddhhmm in Asia/Shanghai', () => {
  const { formatDisplayVersion } = require(versioningPath)

  assert.equal(
    formatDisplayVersion(new Date('2026-04-08T03:32:00.000Z')),
    '0.26.04081132',
  )
})

test('selectReleaseVersion returns displayVersion, versionCode, and hourlySerial', () => {
  const { selectReleaseVersion } = require(versioningPath)

  assert.deepEqual(
    selectReleaseVersion({
      date: new Date('2026-04-08T03:32:00.000Z'),
      existingVersions: ['0.26.04081101', '0.26.04081115'],
    }),
    {
      displayVersion: '0.26.04081132',
      versionCode: 1302040550,
      hourlySerial: 2,
    },
  )
})

test('selectReleaseVersion adds a minute-level suffix when displayVersion collides', () => {
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
  const { applyReleaseVersion } = require(versioningPath)

  const result = applyReleaseVersion({
    packageJson: {
      name: 'lx-music-mobile',
      version: '260408091',
      versionCode: 260408091,
      repository: {
        url: 'git+https://github.com/ifwlzs/juMusic_lx.git',
      },
      scripts: {},
    },
    versionJson: {
      version: '260408091',
      desc: 'old desc',
      history: [],
    },
    changelogMarkdown: '# Changelog\\n\\n## [260408091](https://github.com/ifwlzs/juMusic_lx/compare/v26040809...v260408091) - 2026-04-08\\n\\nold body\\n',
    releaseNotesMarkdown: '### 优化\\n\\n- 切换到新版本规则\\n',
    version: '0.26.04081132',
    versionCode: 1302040550,
    releaseDate: '2026-04-08',
  })

  assert.equal(result.packageJson.version, '0.26.04081132')
  assert.equal(result.packageJson.versionCode, 1302040550)
  assert.equal(result.versionJson.version, '0.26.04081132')
  assert.match(result.changelogMarkdown, /## \\[0\\.26\\.04081132\\]/)
})
```

- [x] **Step 2: Run the release-version tests to verify the new contract fails against current code**

Run: `node --test tests/release/versioning.test.js`
Expected: FAIL because `formatDisplayVersion` does not exist yet, `selectReleaseVersion()` still returns a string, and `applyReleaseVersion()` still assumes `versionCode === Number(version)`.

- [x] **Step 3: Add the minimal shared-version helpers in `scripts/release/versioning.js`**

```js
const minuteFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
})

const formatDisplayVersion = (date = new Date()) => {
  const parts = getFormattedParts(minuteFormatter, date)
  return `0.${parts.year}.${parts.month}${parts.day}${parts.hour}${parts.minute}`
}

const formatHourCode = (date = new Date()) => {
  const parts = getFormattedParts(hourFormatter, date)
  return Number(`${parts.year}${parts.month}${parts.day}${parts.hour}`)
}

const buildVersionCode = ({ date = new Date(), hourlySerial = 0 }) => {
  return formatHourCode(date) * 50 + hourlySerial * 5
}

const selectReleaseVersion = ({ date = new Date(), existingVersions = [] } = {}) => {
  const normalizedVersions = new Set(existingVersions.map(normalizeReleaseVersion))
  const displayBase = formatDisplayVersion(date)
  let displayVersion = displayBase
  let minuteSuffix = 0

  while (normalizedVersions.has(displayVersion)) {
    minuteSuffix += 1
    displayVersion = `${displayBase}.${minuteSuffix}`
  }

  const hourlySerial = selectHourlySerial({ existingVersions, date })
  return {
    displayVersion,
    versionCode: buildVersionCode({ date, hourlySerial }),
    hourlySerial,
  }
}

const applyReleaseVersion = ({
  packageJson,
  versionJson,
  changelogMarkdown,
  releaseNotesMarkdown,
  version,
  versionCode,
  releaseDate = formatReleaseDate(),
}) => {
  // unchanged history handling...
  return {
    packageJson: {
      ...packageJson,
      version,
      versionCode,
    },
    // ...
  }
}
```

- [x] **Step 4: Re-run the release-version tests until the new contract passes**

Run: `node --test tests/release/versioning.test.js`
Expected: PASS for the new display-version and `versionCode` tests.

- [x] **Step 5: Commit the shared release-version contract**

```bash
git add tests/release/versioning.test.js scripts/release/versioning.js
git commit -m "feat: add display version and android version code scheme"
```

### Task 2: Thread The New Version Scheme Through Build, Workflow, And Repo-Head Metadata

**Files:**
- Modify: `scripts/release/prepare-release.js`
- Modify: `publish/utils/updateChangeLog.js`
- Modify: `android/app/build.gradle`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/actions/upload-artifact/action.yml`
- Modify: `scripts/pack-android-release.ps1`
- Modify: `package.json`
- Modify: `publish/version.json`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Write the failing integration assertions for build and workflow naming**

```js
test('release workflow and upload action use displayVersion-based file names', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/release.yml'), 'utf8')
  const uploadAction = fs.readFileSync(path.resolve(__dirname, '../../.github/actions/upload-artifact/action.yml'), 'utf8')

  assert.match(workflow, /tag_name:\\s*v\\$\\{\\{ env\\.PACKAGE_VERSION \\}\\}/)
  assert.match(workflow, /lx-music-mobile-v\\$\\{\\{ env\\.PACKAGE_VERSION \\}\\}-universal\\.apk/)
  assert.match(uploadAction, /lx-music-mobile-v\\$\\{\\{ env\\.PACKAGE_VERSION \\}\\}-arm64-v8a\\.apk/)
})

test('android build.gradle offsets ABI version codes instead of multiplying by 1000', () => {
  const buildGradle = fs.readFileSync(path.resolve(__dirname, '../../android/app/build.gradle'), 'utf8')

  assert.match(buildGradle, /output\\.versionCodeOverride\\s*=\\s*defaultConfig\\.versionCode \\+ versionCodes\\.get\\(abi\\)/)
  assert.doesNotMatch(buildGradle, /defaultConfig\\.versionCode \\* 1000/)
})
```

- [x] **Step 2: Run the focused release tests to confirm they fail for the old naming and Gradle logic**

Run: `node --test tests/release/versioning.test.js`
Expected: FAIL on workflow/artifact path assertions and the Gradle version-code assertion.

- [x] **Step 3: Update metadata writing, workflow generation, and Gradle ABI offsets**

```js
// scripts/release/prepare-release.js
const { selectReleaseVersion, applyReleaseVersion } = require('./versioning')
const selected = providedVersion
  ? {
      displayVersion: providedVersion,
      versionCode: buildVersionCodeFromDisplayVersion(providedVersion, existingVersions),
    }
  : selectReleaseVersion({ existingVersions })

const nextState = applyReleaseVersion({
  packageJson,
  versionJson,
  changelogMarkdown,
  releaseNotesMarkdown,
  version: selected.displayVersion,
  versionCode: selected.versionCode,
})
```

```groovy
// android/app/build.gradle
if (abi == null) {
    output.outputFileName =
            "${applicationName}-v${defaultConfig.versionName}-universal.apk"
} else {
    output.versionCodeOverride =
            defaultConfig.versionCode + versionCodes.get(abi)
    output.outputFileName =
            "${applicationName}-v${defaultConfig.versionName}-${abi}.apk"
}
```

```yaml
# .github/workflows/release.yml
- name: Generate release version
  run: |
    PACKAGE_VERSION=$(node -e "const { execFileSync } = require('node:child_process'); const { selectReleaseVersion } = require('./scripts/release/versioning'); const existingVersions = execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).map(line => line.trim().split(/\s+/)[1]).filter(Boolean).filter(ref => ref.startsWith('refs/tags/v')).map(ref => ref.replace(/^refs\\/tags\\/v/, '')); process.stdout.write(selectReleaseVersion({ existingVersions }).displayVersion);")
    echo "PACKAGE_VERSION=$PACKAGE_VERSION" >> $GITHUB_ENV
```

- [x] **Step 4: Migrate the repo-head metadata to the first new display-version**

Run:

```bash
node -e "const { execFileSync } = require('node:child_process'); const { selectReleaseVersion } = require('./scripts/release/versioning'); const existingVersions = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).map(tag => tag.replace(/^v/, '')); process.stdout.write(selectReleaseVersion({ existingVersions }).displayVersion)"
```

Then run:

```bash
npm run release:prepare -- <DISPLAY_VERSION_FROM_PREVIOUS_COMMAND>
```

Expected: `package.json`, `publish/version.json`, and the latest `CHANGELOG.md` heading all switch to the new display-version format while `package.json.versionCode` becomes a numeric internal code.

- [x] **Step 5: Re-run the release regression suite**

Run: `node --test tests/release/versioning.test.js tests/release/windows-shortcuts.test.js`
Expected: PASS.

- [x] **Step 6: Commit the release-pipeline migration**

```bash
git add scripts/release/prepare-release.js publish/utils/updateChangeLog.js android/app/build.gradle .github/workflows/release.yml .github/actions/upload-artifact/action.yml scripts/pack-android-release.ps1 package.json publish/version.json CHANGELOG.md tests/release/versioning.test.js
git commit -m "feat: migrate release pipeline to display version scheme"
```

### Task 3: Add The Long-Lived Browser Blur-Background Preview Tool

**Files:**
- Create: `tests/play-detail/background-preview-tool.test.js`
- Create: `tools/play-detail-bg-preview/index.html`
- Create: `tools/play-detail-bg-preview/styles.css`
- Create: `tools/play-detail-bg-preview/preview.js`
- Create: `tools/play-detail-bg-preview/server.js`
- Create: `tools/play-detail-bg-preview/README.md`
- Modify: `package.json`

- [x] **Step 1: Write the failing test for the preview tool contract**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

test('play-detail background preview tool exists with drag-drop, live reload, and RN mapping docs', () => {
  const html = read('tools/play-detail-bg-preview/index.html')
  const js = read('tools/play-detail-bg-preview/preview.js')
  const server = read('tools/play-detail-bg-preview/server.js')
  const readme = read('tools/play-detail-bg-preview/README.md')
  const packageJson = JSON.parse(read('package.json'))

  assert.match(packageJson.scripts['preview:play-detail-bg'], /tools\\/play-detail-bg-preview\\/server\\.js/)
  assert.match(html, /data-role=\"drop-zone\"/)
  assert.match(js, /dragover/)
  assert.match(js, /drop/)
  assert.match(js, /FileReader/)
  assert.match(server, /fs\\.watch/)
  assert.match(server, /text\\/event-stream/)
  assert.match(readme, /src\\/components\\/PageContent\\.tsx/)
  assert.match(readme, /blurRadius/)
  assert.match(readme, /scaleX/)
  assert.match(readme, /edgeOverlayColor/)
})
```

- [x] **Step 2: Run the new play-detail preview test and verify it fails**

Run: `node --test tests/play-detail/background-preview-tool.test.js`
Expected: FAIL because the preview tool files and script do not exist yet.

- [x] **Step 3: Implement the minimal static preview app and live-reload server**

```html
<!-- tools/play-detail-bg-preview/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Play Detail BG Preview</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <aside class="panel">
    <h1>Play Detail BG Preview</h1>
    <label class="upload" data-role="drop-zone">
      <input type="file" accept="image/*" data-role="file-input" />
      <span>拖拽或选择真实封面</span>
    </label>
    <div class="presets" data-role="preset-list"></div>
  </aside>
  <main class="stage">
    <div class="bg-root" data-role="bg-root">
      <div class="bg-image" data-role="bg-image"></div>
      <div class="bg-overlay"></div>
      <div class="bg-edge bg-edge-1"></div>
      <div class="bg-edge bg-edge-2"></div>
      <div class="bg-edge bg-edge-3"></div>
      <div class="safe-area">Safe Area</div>
    </div>
  </main>
  <script type="module" src="./preview.js"></script>
</body>
</html>
```

```js
// tools/play-detail-bg-preview/server.js
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const root = __dirname
const clients = new Set()

fs.watch(root, { recursive: true }, () => {
  for (const response of clients) response.write('data: reload\\n\\n')
})

const server = http.createServer((request, response) => {
  if (request.url === '/__events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.write('\\n')
    clients.add(response)
    request.on('close', () => clients.delete(response))
    return
  }

  const filePath = path.join(root, request.url === '/' ? 'index.html' : request.url)
  response.end(fs.readFileSync(filePath))
})

server.listen(4866, () => {
  console.log('Play detail bg preview: http://127.0.0.1:4866')
})
```

- [x] **Step 4: Run the play-detail preview test and a focused manual smoke check**

Run: `node --test tests/play-detail/background-preview-tool.test.js`
Expected: PASS.

Run: `node tools/play-detail-bg-preview/server.js`
Expected: server prints `http://127.0.0.1:4866`; after editing `styles.css`, the browser reloads automatically.

- [x] **Step 5: Commit the preview tool**

```bash
git add tests/play-detail/background-preview-tool.test.js tools/play-detail-bg-preview package.json
git commit -m "feat: add play detail background preview tool"
```

### Task 4: Verify The Whole Slice And Prepare For Merge

**Files:**
- Modify: `docs/superpowers/plans/2026-04-08-release-versioning-play-detail-bg-preview.md`
  - Only to tick completed boxes if you keep the plan updated in-repo.

- [x] **Step 1: Run the combined automated verification**

Run:

```bash
node --test tests/release/versioning.test.js tests/release/windows-shortcuts.test.js tests/play-detail tests/play-detail/background-preview-tool.test.js
```

Expected: PASS with 0 failures.

- [x] **Step 2: Run lint on the changed JS/HTML support files**

Run:

```bash
npx eslint scripts/release/versioning.js scripts/release/prepare-release.js publish/utils/updateChangeLog.js tests/release/versioning.test.js tests/play-detail/background-preview-tool.test.js
```

Expected: PASS with 0 errors.

- [x] **Step 3: Run a debug Android build to verify the new versionName / versionCode path compiles**

Run:

```bash
cd android && .\gradlew.bat assembleDebug
```

Expected: `BUILD SUCCESSFUL` and APK names under `android/app/build/outputs/apk/debug/` use the new display-version pattern.

- [x] **Step 4: Inspect git status for unintended files**

Run:

```bash
git status --short
```

Expected: only the intended release-versioning, preview-tool, and plan files are modified; no unrelated untracked root-workspace files should appear inside the worktree branch.

- [x] **Step 5: Commit the final verification and plan updates**

```bash
git add docs/superpowers/plans/2026-04-08-release-versioning-play-detail-bg-preview.md
git commit -m "docs: record release versioning and preview implementation plan progress"
```
