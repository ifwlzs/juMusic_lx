# OneDrive Business Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the smallest working OneDrive enterprise login flow for Android debug builds by aligning the app package name with the Microsoft Entra registration, wiring MSAL Android into a native bridge, and exposing a settings entry that can sign in, sign out, and display the current account.

**Architecture:** Keep this phase authentication-only. Android owns the MSAL single-account client and token cache; React Native only sees a narrow account/session surface through a dedicated native module. The media-source import provider stays out of scope for this turn, so the UI entry lives beside existing media-source settings instead of pretending full OneDrive import already exists.

**Tech Stack:** React Native 0.73, Java Android native modules, MSAL Android, node:test static assertions, existing settings/i18n patterns

---

### Task 1: Lock the OneDrive login contract with failing tests

**Files:**
- Create: `tests/media-library/onedrive-auth-setup.test.js`
- Modify: `tests/media-library/media-source-settings-ui.test.js`
- Test: `android/app/build.gradle`
- Test: `android/app/src/main/AndroidManifest.xml`
- Test: `android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java`
- Test: `android/app/src/main/java/io/ifwlzs/jumusic/lx/onedrive/OneDriveAuthModule.java`
- Test: `src/utils/nativeModules/oneDriveAuth.ts`
- Test: `src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx`

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('android package and msal setup target io.ifwlzs.jumusic.lx debug registration', () => {
  const buildGradle = readFile('android/app/build.gradle')
  const manifest = readFile('android/app/src/main/AndroidManifest.xml')
  const mainApplication = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java')

  assert.match(buildGradle, /namespace "io\.ifwlzs\.jumusic\.lx"/)
  assert.match(buildGradle, /applicationId "io\.ifwlzs\.jumusic\.lx"/)
  assert.match(buildGradle, /com\.microsoft\.identity\.client:msal:/)
  assert.match(manifest, /com\.microsoft\.identity\.client\.BrowserTabActivity/)
  assert.match(manifest, /android:host="io\.ifwlzs\.jumusic\.lx"/)
  assert.match(manifest, /android:path="\/Xo8WBi6jzSxKDVR4drqm84yr9iU="/)
  assert.match(mainApplication, /packages\.add\(new OneDriveAuthPackage\(\)\)/)
})

test('onedrive auth bridge exposes sign in, sign out, and current account helpers', () => {
  const moduleFile = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/onedrive/OneDriveAuthModule.java')
  const jsFile = readFile('src/utils/nativeModules/oneDriveAuth.ts')

  assert.match(moduleFile, /class OneDriveAuthModule extends ReactContextBaseJavaModule/)
  assert.match(moduleFile, /createSingleAccountPublicClientApplication/)
  assert.match(moduleFile, /public void signIn\(Promise promise\)/)
  assert.match(moduleFile, /public void signOut\(Promise promise\)/)
  assert.match(moduleFile, /public void getCurrentAccount\(Promise promise\)/)
  assert.match(jsFile, /NativeModules/)
  assert.match(jsFile, /OneDriveAuthModule/)
  assert.match(jsFile, /signInOneDriveBusiness/)
  assert.match(jsFile, /signOutOneDriveBusiness/)
  assert.match(jsFile, /getOneDriveBusinessAccount/)
})

test('media sources settings exposes an enterprise onedrive login entry with account status', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx')

  assert.match(file, /setting_media_sources_onedrive_title/)
  assert.match(file, /setting_media_sources_onedrive_sign_in/)
  assert.match(file, /setting_media_sources_onedrive_sign_out/)
  assert.match(file, /getOneDriveBusinessAccount/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/media-library/onedrive-auth-setup.test.js tests/media-library/media-source-settings-ui.test.js`
Expected: FAIL because the package is still `cn.toside.music.mobile`, no MSAL dependency/config exists, no OneDrive native bridge exists, and the settings page has no OneDrive login entry.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/media-library/onedrive-auth-setup.test.js tests/media-library/media-source-settings-ui.test.js
git commit -m "test: lock onedrive business auth setup contract"
```

### Task 2: Align Android package identity with the Entra registration

**Files:**
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/settings.gradle`
- Modify: `android/app/src/release/java/io/ifwlzs/jumusic/lx/ReactNativeFlipper.java`
- Move/Modify: `android/app/src/main/java/cn/toside/music/mobile/**` -> `android/app/src/main/java/io/ifwlzs/jumusic/lx/**`
- Modify: `src/config/constant.ts`
- Modify: `src/core/init/mediaLibrary.ts`
- Modify: `scripts/media-library/push-dev-seed.ps1`

- [ ] **Step 1: Rename the Android package and provider references**

```gradle
namespace "io.ifwlzs.jumusic.lx"
defaultConfig {
    applicationId "io.ifwlzs.jumusic.lx"
}
```

```xml
<manifest package="io.ifwlzs.jumusic.lx">
```

```ts
export const APP_PROVIDER_NAME = 'io.ifwlzs.jumusic.lx.provider'
```

```ts
const DEV_SEED_FILE_PATH = `${externalStorageDirectoryPath}/Android/media/io.ifwlzs.jumusic.lx/media-library-dev-seed.json`
```

- [ ] **Step 2: Move Java package tree and update package declarations/imports**

```java
package io.ifwlzs.jumusic.lx;

import io.ifwlzs.jumusic.lx.cache.CachePackage;
import io.ifwlzs.jumusic.lx.crypto.CryptoPackage;
import io.ifwlzs.jumusic.lx.lyric.LyricPackage;
import io.ifwlzs.jumusic.lx.onedrive.OneDriveAuthPackage;
import io.ifwlzs.jumusic.lx.smb.SmbPackage;
import io.ifwlzs.jumusic.lx.userApi.UserApiPackage;
import io.ifwlzs.jumusic.lx.utils.UtilsPackage;
```

- [ ] **Step 3: Run the setup test again**

Run: `node --test tests/media-library/onedrive-auth-setup.test.js`
Expected: Still FAIL, but only on MSAL/native module/settings assertions because the package rename contract is now satisfied.

- [ ] **Step 4: Commit package alignment**

```bash
git add android/app android/settings.gradle src/config/constant.ts src/core/init/mediaLibrary.ts scripts/media-library/push-dev-seed.ps1
git commit -m "refactor: align android package with onedrive registration"
```

### Task 3: Add MSAL Android config and native OneDrive auth bridge

**Files:**
- Modify: `android/build.gradle`
- Modify: `android/app/build.gradle`
- Create: `android/app/src/main/res/raw/auth_config_single_account.json`
- Create: `android/app/src/main/java/io/ifwlzs/jumusic/lx/onedrive/OneDriveAuthModule.java`
- Create: `android/app/src/main/java/io/ifwlzs/jumusic/lx/onedrive/OneDriveAuthPackage.java`
- Modify: `android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `src/utils/nativeModules/oneDriveAuth.ts`

- [ ] **Step 1: Add the MSAL repository and dependency**

```gradle
allprojects {
    repositories {
        maven {
            url 'https://pkgs.dev.azure.com/MicrosoftDeviceSDK/DuoSDK-Public/_packaging/Duo-SDK-Feed/maven/v1'
            name 'Duo-SDK-Feed'
        }
        mavenCentral()
        google()
    }
}
```

```gradle
implementation 'com.microsoft.identity.client:msal:8.+'
```

- [ ] **Step 2: Add the single-account MSAL config for the current debug signing hash**

```json
{
  "client_id": "116da1c1-fc09-4a63-b44d-61f4ebad5e4f",
  "authorization_user_agent": "DEFAULT",
  "redirect_uri": "msauth://io.ifwlzs.jumusic.lx/Xo8WBi6jzSxKDVR4drqm84yr9iU%3D",
  "broker_redirect_uri_registered": true,
  "account_mode": "SINGLE",
  "authorities": [
    {
      "type": "AAD",
      "audience": {
        "type": "AzureADMultipleOrgs"
      }
    }
  ],
  "logging": {
    "log_level": "VERBOSE",
    "logcat_enabled": true,
    "pii_enabled": false
  }
}
```

- [ ] **Step 3: Register BrowserTabActivity with raw manifest hash**

```xml
<activity
  android:name="com.microsoft.identity.client.BrowserTabActivity"
  android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
      android:scheme="msauth"
      android:host="io.ifwlzs.jumusic.lx"
      android:path="/Xo8WBi6jzSxKDVR4drqm84yr9iU=" />
  </intent-filter>
</activity>
```

- [ ] **Step 4: Implement the native module with a narrow account surface**

```java
@ReactMethod
public void signIn(Promise promise) { /* create / reuse single-account PCA, launch interactive acquire token, resolve account info */ }

@ReactMethod
public void signOut(Promise promise) { /* sign out current account and resolve true */ }

@ReactMethod
public void getCurrentAccount(Promise promise) { /* resolve null or account summary */ }
```

```ts
export interface OneDriveBusinessAccount {
  homeAccountId: string
  username: string
  tenantId?: string | null
  environment?: string | null
  authority?: string | null
  idTokenClaims?: Record<string, string | number | boolean | null> | null
}

export const signInOneDriveBusiness = async() => OneDriveAuthModule.signIn()
export const signOutOneDriveBusiness = async() => OneDriveAuthModule.signOut()
export const getOneDriveBusinessAccount = async() => OneDriveAuthModule.getCurrentAccount()
```

- [ ] **Step 5: Run the setup test again**

Run: `node --test tests/media-library/onedrive-auth-setup.test.js`
Expected: PASS for package/config/native bridge assertions.

- [ ] **Step 6: Compile Android debug sources**

Run: `cd android && .\\gradlew.bat :app:compileDebugJavaWithJavac`
Expected: BUILD SUCCESSFUL, proving the renamed package tree and MSAL bridge compile together.

- [ ] **Step 7: Commit MSAL bridge**

```bash
git add android/build.gradle android/app/build.gradle android/app/src/main/AndroidManifest.xml android/app/src/main/res/raw/auth_config_single_account.json android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java android/app/src/main/java/io/ifwlzs/jumusic/lx/onedrive src/utils/nativeModules/oneDriveAuth.ts
git commit -m "feat: add onedrive business auth bridge"
```

### Task 4: Expose a minimal settings entry for enterprise OneDrive login

**Files:**
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx`
- Modify: `src/lang/en-us.json`
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`

- [ ] **Step 1: Add a focused OneDrive auth block under Media Sources**

```tsx
const [oneDriveAccount, setOneDriveAccount] = useState<OneDriveBusinessAccount | null>(null)

const loadOneDriveAccount = async() => {
  setOneDriveAccount(await getOneDriveBusinessAccount())
}
```

```tsx
<Text size={12} style={styles.summary}>
  {oneDriveAccount
    ? t('setting_media_sources_onedrive_signed_in', { username: oneDriveAccount.username })
    : t('setting_media_sources_onedrive_signed_out')}
</Text>
<View style={styles.actions}>
  <Button onPress={() => { void handleSignIn() }}>{t('setting_media_sources_onedrive_sign_in')}</Button>
  <Button onPress={() => { void handleSignOut() }}>{t('setting_media_sources_onedrive_sign_out')}</Button>
</View>
```

- [ ] **Step 2: Add i18n strings for the new state and actions**

```json
"setting_media_sources_onedrive_title": "OneDrive 企业账号",
"setting_media_sources_onedrive_sign_in": "登录",
"setting_media_sources_onedrive_sign_out": "退出登录",
"setting_media_sources_onedrive_signed_out": "未登录",
"setting_media_sources_onedrive_signed_in": "当前账号：{username}"
```

- [ ] **Step 3: Run the UI/setup tests**

Run: `node --test tests/media-library/onedrive-auth-setup.test.js tests/media-library/media-source-settings-ui.test.js`
Expected: PASS with the OneDrive entry visible in the settings source page and the auth bridge contract still green.

- [ ] **Step 4: Commit the settings entry**

```bash
git add src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx src/lang/en-us.json src/lang/zh-cn.json src/lang/zh-tw.json
git commit -m "feat: add onedrive business settings entry"
```

### Task 5: Verify the debug build and emulator flow

**Files:**
- Verify only

- [ ] **Step 1: Run focused regression**

Run: `node --test tests/media-library/connection-validation.test.js tests/media-library/media-source-settings-ui.test.js tests/media-library/onedrive-auth-setup.test.js`
Expected: PASS with 0 failures.

- [ ] **Step 2: Run broader media/settings regression**

Run: `$files = @(Get-ChildItem 'tests/media-library/*.test.js' | ForEach-Object FullName) + @(Get-ChildItem 'tests/mylist/*.test.js' | ForEach-Object FullName) + @(Get-ChildItem 'tests/play-detail/*.test.js' | ForEach-Object FullName); node --test $files`
Expected: PASS, ensuring the package rename and settings changes did not regress existing media-library and playback work.

- [ ] **Step 3: Build and install the debug app**

Run: `cd android && .\\gradlew.bat assembleDebug`
Expected: BUILD SUCCESSFUL and a debug APK under `android/app/build/outputs/apk/debug/`.

Run: `adb -s emulator-5554 install -r app\\build\\outputs\\apk\\debug\\lx-music-mobile-v26040508-universal.apk`
Expected: Success.

- [ ] **Step 4: Refresh emulator launch**

Run: `adb -s emulator-5554 reverse tcp:8081 tcp:8081`
Expected: no output or success.

Run: `adb -s emulator-5554 shell am force-stop io.ifwlzs.jumusic.lx`
Expected: command exits successfully.

Run: `adb -s emulator-5554 shell monkey -p io.ifwlzs.jumusic.lx -c android.intent.category.LAUNCHER 1`
Expected: app launches with the renamed package.

- [ ] **Step 5: Record the Azure follow-up that remains outside code**

The current local debug keystore hash is `Xo8WBi6jzSxKDVR4drqm84yr9iU=`. Azure should keep the existing redirect and add this debug redirect as an extra Android platform entry:

```text
msauth://io.ifwlzs.jumusic.lx/Xo8WBi6jzSxKDVR4drqm84yr9iU%3D
```

This is required because the previously provided redirect hash (`huDKkJaLn3XaJZfD9txm3L+3uec=`) does not match the current local debug signing certificate.

## Self-Review

- Spec coverage: Task 2 aligns the Android package identity, Task 3 adds MSAL single-account auth and the native bridge, Task 4 exposes the minimal settings login entry, and Task 5 documents the necessary Azure redirect follow-up caused by the real debug signing hash.
- Placeholder scan: No `TODO`/`TBD` placeholders remain; each task identifies target files, test commands, and expected outcomes.
- Type consistency: The plan uses one JS account shape (`OneDriveBusinessAccount`), one Android package (`io.ifwlzs.jumusic.lx`), one raw manifest signature hash (`Xo8WBi6jzSxKDVR4drqm84yr9iU=`), and one encoded MSAL redirect URI (`...%3D`) throughout.
