# Play Detail Ambient Dark Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent static dark multicolor play-detail background that preserves every existing blur setting and forces the entire play-detail foreground to a white hierarchy while selected.

**Architecture:** Keep the existing `PlayDetailBackgroundLayer` unchanged for `blur`. Add a pure ambient palette resolver, a dedicated `AmbientDarkBackgroundLayer`, and a reusable `useAmbientDarkPalette` hook that obtains up to three Android-native cover colors with dominant-hue and neutral fallbacks. `PageContent` and the settings preview select the renderer from the new variant setting, while `playDetailPalette` provides runtime white colors only for `ambientDark`.

**Tech Stack:** React Native 0.73, TypeScript 5.9, `react-native-linear-gradient`, Android Java native module, Node `node:test`, ESLint, Gradle.

## Global Constraints

- The formal setting key is `theme.playDetail.background.variant` with values `'blur' | 'ambientDark'` and default `'blur'`.
- Switching variants must not read, reset, reuse, or overwrite any of the eleven existing blur-background setting values.
- `ambientDark` is static: no timers, animated values, drifting color shapes, or looping transitions.
- Ambient colors must be normalized to a dark range before rendering; white, yellow, and saturated red covers must still produce a dark background.
- Every play-detail foreground surface uses a white base in `ambientDark`; hierarchy is expressed only with alpha.
- Existing light/dark custom foreground colors remain persisted and resume immediately when switching back to `blur`.
- Every new class, function, complex branch, native bridge, and setting contract receives a concise Chinese comment explaining intent and fallback behavior.
- The settings preview and production play-detail page must share the same palette resolver and background component.

---

## File Structure

**Create:**

- `src/screens/PlayDetail/AmbientDarkBackgroundLayer.tsx` - renders the static multistop dark gradient and fixed readability overlay.
- `src/screens/PlayDetail/useAmbientDarkPalette.ts` - owns asynchronous native color extraction, stale-request suppression, and fallback sequencing.
- `tests/play-detail/ambient-dark-background.test.js` - executes pure palette logic and asserts runtime/UI/native integration contracts.

**Modify:**

- `src/types/app_setting.d.ts` - declares the variant setting.
- `src/config/defaultSetting.ts` - defaults the variant to `blur`.
- `src/screens/PlayDetail/backgroundConfig.ts` - defines ambient palette types, dark normalization, hue fallback, and neutral fallback.
- `src/utils/nativeModules/utils.ts` - exposes a guarded `extractDominantColorsFromImage` promise.
- `android/app/src/main/java/io/ifwlzs/jumusic/lx/utils/UtilsModule.java` - extracts up to three separated representative colors from a decoded cover.
- `src/components/PageContent.tsx` - selects the blur or ambient runtime without mixing their parameters.
- `src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx` - adds the segmented variant selector and shared ambient preview.
- `src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx` - reports the selected variant in the settings summary.
- `src/screens/PlayDetail/palette.ts` - returns white-only foreground colors for `ambientDark`.
- `src/screens/PlayDetail/index.tsx` - includes the background variant in the render key so a live switch updates every foreground consumer.
- `src/lang/zh-cn.json`, `src/lang/zh-tw.json`, `src/lang/en-us.json` - adds selector, summary, and ambient description copy.
- `tests/play-detail/background-settings.test.js` - extends the persisted-setting and settings-dialog contract.
- `tests/play-detail/foreground-colors.test.js` - extends the white foreground contract.
- `tests/play-detail/background-preset.test.js` - asserts both renderers remain separate.
- `CHANGELOG.md` - records the user-visible background option.

---

### Task 1: Add the independent variant setting contract

**Files:**
- Modify: `src/types/app_setting.d.ts`
- Modify: `src/config/defaultSetting.ts`
- Modify: `tests/play-detail/background-settings.test.js`

**Interfaces:**
- Produces: `LX.AppSetting['theme.playDetail.background.variant']` with type `'blur' | 'ambientDark'`.
- Produces: a backward-compatible default of `'blur'`.
- Consumes: no prior task output.

- [ ] **Step 1: Write the failing setting contract test**

Add these assertions to the first test in `tests/play-detail/background-settings.test.js`:

```js
assert.match(appSettingFile, /'theme\.playDetail\.background\.variant': 'blur' \| 'ambientDark'/)
assert.match(defaultSettingFile, /'theme\.playDetail\.background\.variant': 'blur'/)
```

Also add a guard proving the legacy defaults remain present:

```js
for (const key of ['stretchScale', 'blurRadius', 'maskColor', 'vignetteSize']) {
  assert.match(defaultSettingFile, new RegExp(`'theme\\.playDetail\\.background\\.${key}'`))
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/play-detail/background-settings.test.js
```

Expected: FAIL because the new variant key is absent from the type and defaults.

- [ ] **Step 3: Add the minimal setting declaration and default**

Add next to the existing play-detail background keys:

```ts
// 仅选择播放页背景渲染方案；旧模糊参数独立保存，切换方案时不参与改写。
'theme.playDetail.background.variant': 'blur' | 'ambientDark'
```

Add to `defaultSetting.ts` before the eleven existing blur values:

```ts
// 升级后继续使用原背景，避免已有用户的视觉效果被静默切换。
'theme.playDetail.background.variant': 'blur',
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test tests/play-detail/background-settings.test.js
```

Expected: all tests in the file PASS.

- [ ] **Step 5: Commit the setting contract**

```powershell
git add src/types/app_setting.d.ts src/config/defaultSetting.ts tests/play-detail/background-settings.test.js
git commit -m "feat(player): add ambient background variant setting"
```

---

### Task 2: Build and test the pure dark ambient palette resolver

**Files:**
- Modify: `src/screens/PlayDetail/backgroundConfig.ts`
- Create: `tests/play-detail/ambient-dark-background.test.js`

**Interfaces:**
- Produces: `AmbientDarkPalette = readonly [string, string, string]`.
- Produces: `ambientDarkFallbackPalette: AmbientDarkPalette`.
- Produces: `resolveAmbientDarkPalette(colors: string[], fallbackHue?: number | null): AmbientDarkPalette`.
- Consumes: the existing HSL/RGB helpers in `backgroundConfig.ts`.

- [ ] **Step 1: Create an executable TypeScript test harness**

Create `tests/play-detail/ambient-dark-background.test.js` with a loader that transpiles the import-free config module:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const configPath = path.resolve(__dirname, '../../src/screens/PlayDetail/backgroundConfig.ts')

// 直接执行纯配置函数，避免静态字符串断言掩盖暗色归一化错误。
const loadBackgroundConfig = () => {
  const source = fs.readFileSync(configPath, 'utf8')
  const outputText = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: configPath,
  }).outputText
  const mod = new Module(configPath, module)
  mod.filename = configPath
  mod.paths = Module._nodeModulePaths(path.dirname(configPath))
  mod._compile(outputText, configPath)
  return mod.exports
}

const rgbLightness = hex => {
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  return (Math.max(...channels) + Math.min(...channels)) / 2
}
```

- [ ] **Step 2: Add failing behavior tests for bright, sparse, and invalid palettes**

Append:

```js
test('ambient palette keeps three cover relationships inside the dark lightness ceiling', () => {
  const { resolveAmbientDarkPalette } = loadBackgroundConfig()
  const palette = resolveAmbientDarkPalette(['#ffffff', '#ffe600', '#ff0000', '#00ff66'])

  assert.equal(palette.length, 3)
  assert.equal(new Set(palette).size, 3)
  for (const color of palette) {
    assert.match(color, /^#[0-9a-f]{6}$/)
    assert.ok(rgbLightness(color) <= 0.24, `${color} is not dark enough`)
  }
})

test('ambient palette derives missing colors and falls back for invalid input', () => {
  const { ambientDarkFallbackPalette, resolveAmbientDarkPalette } = loadBackgroundConfig()

  const derived = resolveAmbientDarkPalette(['#4a90e2'])
  assert.equal(derived.length, 3)
  assert.equal(new Set(derived).size, 3)
  assert.deepEqual(resolveAmbientDarkPalette(['bad', '', '#gggggg']), ambientDarkFallbackPalette)
})

test('ambient palette can derive a cover-related fallback from dominant hue', () => {
  const { ambientDarkFallbackPalette, resolveAmbientDarkPalette } = loadBackgroundConfig()
  assert.notDeepEqual(resolveAmbientDarkPalette([], 140), ambientDarkFallbackPalette)
})
```

- [ ] **Step 3: Run the new test and verify RED**

Run:

```powershell
node --test tests/play-detail/ambient-dark-background.test.js
```

Expected: FAIL because ambient palette exports do not exist.

- [ ] **Step 4: Implement the minimal pure resolver**

Add these public contracts and equivalent pure helpers to `backgroundConfig.ts`:

```ts
export type AmbientDarkPalette = readonly [string, string, string]

export const ambientDarkFallbackPalette: AmbientDarkPalette = ['#241a26', '#13241f', '#10151c']

const AMBIENT_MAX_LIGHTNESS = 0.24
const AMBIENT_MIN_LIGHTNESS = 0.1
const AMBIENT_MIN_SATURATION = 0.24
const AMBIENT_MAX_SATURATION = 0.52
const HEX_COLOR_RXP = /^#[0-9a-f]{6}$/i

// 将封面原色限制在暗色阅读范围，同时保留可区分封面的色相关系。
const normalizeAmbientColor = (hex: string) => {
  const hsl = rgbToHsl(hexToRgb(hex))
  return rgbToHex(hslToRgb(
    hsl.hue,
    clamp(hsl.saturation, AMBIENT_MIN_SATURATION, AMBIENT_MAX_SATURATION),
    clamp(hsl.lightness * 0.42, AMBIENT_MIN_LIGHTNESS, AMBIENT_MAX_LIGHTNESS),
  ))
}

// 颜色不足时围绕已有色相派生邻近色，完全失败时回退到中性暗色组。
export const resolveAmbientDarkPalette = (colors: string[], fallbackHue?: number | null): AmbientDarkPalette => {
  const normalized = colors
    .map(color => color.trim().toLowerCase())
    .filter(color => HEX_COLOR_RXP.test(color))
    .map(normalizeAmbientColor)
    .filter((color, index, list) => list.indexOf(color) == index)

  const seedHue = normalized.length
    ? rgbToHsl(hexToRgb(normalized[0])).hue
    : typeof fallbackHue == 'number' && Number.isFinite(fallbackHue) ? fallbackHue : null
  if (!normalized.length && seedHue == null) return ambientDarkFallbackPalette

  for (const offset of [42, -48, 86]) {
    if (normalized.length >= 3) break
    normalized.push(rgbToHex(hslToRgb((seedHue! + offset + 360) % 360, 0.34, 0.16 + normalized.length * 0.02)))
  }
  return normalized.slice(0, 3) as unknown as AmbientDarkPalette
}
```

Add an `rgbToHsl` helper beside the existing `hslToRgb`; it must return `{ hue, saturation, lightness }` and handle achromatic colors with hue `0`.

- [ ] **Step 5: Run the palette tests and typecheck the helper**

Run:

```powershell
node --test tests/play-detail/ambient-dark-background.test.js
npx tsc --noEmit
```

Expected: palette tests PASS and TypeScript exits `0`.

- [ ] **Step 6: Commit the palette resolver**

```powershell
git add src/screens/PlayDetail/backgroundConfig.ts tests/play-detail/ambient-dark-background.test.js
git commit -m "feat(player): resolve dark ambient cover palettes"
```

---

### Task 3: Add the dedicated static ambient renderer

**Files:**
- Create: `src/screens/PlayDetail/AmbientDarkBackgroundLayer.tsx`
- Modify: `tests/play-detail/ambient-dark-background.test.js`
- Modify: `tests/play-detail/background-preset.test.js`

**Interfaces:**
- Consumes: `AmbientDarkPalette` from Task 2.
- Produces: `AmbientDarkBackgroundLayer({ colors, children })`.
- Produces: no animation or legacy blur configuration dependency.

- [ ] **Step 1: Add failing renderer structure tests**

Append to `ambient-dark-background.test.js`:

```js
test('ambient renderer is static, gradient-based, and independent from legacy blur config', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/PlayDetail/AmbientDarkBackgroundLayer.tsx'), 'utf8')
  assert.match(source, /react-native-linear-gradient/)
  assert.match(source, /colors=\{\[colors\[0\], colors\[1\], colors\[2\]\]\}/)
  assert.match(source, /backgroundColor: 'rgba\(0, 0, 0, 0\.38\)'/)
  assert.doesNotMatch(source, /Animated|setInterval|useEffect|blurRadius|ResolvedPlayDetailBackgroundConfig/)
})
```

Extend `background-preset.test.js`:

```js
assert.match(pageContentFile, /AmbientDarkBackgroundLayer/)
assert.match(pageContentFile, /theme\.playDetail\.background\.variant/)
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node --test tests/play-detail/ambient-dark-background.test.js tests/play-detail/background-preset.test.js
```

Expected: FAIL because the ambient renderer does not exist.

- [ ] **Step 3: Implement the renderer**

Create the component with stable full-screen dimensions:

```tsx
import { StyleSheet, View } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import type { AmbientDarkPalette } from './backgroundConfig'

interface Props {
  colors: AmbientDarkPalette
  children?: React.ReactNode
}

// 静态环境层只绘制暗色多段渐变与可读性遮罩，不读取旧模糊方案参数。
export default function AmbientDarkBackgroundLayer({ colors, children }: Props) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors[0], colors[1], colors[2]]}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0.15 }}
        end={{ x: 1, y: 0.85 }}
        style={styles.absoluteFill}
      />
      <View pointerEvents="none" style={[styles.absoluteFill, styles.readabilityOverlay]} />
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#0b0f13' },
  absoluteFill: { position: 'absolute', inset: 0 },
  readabilityOverlay: { backgroundColor: 'rgba(0, 0, 0, 0.38)' },
  content: { flex: 1, flexDirection: 'column' },
})
```

If React Native's local type rejects `inset`, replace it with explicit `left`, `top`, `right`, and `bottom` values without changing behavior.

- [ ] **Step 4: Run tests and TypeScript**

```powershell
node --test tests/play-detail/ambient-dark-background.test.js tests/play-detail/background-preset.test.js
npx tsc --noEmit
```

Expected: tests PASS and TypeScript exits `0`.

- [ ] **Step 5: Commit the renderer**

```powershell
git add src/screens/PlayDetail/AmbientDarkBackgroundLayer.tsx tests/play-detail/ambient-dark-background.test.js tests/play-detail/background-preset.test.js
git commit -m "feat(player): render static ambient dark background"
```

---

### Task 4: Extend Android color extraction and add the guarded shared hook

**Files:**
- Modify: `android/app/src/main/java/io/ifwlzs/jumusic/lx/utils/UtilsModule.java`
- Modify: `src/utils/nativeModules/utils.ts`
- Create: `src/screens/PlayDetail/useAmbientDarkPalette.ts`
- Modify: `tests/play-detail/ambient-dark-background.test.js`

**Interfaces:**
- Produces native method: `extractDominantColorsFromImage(String imageUri, Promise promise)` resolving `string[]` of zero to three `#rrggbb` values.
- Produces JS bridge: `extractDominantColorsFromImage(imageUri: string): Promise<string[]>`.
- Produces hook: `useAmbientDarkPalette(imageUri?: string | null): AmbientDarkPalette`.
- Consumes: `resolveAmbientDarkPalette`, `ambientDarkFallbackPalette`, and existing `extractDominantHueFromImage`.

- [ ] **Step 1: Add failing native and hook contract assertions**

Append:

```js
test('ambient palette bridge and hook provide native colors with stale-request protection', () => {
  const nativeSource = fs.readFileSync(path.resolve(__dirname, '../../android/app/src/main/java/io/ifwlzs/jumusic/lx/utils/UtilsModule.java'), 'utf8')
  const bridgeSource = fs.readFileSync(path.resolve(__dirname, '../../src/utils/nativeModules/utils.ts'), 'utf8')
  const hookSource = fs.readFileSync(path.resolve(__dirname, '../../src/screens/PlayDetail/useAmbientDarkPalette.ts'), 'utf8')

  assert.match(nativeSource, /extractDominantColorsFromImage\(String imageUri, Promise promise\)/)
  assert.match(nativeSource, /WritableArray/)
  assert.match(bridgeSource, /export const extractDominantColorsFromImage/)
  assert.match(bridgeSource, /Promise\.resolve\(\[\]\)/)
  assert.match(hookSource, /requestVersionRef/)
  assert.match(hookSource, /resolveAmbientDarkPalette/)
  assert.match(hookSource, /extractDominantHueFromImage/)
})
```

- [ ] **Step 2: Run focused test and verify RED**

```powershell
node --test tests/play-detail/ambient-dark-background.test.js
```

Expected: FAIL because the bridge and hook are absent.

- [ ] **Step 3: Implement native extraction using the existing decoded bitmap**

Add a second `@ReactMethod` that reuses `decodeBitmap`. Quantize eligible pixels into 24 hue buckets, weight saturation and midrange lightness, and select at most three buckets separated by at least two bucket positions. Resolve lowercase `#rrggbb` strings in a `WritableArray` and resolve an empty array on any failure.

The method skeleton and selection contract are:

```java
@ReactMethod
public void extractDominantColorsFromImage(String imageUri, Promise promise) {
  new Thread(() -> {
    Bitmap bitmap = null;
    try {
      bitmap = decodeBitmap(imageUri);
      if (bitmap == null) {
        promise.resolve(Arguments.createArray());
        return;
      }
      // 将封面像素按色相聚类，过滤近白、近黑与低饱和噪声，再选取互相分离的前三组代表色。
      promise.resolve(calculateDominantColors(bitmap));
    } catch (Exception error) {
      promise.resolve(Arguments.createArray());
    } finally {
      if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
    }
  }).start();
}
```

`calculateDominantColors(Bitmap bitmap)` must sample with a stride that caps work near 6,400 pixels, skip alpha below `128`, skip HSL lightness outside `0.08..0.92`, skip saturation below `0.12`, aggregate RGB sums and weight per bucket, and emit the average RGB of selected buckets.

- [ ] **Step 4: Add the guarded TypeScript bridge and hook**

Add to `src/utils/nativeModules/utils.ts`:

```ts
// iOS 或旧原生包缺少多色接口时返回空数组，由共享 hook 继续执行主色相回退。
export const extractDominantColorsFromImage = (imageUri: string): Promise<string[]> => {
  if (!UtilsModule?.extractDominantColorsFromImage) return Promise.resolve([])
  return UtilsModule.extractDominantColorsFromImage(imageUri) as Promise<string[]>
}
```

Create `useAmbientDarkPalette.ts` with a monotonically increasing request id. For each image URI:

1. Set the neutral fallback immediately when URI is empty.
2. Await native colors.
3. If the request is still current and colors exist, resolve and store them.
4. Otherwise await the existing dominant hue bridge and derive the fallback palette.
5. Ignore every completion whose request id is stale.

Use this public signature:

```ts
export const useAmbientDarkPalette = (imageUri?: string | null): AmbientDarkPalette
```

- [ ] **Step 5: Verify JS tests, TypeScript, and Android Java compilation**

```powershell
node --test tests/play-detail/ambient-dark-background.test.js
npx tsc --noEmit
Set-Location android
.\gradlew.bat compileDebugJavaWithJavac
Set-Location ..
```

Expected: tests PASS, TypeScript exits `0`, and Gradle ends with `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit native extraction and hook**

```powershell
git add android/app/src/main/java/io/ifwlzs/jumusic/lx/utils/UtilsModule.java src/utils/nativeModules/utils.ts src/screens/PlayDetail/useAmbientDarkPalette.ts tests/play-detail/ambient-dark-background.test.js
git commit -m "feat(player): extract ambient cover colors"
```

---

### Task 5: Select the production renderer and settings preview without touching legacy values

**Files:**
- Modify: `src/components/PageContent.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx`
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`
- Modify: `tests/play-detail/background-settings.test.js`
- Modify: `tests/play-detail/ambient-dark-background.test.js`

**Interfaces:**
- Consumes: setting variant from Task 1, renderer from Task 3, hook from Task 4.
- Produces: live production and preview renderer selection.
- Preserves: `PlayDetailBackgroundSettingValues` and `backgroundSettingKeyMap` as legacy-only contracts.

- [ ] **Step 1: Add failing runtime and settings behavior contracts**

Add assertions that require:

```js
assert.match(pageContentFile, /useSettingValue\('theme\.playDetail\.background\.variant'\)/)
assert.match(pageContentFile, /variant == 'ambientDark'/)
assert.match(pageContentFile, /<AmbientDarkBackgroundLayer/)
assert.match(dialogFile, /setting_theme_play_detail_background_variant_blur/)
assert.match(dialogFile, /setting_theme_play_detail_background_variant_ambient_dark/)
assert.match(dialogFile, /variant == 'blur'/)
assert.match(dialogFile, /<AmbientDarkBackgroundLayer/)
assert.doesNotMatch(dialogFile, /backgroundSettingKeyMap:[\s\S]*variant/)
```

Parse all three language JSON files and assert these keys exist:

```js
const keys = [
  'setting_theme_play_detail_background_variant',
  'setting_theme_play_detail_background_variant_blur',
  'setting_theme_play_detail_background_variant_ambient_dark',
  'setting_theme_play_detail_background_ambient_dark_desc',
]
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node --test tests/play-detail/background-settings.test.js tests/play-detail/ambient-dark-background.test.js tests/play-detail/background-preset.test.js
```

Expected: FAIL because neither production nor settings select the new renderer.

- [ ] **Step 3: Integrate the production renderer**

In `PageContent.tsx`:

- Read `theme.playDetail.background.variant` independently from `readPlayDetailBackgroundSetting`.
- Call `useAmbientDarkPalette(pic)` once.
- Keep the existing blur config resolution unchanged.
- When variant is `ambientDark`, render `AmbientDarkBackgroundLayer` even if there is no cover; its fallback palette handles the empty state.
- When variant is `blur`, preserve the current no-cover fallback and `PlayDetailBackgroundLayer` path.

Do not add `variant` to `PlayDetailBackgroundSettingValues`.

- [ ] **Step 4: Add the segmented settings selector and conditional controls**

In `PlayDetailBackgroundDialog.tsx`:

- Keep `draft` limited to the eleven legacy values.
- Read and display `setting['theme.playDetail.background.variant']` as separate state.
- Each selector button calls only:

```ts
// 方案切换只持久化 variant，确保旧模糊参数与当前草稿均保持不变。
const handleVariantChange = (variant: LX.AppSetting['theme.playDetail.background.variant']) => {
  updateSetting({ 'theme.playDetail.background.variant': variant })
}
```

- Render `AmbientDarkBackgroundLayer` with `useAmbientDarkPalette(musicInfo.pic)` for the ambient preview.
- Wrap all existing slider/input groups in `variant == 'blur' ? (...) : <ambient description>`.
- Keep the restore-default button inside the blur-only branch so it cannot reset legacy values while ambient mode is active.

Update `PlayDetailBackgroundSettings.tsx` summary so ambient mode names the selected variant rather than reporting inactive blur values.

- [ ] **Step 5: Add exact translations**

Use these meanings across the three language files:

```text
zh-cn: 背景方案 / 现有模糊 / 暗色环境 / 从当前封面生成静态暗色多色环境背景，播放页内容统一使用白色。
zh-tw: 背景方案 / 現有模糊 / 暗色環境 / 從目前封面產生靜態暗色多色環境背景，播放頁內容統一使用白色。
en-us: Background style / Existing blur / Dark ambient / Builds a static dark multicolor background from the current cover and uses white content throughout the player.
```

- [ ] **Step 6: Run tests, JSON parsing, and TypeScript**

```powershell
node --test tests/play-detail/background-settings.test.js tests/play-detail/ambient-dark-background.test.js tests/play-detail/background-preset.test.js
node -e "for (const f of ['src/lang/zh-cn.json','src/lang/zh-tw.json','src/lang/en-us.json']) JSON.parse(require('fs').readFileSync(f, 'utf8'))"
npx tsc --noEmit
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit runtime and settings integration**

```powershell
git add src/components/PageContent.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json tests/play-detail/background-settings.test.js tests/play-detail/ambient-dark-background.test.js tests/play-detail/background-preset.test.js
git commit -m "feat(player): expose ambient dark background"
```

---

### Task 6: Force the complete play-detail foreground to a white hierarchy

**Files:**
- Modify: `src/screens/PlayDetail/palette.ts`
- Modify: `src/screens/PlayDetail/index.tsx`
- Modify: `tests/play-detail/foreground-colors.test.js`
- Modify: `tests/play-detail/ambient-dark-background.test.js`

**Interfaces:**
- Consumes: `settingState.setting['theme.playDetail.background.variant']`.
- Produces: white-based values for every existing `playDetailPalette` getter while ambient is selected.
- Preserves: existing theme/custom-color resolution while variant is `blur`.

- [ ] **Step 1: Add a real palette behavior harness and failing assertions**

Transpile `palette.ts` in `ambient-dark-background.test.js`, stubbing `@/store/setting/state`, `@/store/theme/state`, and `@react-native/normalize-colors`. Test with variant `ambientDark`:

```js
assert.equal(palette.PRIMARY_TEXT, '#FFFFFF')
assert.equal(palette.LYRIC_ACTIVE_TEXT, '#FFFFFF')
assert.match(palette.SECONDARY_TEXT, /^rgba\(255, 255, 255, 0\.[0-9]{2}\)$/)
assert.match(palette.LYRIC_INACTIVE_TEXT, /^rgba\(255, 255, 255, 0\.[0-9]{2}\)$/)
assert.equal(palette.PROGRESS_COLORS.thumb, '#FFFFFF')
for (const value of Object.values(palette.PROGRESS_COLORS)) {
  assert.match(value, /^(#FFFFFF|rgba\(255, 255, 255, 0\.[0-9]{2}\))$/)
}
```

Run the same harness with variant `blur` and nonempty custom colors, then assert those custom values are still returned.

Extend `foreground-colors.test.js` to assert `index.tsx` includes the variant in `paletteVersion`.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node --test tests/play-detail/ambient-dark-background.test.js tests/play-detail/foreground-colors.test.js
```

Expected: FAIL because current getters still return theme/custom colors.

- [ ] **Step 3: Implement the ambient white palette branch**

Add shared constants in `palette.ts`:

```ts
const AMBIENT_WHITE = '#FFFFFF'
const ambientWhite = (alpha: number) => `rgba(255, 255, 255, ${alpha.toFixed(2)})`
const isAmbientDark = () => settingState.setting['theme.playDetail.background.variant'] == 'ambientDark'
```

Each getter checks `isAmbientDark()` first. Use this hierarchy consistently:

- `PRIMARY_TEXT`, `LYRIC_ACTIVE_TEXT`: `#FFFFFF`.
- `SECONDARY_TEXT`, active translation/roma: alpha `0.72`.
- `TERTIARY_TEXT`, inactive lyric: alpha `0.46`.
- inactive translation/roma: alpha `0.38`.
- progress track `0.16`, buffered `0.28`, played `0.82`, dragging `0.94`, preview/thumb `1`.

Do not modify the existing `resolvePlayDetailColor` path; it remains the `blur` fallback.

Add the background variant to `paletteVersion` in `PlayDetail/index.tsx` so changing the scheme remounts vertical/horizontal consumers that read getter values during render.

- [ ] **Step 4: Run foreground tests and TypeScript**

```powershell
node --test tests/play-detail/ambient-dark-background.test.js tests/play-detail/foreground-colors.test.js tests/play-detail/theme-customization.test.js
npx tsc --noEmit
```

Expected: tests PASS and TypeScript exits `0`.

- [ ] **Step 5: Commit the white foreground behavior**

```powershell
git add src/screens/PlayDetail/palette.ts src/screens/PlayDetail/index.tsx tests/play-detail/foreground-colors.test.js tests/play-detail/ambient-dark-background.test.js
git commit -m "feat(player): use white palette on ambient background"
```

---

### Task 7: Document and verify the complete background feature

**Files:**
- Modify: `CHANGELOG.md`
- Verify: all files from Tasks 1-6

**Interfaces:**
- Consumes: completed ambient background implementation.
- Produces: user-facing changelog entry and fresh verification evidence.

- [ ] **Step 1: Add a concise changelog entry**

Under the current unreleased section, add a Chinese bullet stating that playback detail now offers an independent static dark ambient cover background, preserves existing blur settings, and uses a white foreground hierarchy.

- [ ] **Step 2: Run all play-detail tests**

```powershell
node --test tests/play-detail
```

Expected: `0` failed.

- [ ] **Step 3: Run TypeScript and focused ESLint**

```powershell
npx tsc --noEmit
npx eslint src/components/PageContent.tsx src/screens/PlayDetail/backgroundConfig.ts src/screens/PlayDetail/AmbientDarkBackgroundLayer.tsx src/screens/PlayDetail/useAmbientDarkPalette.ts src/screens/PlayDetail/palette.ts src/screens/PlayDetail/index.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx src/utils/nativeModules/utils.ts tests/play-detail/ambient-dark-background.test.js tests/play-detail/background-settings.test.js tests/play-detail/background-preset.test.js tests/play-detail/foreground-colors.test.js
```

Expected: both commands exit `0` with no ESLint errors.

- [ ] **Step 4: Run Android Java compile and debug bundle**

```powershell
Set-Location android
.\gradlew.bat compileDebugJavaWithJavac
Set-Location ..
npm run build-test
```

Expected: Gradle prints `BUILD SUCCESSFUL`; React Native bundle exits `0`.

- [ ] **Step 5: Inspect the final diff and setting preservation**

```powershell
git diff --check
git diff -- src/config/defaultSetting.ts src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx
```

Confirm from the diff that only the new variant default was added, the eleven old defaults retain their exact values, and the selector handler writes only the variant key.

- [ ] **Step 6: Commit changelog and any verification-only corrections**

```powershell
git add CHANGELOG.md
git commit -m "docs: record ambient play detail background"
```
