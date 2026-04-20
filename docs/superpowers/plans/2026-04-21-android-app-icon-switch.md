# Android App Icon Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Android-only in-app app-icon switching between icon1/icon2, with icon1 default and persistent selection across app restarts.

**Architecture:** Use Android `activity-alias` launcher entries (`MainActivityIcon1` + `MainActivityIcon2`) and a new native module to toggle alias enabled state. JS adds a thin native wrapper and a setting item in Basic settings that updates app setting state and invokes native switch; default is icon1.

**Tech Stack:** React Native (TypeScript + Java), Android Manifest/resources, node:test file-contract tests

---

## File Structure

### Create
- `android/app/src/main/java/io/ifwlzs/jumusic/lx/appicon/AppIconModule.java` — Android native module for get/set current app icon alias
- `android/app/src/main/java/io/ifwlzs/jumusic/lx/appicon/AppIconPackage.java` — ReactPackage for AppIconModule
- `src/utils/nativeModules/appIcon.ts` — JS bridge wrapper for app icon native module
- `src/screens/Home/Views/Setting/settings/Basic/AppIcon.tsx` — setting UI for icon1/icon2 switch
- `tests/media-library/app-icon-switch.test.js` — contract tests for manifest/resources/settings glue

### Modify
- `android/app/src/main/AndroidManifest.xml` — remove launcher from MainActivity, add two launcher aliases
- `android/app/src/main/res/mipmap-*/` — add icon2 launcher png sets (`ic_launcher_alt*`)
- `android/app/src/main/res/mipmap-anydpi-v26/` — add adaptive icon xml for icon2
- `android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java` — register `AppIconPackage`
- `src/screens/Home/Views/Setting/settings/Basic/index.tsx` — mount new AppIcon setting item
- `src/config/defaultSetting.ts` — add default setting key `common.appIcon = 'icon1'`
- `src/types/app_setting.d.ts` — add setting type definition
- `src/core/common.ts` / existing setting update flow usage sites if needed
- `src/lang/zh-cn.json`, `src/lang/zh-tw.json`, `src/lang/en-us.json` — add app-icon setting i18n keys

---

### Task 1: Add failing contract tests for Android alias/icon switch integration

**Files:**
- Create: `tests/media-library/app-icon-switch.test.js`
- Test: `tests/media-library/app-icon-switch.test.js`

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('android manifest defines icon aliases and launcher moved away from MainActivity', () => {
  const manifest = readFile('android/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /android:name="\.MainActivity"[\s\S]*?<\/activity>/)
  assert.doesNotMatch(manifest, /<activity[\s\S]*android:name="\.MainActivity"[\s\S]*?android\.intent\.category\.LAUNCHER/)
  assert.match(manifest, /android:name="\.MainActivityIcon1"/)
  assert.match(manifest, /android:name="\.MainActivityIcon2"/)
  assert.match(manifest, /android:enabled="true"[\s\S]*MainActivityIcon1/)
  assert.match(manifest, /android:enabled="false"[\s\S]*MainActivityIcon2/)
})

test('app icon native module and settings bindings are wired', () => {
  const mainApp = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java')
  const basicIndex = readFile('src/screens/Home/Views/Setting/settings/Basic/index.tsx')
  const wrapper = readFile('src/utils/nativeModules/appIcon.ts')
  assert.match(mainApp, /new AppIconPackage\(\)/)
  assert.match(basicIndex, /import\s+AppIcon\s+from\s+'\.\/AppIcon'/)
  assert.match(basicIndex, /<AppIcon\s*\/>/)
  assert.match(wrapper, /NativeModules/)
  assert.match(wrapper, /setAppIcon|setIcon/)
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `node --test tests/media-library/app-icon-switch.test.js`
Expected: FAIL because aliases/module/files are missing.

- [ ] **Step 3: Commit test scaffold**

```bash
git add tests/media-library/app-icon-switch.test.js
git commit -m "test: add app icon switch integration contracts"
```

### Task 2: Implement Android launcher aliases and icon2 resources

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify/Create: `android/app/src/main/res/mipmap-*/ic_launcher_alt*.png`
- Create: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_alt.xml`

- [ ] **Step 1: Implement manifest aliases**

- Move `MAIN + LAUNCHER` from `MainActivity`
- Add alias `MainActivityIcon1` (enabled=true, icon1)
- Add alias `MainActivityIcon2` (enabled=false, icon2)
- Keep deep-link/file intent-filters on `MainActivity`

- [ ] **Step 2: Add icon2 launcher resources**

- Add `ic_launcher_alt.png` and `ic_launcher_alt_round.png` in all mipmap density dirs
- Add adaptive icon xml `mipmap-anydpi-v26/ic_launcher_alt.xml`

- [ ] **Step 3: Run tests to verify pass**

Run: `node --test tests/media-library/app-icon-switch.test.js`
Expected: still FAIL on native module/settings contract; manifest/icon checks pass.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml android/app/src/main/res/mipmap-* android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_alt.xml
git commit -m "feat: add android launcher aliases for icon switching"
```

### Task 3: Add native module for get/set current app icon alias

**Files:**
- Create: `android/app/src/main/java/io/ifwlzs/jumusic/lx/appicon/AppIconModule.java`
- Create: `android/app/src/main/java/io/ifwlzs/jumusic/lx/appicon/AppIconPackage.java`
- Modify: `android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java`

- [ ] **Step 1: Add failing test assertion for MainApplication package registration if missing**

(Already covered by Task1 second test)

- [ ] **Step 2: Implement minimal native module**

- Module name: `AppIconModule`
- Methods:
  - `setIcon(String iconId, Promise promise)` supports `icon1|icon2`
  - `getCurrentIcon(Promise promise)` returns `icon1|icon2`
- Use `PackageManager.setComponentEnabledSetting(..., DONT_KILL_APP)`
- Ensure exactly one alias enabled after switch

- [ ] **Step 3: Register package in MainApplication**

```java
packages.add(new AppIconPackage());
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/media-library/app-icon-switch.test.js`
Expected: fail only because JS wrapper/setting UI not yet wired.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/io/ifwlzs/jumusic/lx/appicon android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java
git commit -m "feat: add android native app icon switch module"
```

### Task 4: Add JS native wrapper and setting type/default

**Files:**
- Create: `src/utils/nativeModules/appIcon.ts`
- Modify: `src/config/defaultSetting.ts`
- Modify: `src/types/app_setting.d.ts`

- [ ] **Step 1: Write/extend failing tests for setting key existence**

Add assertion in `tests/media-library/app-icon-switch.test.js`:

```js
const defaultSetting = readFile('src/config/defaultSetting.ts')
const settingType = readFile('src/types/app_setting.d.ts')
assert.match(defaultSetting, /'common\.appIcon':\s*'icon1'/)
assert.match(settingType, /'common\.appIcon':\s*'icon1'\s*\|\s*'icon2'/)
```

- [ ] **Step 2: Implement JS wrapper**

- Read from `NativeModules.AppIconModule`
- Export:
  - `getCurrentAppIcon(): Promise<'icon1' | 'icon2'>`
  - `setCurrentAppIcon(icon: 'icon1' | 'icon2'): Promise<void>`

- [ ] **Step 3: Add setting key/type default**

- `defaultSetting['common.appIcon'] = 'icon1'`
- AppSetting type add `'common.appIcon': 'icon1' | 'icon2'`

- [ ] **Step 4: Run tests**

Run: `node --test tests/media-library/app-icon-switch.test.js`
Expected: still fail on UI/i18n binding.

- [ ] **Step 5: Commit**

```bash
git add src/utils/nativeModules/appIcon.ts src/config/defaultSetting.ts src/types/app_setting.d.ts tests/media-library/app-icon-switch.test.js
git commit -m "feat: add app icon setting model and native wrapper"
```

### Task 5: Add Basic setting UI + i18n and persist switch behavior

**Files:**
- Create: `src/screens/Home/Views/Setting/settings/Basic/AppIcon.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/index.tsx`
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`

- [ ] **Step 1: Extend failing tests for i18n keys**

Add assertions:

```js
for (const lang of ['zh-cn', 'zh-tw', 'en-us']) {
  const content = readFile(`src/lang/${lang}.json`)
  assert.match(content, /"setting_basic_app_icon"\s*:/)
  assert.match(content, /"setting_basic_app_icon_icon1"\s*:/)
  assert.match(content, /"setting_basic_app_icon_icon2"\s*:/)
}
```

- [ ] **Step 2: Implement setting UI component**

- Pattern follow `ShareType.tsx` / `SourceName.tsx`
- Read `common.appIcon`
- On select:
  - call `setCurrentAppIcon(iconId)`
  - on success `updateSetting({ 'common.appIcon': iconId })`
  - on failure `toast(error.message)` and do not update setting

- [ ] **Step 3: Mount component in Basic settings index**

- Import and render `<AppIcon />`

- [ ] **Step 4: Add i18n keys**

- `setting_basic_app_icon`
- `setting_basic_app_icon_icon1`
- `setting_basic_app_icon_icon2`

- [ ] **Step 5: Run tests**

Run: `node --test tests/media-library/app-icon-switch.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/screens/Home/Views/Setting/settings/Basic/AppIcon.tsx src/screens/Home/Views/Setting/settings/Basic/index.tsx src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json tests/media-library/app-icon-switch.test.js
git commit -m "feat: add android in-app icon switch setting"
```

### Task 6: Final verification and usage note

**Files:**
- Modify: `CHANGELOG.md` (if needed for this feature note)

- [ ] **Step 1: Run targeted tests**

Run: `node --test tests/media-library/app-icon-switch.test.js`
Expected: PASS

- [ ] **Step 2: Run existing related suite smoke**

Run: `npm run test:media-library`
Expected: PASS (or pre-existing failures clearly identified)

- [ ] **Step 3: Manual verification checklist**

- Install debug build, default launcher is icon1
- In Basic settings switch to icon2
- Return home screen and verify icon changed
- Kill/reopen app and verify stays icon2
- Switch back icon1 and verify

- [ ] **Step 4: Commit final docs/changelog (if updated)**

```bash
git add CHANGELOG.md
git commit -m "docs: note android app icon switch"
```

## Self-review

### Spec coverage
- Android-only scope: Task 2/3/5
- Default icon1: Task 2 + Task 4 default setting
- In-app switching: Task 3 + Task 5
- Restart persistence: alias enabled-state + setting persistence in Task 3/4/5
- Icon assets from user-provided icon1/icon2: Task 2

### Placeholder scan
- No TODO/TBD placeholders
- Each task has explicit files, commands, expected outcomes

### Type consistency
- Icon IDs consistently `'icon1' | 'icon2'`
- Setting key consistently `'common.appIcon'`
- JS wrapper naming consistently `getCurrentAppIcon` / `setCurrentAppIcon`
