# Release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared `yymmddhh` release-version flow that powers local Android packaging and GitHub Release publishing from `main`.

**Architecture:** Introduce a small Node-based release-version module that owns Shanghai-time version generation and file updates. Reuse it from a local PowerShell packaging script and a single GitHub Actions release workflow so APK names, tags, release names, and version files stay aligned.

**Tech Stack:** Node.js 18, PowerShell, GitHub Actions, Gradle/React Native

---

### Task 1: Shared Versioning Core

**Files:**
- Create: `tests/release/versioning.test.js`
- Create: `scripts/release/versioning.js`
- Modify: `publish/utils/updateChangeLog.js`
- Modify: `publish/utils/parseChangelog.js`

- [ ] **Step 1: Write the failing test**

```js
test('formatReleaseVersion uses Asia/Shanghai yymmddhh', () => {
  assert.equal(
    formatReleaseVersion(new Date('2026-04-05T15:00:00.000Z')),
    '26040523',
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/release/versioning.test.js`
Expected: FAIL because `scripts/release/versioning.js` does not exist or does not export the required helpers.

- [ ] **Step 3: Implement the minimal shared helpers**

```js
module.exports = {
  formatReleaseVersion,
  formatReleaseDate,
  applyReleaseVersion,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/release/versioning.test.js`
Expected: PASS for version formatting and file-update behavior.

- [ ] **Step 5: Commit**

```bash
git add tests/release/versioning.test.js scripts/release/versioning.js publish/utils/updateChangeLog.js publish/utils/parseChangelog.js
git commit -m "feat: add shared release versioning"
```

### Task 2: Local Packaging Script

**Files:**
- Create: `scripts/pack-android-release.ps1`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

```js
test('package.json exposes release helper scripts', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  assert.equal(pkg.scripts['release:prepare'] != null, true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/release/versioning.test.js`
Expected: FAIL because `release:prepare` and local packaging helpers are missing.

- [ ] **Step 3: Implement the packaging script**

```powershell
param([switch]$CleanInstall)
nvm use 18.20.8
$env:JAVA_HOME = 'D:\Program Files\Java\jdk-17.0.2'
node scripts/release/prepare-release.js
npm run pack:android
```

- [ ] **Step 4: Run the script in real packaging mode**

Run: `powershell -ExecutionPolicy Bypass -File .\scripts\pack-android-release.ps1`
Expected: release APK files created under `android/app/build/outputs/apk/release`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pack-android-release.ps1 package.json
git commit -m "feat: add local android release packaging script"
```

### Task 3: GitHub Release Workflow

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `.github/actions/upload-artifact/action.yml`

- [ ] **Step 1: Write the failing test**

```js
test('release workflow supports push to main and manual dispatch', () => {
  const workflow = fs.readFileSync('.github/workflows/release.yml', 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /branches:\s*\n\s*-\s*main/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/release/versioning.test.js`
Expected: FAIL because the workflow still targets `master` and lacks manual dispatch.

- [ ] **Step 3: Implement the release workflow**

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

- [ ] **Step 4: Verify workflow structure**

Run: `node --test tests/release/versioning.test.js`
Expected: PASS for trigger/concurrency/version-commit assertions.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml .github/actions/upload-artifact/action.yml
git commit -m "feat: automate github releases from main"
```

### Task 4: End-to-End Verification

**Files:**
- Verify: `package.json`
- Verify: `publish/version.json`
- Verify: `CHANGELOG.md`
- Verify: `android/app/build/outputs/apk/release`

- [ ] **Step 1: Run targeted tests**

Run: `node --test tests/release/versioning.test.js`
Expected: PASS with all release-version tests green.

- [ ] **Step 2: Run local packaging verification**

Run: `powershell -ExecutionPolicy Bypass -File .\scripts\pack-android-release.ps1`
Expected: PASS and generate release APKs named with `yymmddhh`.

- [ ] **Step 3: Inspect git diff for release workflow/files**

Run: `git status --short && git diff -- .github/workflows/release.yml package.json publish/version.json CHANGELOG.md`
Expected: only intended release-automation changes present.

- [ ] **Step 4: Request code review**

Run: compare the final diff and ask for a review pass before merge.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add release automation pipeline"
```
