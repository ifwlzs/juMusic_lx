# Play Detail Background Extended Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保持当前默认播放页背景观感不变，但扩大真实可调范围，新增独立 `vignetteStrength`，并让预览工具和 App 继续使用同一套范围与压暗语义。

**Architecture:** 继续复用现有共享运行时 `backgroundConfig.ts` + `PlayDetailBackgroundLayer`，只扩展 setting model、扩大 runtime clamp、去掉对比度驱动的 vignette opacity，并把 `vignetteStrength` 直接映射成四周压暗 alpha。设置页、预览工具、默认值三处都同步到同一份范围约束，避免再次出现“滑杆能拉但运行时早已封顶”。

**Tech Stack:** React Native, TypeScript, node:test file-contract tests, existing play-detail preview tool under `tools/play-detail-bg-preview`.

---

## File Structure

- `tests/play-detail/background-settings.test.js`：锁定 schema/default、shared config、设置页范围、`vignetteStrength`。
- `tests/play-detail/background-preset.test.js`：锁定 runtime clamp 和 blur/vignette 映射契约。
- `tests/play-detail/background-preview-tool.test.js`：锁定预览工具默认值、控件范围、线性压暗语义。
- `src/types/app_setting.d.ts`
- `src/config/defaultSetting.ts`
- `src/screens/PlayDetail/backgroundConfig.ts`
- `src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx`
- `src/lang/zh-cn.json`
- `src/lang/zh-tw.json`
- `src/lang/en-us.json`
- `tools/play-detail-bg-preview/preview.js`
- `tools/play-detail-bg-preview/styles.css`
- `tools/play-detail-bg-preview/README.md`

### Task 1: Add `vignetteStrength` to schema, defaults, and shared config

**Files:**
- Modify: `tests/play-detail/background-settings.test.js`
- Modify: `tests/play-detail/background-preview-tool.test.js`
- Modify: `src/types/app_setting.d.ts`
- Modify: `src/config/defaultSetting.ts`
- Modify: `src/screens/PlayDetail/backgroundConfig.ts`
- Modify: `tools/play-detail-bg-preview/preview.js`
- Test: `tests/play-detail/background-settings.test.js`
- Test: `tests/play-detail/background-preview-tool.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/play-detail/background-settings.test.js
test('play detail background settings define vignetteStrength in schema defaults and shared config defaults', () => {
  const appSettingFile = readFile('src/types/app_setting.d.ts')
  const defaultSettingFile = readFile('src/config/defaultSetting.ts')
  const configFile = readFile('src/screens/PlayDetail/backgroundConfig.ts')

  assert.match(appSettingFile, /'theme\.playDetail\.background\.vignetteStrength': number/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.vignetteStrength': 0\.25/)
  assert.match(configFile, /vignetteStrength: number/)
  assert.match(configFile, /vignetteStrength: 0\.25/)
  assert.match(configFile, /vignetteStrength: setting\['theme\.playDetail\.background\.vignetteStrength'\]/)
})
```

```js
// tests/play-detail/background-preview-tool.test.js
test('play-detail preview defaults include vignetteStrength and expose a dedicated control', () => {
  const css = read('tools/play-detail-bg-preview/styles.css')
  const js = read('tools/play-detail-bg-preview/preview.js')

  assert.match(js, /vignetteStrength: 0\.25/)
  assert.match(js, /key: 'vignetteStrength'/)
  assert.match(js, /buildRgba\(state\.values\.vignetteColor, state\.values\.vignetteStrength\)/)
  assert.match(css, /--preview-vignette-color: rgba\(137, 134, 133, 0\.25\);/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/play-detail/background-settings.test.js tests/play-detail/background-preview-tool.test.js`
Expected: FAIL because `vignetteStrength` 还不存在。

- [ ] **Step 3: Write minimal implementation**

```ts
// src/types/app_setting.d.ts
'theme.playDetail.background.vignetteStrength': number
```

```ts
// src/config/defaultSetting.ts
'theme.playDetail.background.vignetteStrength': 0.25,
```

```ts
// src/screens/PlayDetail/backgroundConfig.ts
export interface PlayDetailBackgroundSettingValues {
  stretchScale: number
  blurRadius: number
  imageBrightness: number
  imageContrast: number
  maskMode: 'auto' | 'manual'
  maskColor: string
  colorMaskOpacity: number
  maskSaturation: number
  maskLightness: number
  vignetteColor: string
  vignetteSize: number
  vignetteStrength: number
}

export const playDetailBackgroundDefaults = {
  stretchScale: 1,
  blurRadius: 200,
  imageBrightness: 1,
  imageContrast: 1.5,
  maskMode: 'auto',
  maskColor: '#914c4c',
  colorMaskOpacity: 0.37,
  maskSaturation: 0.312,
  maskLightness: 0.433,
  vignetteColor: '#898685',
  vignetteSize: 250,
  vignetteStrength: 0.25,
}

export const readPlayDetailBackgroundSetting = (setting: LX.AppSetting): PlayDetailBackgroundSettingValues => ({
  // existing fields...
  vignetteColor: setting['theme.playDetail.background.vignetteColor'],
  vignetteSize: setting['theme.playDetail.background.vignetteSize'],
  vignetteStrength: setting['theme.playDetail.background.vignetteStrength'],
})
```

```js
// tools/play-detail-bg-preview/preview.js
const defaultValues = {
  stretchScale: 1,
  blurRadius: 200,
  imageBrightness: 1,
  imageContrast: 1.5,
  maskColor: '#914c4c',
  colorMaskOpacity: 0.37,
  maskSaturation: 0.312,
  maskLightness: 0.433,
  vignetteColor: '#898685',
  vignetteSize: 250,
  vignetteStrength: 0.25,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/play-detail/background-settings.test.js tests/play-detail/background-preview-tool.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/play-detail/background-settings.test.js tests/play-detail/background-preview-tool.test.js src/types/app_setting.d.ts src/config/defaultSetting.ts src/screens/PlayDetail/backgroundConfig.ts tools/play-detail-bg-preview/preview.js
git commit -m "feat: add play detail vignette strength setting"
```

### Task 2: Expand runtime clamp range and decouple vignette alpha from contrast

**Files:**
- Modify: `tests/play-detail/background-settings.test.js`
- Modify: `tests/play-detail/background-preset.test.js`
- Modify: `src/screens/PlayDetail/backgroundConfig.ts`
- Test: `tests/play-detail/background-settings.test.js`
- Test: `tests/play-detail/background-preset.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/play-detail/background-settings.test.js
test('play detail background resolver widens runtime clamps and resolves vignette alpha from vignetteStrength directly', () => {
  const configFile = readFile('src/screens/PlayDetail/backgroundConfig.ts')

  assert.match(configFile, /normalizeBlurIntensity = \(blurRadius: number\) => clamp\(\(blurRadius - 60\) \/ 500, 0, 1\)/)
  assert.match(configFile, /normalizeContrastIntensity = \(imageContrast: number\) => clamp\(\(imageContrast - 0\.7\) \/ 2\.5, 0, 1\)/)
  assert.match(configFile, /const baseScale = clamp\(stretchScale, 1, 1\.6\)/)
  assert.match(configFile, /vignetteOverlayColor: buildRgba\(setting\.vignetteColor, setting\.vignetteStrength\)/)
  assert.doesNotMatch(configFile, /const baseScale = clamp\(stretchScale, 1, 1\.2\)/)
  assert.doesNotMatch(configFile, /resolveVignetteOverlayOpacity = \(\{\s*imageContrast/)
})
```

```js
// tests/play-detail/background-preset.test.js
test('background runtime keeps the shared layer model but raises the real blur and scale ceiling', () => {
  const backgroundConfigFile = readFile('src/screens/PlayDetail/backgroundConfig.ts')

  assert.match(backgroundConfigFile, /blurRadius: Math\.round\(clamp\(14 \+ blurIntensity \* 26 \+ contrastIntensity \* 4, 14, 44\)\)/)
  assert.match(backgroundConfigFile, /blurRadius: Math\.round\(clamp\(22 \+ blurIntensity \* 40 \+ contrastIntensity \* 8, 22, 70\)\)/)
  assert.match(backgroundConfigFile, /blurRadius: Math\.round\(clamp\(30 \+ blurIntensity \* 56 \+ contrastIntensity \* 10, 30, 96\)\)/)
  assert.match(backgroundConfigFile, /scale: roundTo\(clamp\(baseScale \+ 0\.16, 1\.14, 1\.84\), 3\)/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/play-detail/background-settings.test.js tests/play-detail/background-preset.test.js`
Expected: FAIL because runtime 还在旧范围内封顶，而且 vignette alpha 仍然跟 `imageContrast` 绑在一起。

- [ ] **Step 3: Write minimal implementation**

```ts
// src/screens/PlayDetail/backgroundConfig.ts
const normalizeBlurIntensity = (blurRadius: number) => clamp((blurRadius - 60) / 500, 0, 1)
const normalizeContrastIntensity = (imageContrast: number) => clamp((imageContrast - 0.7) / 2.5, 0, 1)

export const resolveNativeBlurLayers = ({ blurRadius, stretchScale, imageContrast }: { blurRadius: number, stretchScale: number, imageContrast: number }): PlayDetailBackgroundBlurLayer[] => {
  const blurIntensity = normalizeBlurIntensity(blurRadius)
  const contrastIntensity = normalizeContrastIntensity(imageContrast)
  const baseScale = clamp(stretchScale, 1, 1.6)

  return [
    {
      blurRadius: Math.round(clamp(14 + blurIntensity * 26 + contrastIntensity * 4, 14, 44)),
      opacity: roundTo(clamp(0.94 - contrastIntensity * 0.08, 0.72, 0.94), 3),
      scale: roundTo(baseScale, 3),
    },
    {
      blurRadius: Math.round(clamp(22 + blurIntensity * 40 + contrastIntensity * 8, 22, 70)),
      opacity: roundTo(clamp(0.36 + blurIntensity * 0.18, 0.32, 0.6), 3),
      scale: roundTo(clamp(baseScale + 0.08, 1.08, 1.72), 3),
    },
    {
      blurRadius: Math.round(clamp(30 + blurIntensity * 56 + contrastIntensity * 10, 30, 96)),
      opacity: roundTo(clamp(0.18 + blurIntensity * 0.18, 0.18, 0.4), 3),
      scale: roundTo(clamp(baseScale + 0.16, 1.14, 1.84), 3),
    },
  ]
}

export const resolvePlayDetailBackgroundConfig = ({ setting, recommendedMaskColor }: { setting: PlayDetailBackgroundSettingValues, recommendedMaskColor?: string | null }): ResolvedPlayDetailBackgroundConfig => {
  const resolvedMaskColor = setting.maskMode == 'manual' ? setting.maskColor : recommendedMaskColor ?? setting.maskColor
  const imageBrightnessDelta = setting.imageBrightness - 1
  const brightnessOverlayOpacity = clamp(Math.abs(imageBrightnessDelta) * 0.42, 0, 0.35)
  const brightnessOverlayColor = imageBrightnessDelta >= 0 ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 1)'

  return {
    ...setting,
    resolvedMaskColor,
    colorMask: buildRgba(resolvedMaskColor, setting.colorMaskOpacity),
    brightnessOverlayColor,
    imageBrightnessOverlayOpacity: brightnessOverlayOpacity,
    blurLayers: resolveNativeBlurLayers(setting),
    vignetteOverlayColor: buildRgba(setting.vignetteColor, setting.vignetteStrength),
    vignetteTransparentColor: buildRgba(setting.vignetteColor, 0),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/play-detail/background-settings.test.js tests/play-detail/background-preset.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/play-detail/background-settings.test.js tests/play-detail/background-preset.test.js src/screens/PlayDetail/backgroundConfig.ts
git commit -m "feat: expand play detail background runtime range"
```

### Task 3: Expose the wider slider range and keep preview tool semantics aligned

**Files:**
- Modify: `tests/play-detail/background-settings.test.js`
- Modify: `tests/play-detail/background-preview-tool.test.js`
- Modify: `src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx`
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`
- Modify: `tools/play-detail-bg-preview/preview.js`
- Modify: `tools/play-detail-bg-preview/styles.css`
- Modify: `tools/play-detail-bg-preview/README.md`
- Test: `tests/play-detail/background-settings.test.js`
- Test: `tests/play-detail/background-preview-tool.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/play-detail/background-settings.test.js
test('play detail background dialog exposes the wider ranges and the new vignetteStrength slider', () => {
  const dialogFile = readFile('src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx')
  const zhCn = readFile('src/lang/zh-cn.json')

  assert.match(dialogFile, /theme\.playDetail\.background\.vignetteStrength/)
  assert.match(dialogFile, /maximumValue=\{1\.6\}/)
  assert.match(dialogFile, /minimumValue=\{60\}/)
  assert.match(dialogFile, /maximumValue=\{560\}/)
  assert.match(dialogFile, /minimumValue=\{0\.35\}/)
  assert.match(dialogFile, /maximumValue=\{1\.85\}/)
  assert.match(dialogFile, /minimumValue=\{0\.7\}/)
  assert.match(dialogFile, /maximumValue=\{3\.2\}/)
  assert.match(dialogFile, /minimumValue=\{0\.05\}/)
  assert.match(dialogFile, /maximumValue=\{0\.95\}/)
  assert.match(dialogFile, /minimumValue=\{0\.03\}/)
  assert.match(dialogFile, /maximumValue=\{0\.72\}/)
  assert.match(dialogFile, /minimumValue=\{0\.12\}/)
  assert.match(dialogFile, /maximumValue=\{0\.82\}/)
  assert.match(dialogFile, /maximumValue=\{680\}/)
  assert.match(dialogFile, /minimumValue=\{0\.08\}/)
  assert.match(dialogFile, /maximumValue=\{0\.78\}/)
  assert.match(zhCn, /"setting_theme_play_detail_background_vignette_strength": "四周压暗强度"/)
})
```

```js
// tests/play-detail/background-preview-tool.test.js
test('play-detail preview tool uses linear edge darkening and the same vignetteStrength semantics as the app', () => {
  const css = read('tools/play-detail-bg-preview/styles.css')
  const js = read('tools/play-detail-bg-preview/preview.js')
  const readme = read('tools/play-detail-bg-preview/README.md')

  assert.match(js, /key: 'vignetteStrength'/)
  assert.match(js, /min: 0\.08/)
  assert.match(js, /max: 0\.78/)
  assert.match(js, /rootStyle\.setProperty\('--preview-vignette-color', buildRgba\(state\.values\.vignetteColor, state\.values\.vignetteStrength\)\)/)
  assert.match(css, /linear-gradient/)
  assert.doesNotMatch(css, /box-shadow: inset 0 0 var\(--preview-vignette-size\) var\(--preview-vignette-color\);/)
  assert.match(readme, /vignetteStrength/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/play-detail/background-settings.test.js tests/play-detail/background-preview-tool.test.js`
Expected: FAIL because 设置页还是旧范围，预览工具也还是旧的压暗实现。

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx
const backgroundSettingKeyMap: Record<BackgroundSettingKey, keyof LX.AppSetting> = {
  stretchScale: 'theme.playDetail.background.stretchScale',
  blurRadius: 'theme.playDetail.background.blurRadius',
  imageBrightness: 'theme.playDetail.background.imageBrightness',
  imageContrast: 'theme.playDetail.background.imageContrast',
  maskMode: 'theme.playDetail.background.maskMode',
  maskColor: 'theme.playDetail.background.maskColor',
  colorMaskOpacity: 'theme.playDetail.background.colorMaskOpacity',
  maskSaturation: 'theme.playDetail.background.maskSaturation',
  maskLightness: 'theme.playDetail.background.maskLightness',
  vignetteColor: 'theme.playDetail.background.vignetteColor',
  vignetteSize: 'theme.playDetail.background.vignetteSize',
  vignetteStrength: 'theme.playDetail.background.vignetteStrength',
}

<SliderField label={t('setting_theme_play_detail_background_stretch_scale')} value={draft.stretchScale} minimumValue={1} maximumValue={1.6} step={0.01} formatValue={formatDecimal} onValueChange={value => { applyDraftPatch({ stretchScale: value }) }} onSlidingComplete={value => { applyDraftPatch({ stretchScale: value }, true) }} />
<SliderField label={t('setting_theme_play_detail_background_blur_radius')} value={draft.blurRadius} minimumValue={60} maximumValue={560} step={2} onValueChange={value => { applyDraftPatch({ blurRadius: value }) }} onSlidingComplete={value => { applyDraftPatch({ blurRadius: value }, true) }} />
<SliderField label={t('setting_theme_play_detail_background_image_brightness')} value={draft.imageBrightness} minimumValue={0.35} maximumValue={1.85} step={0.02} formatValue={formatDecimal} onValueChange={value => { applyDraftPatch({ imageBrightness: value }) }} onSlidingComplete={value => { applyDraftPatch({ imageBrightness: value }, true) }} />
<SliderField label={t('setting_theme_play_detail_background_image_contrast')} value={draft.imageContrast} minimumValue={0.7} maximumValue={3.2} step={0.02} formatValue={formatDecimal} onValueChange={value => { applyDraftPatch({ imageContrast: value }) }} onSlidingComplete={value => { applyDraftPatch({ imageContrast: value }, true) }} />
<SliderField label={t('setting_theme_play_detail_background_color_mask_opacity')} value={draft.colorMaskOpacity} minimumValue={0.05} maximumValue={0.95} step={0.01} formatValue={formatPercent} onValueChange={value => { applyDraftPatch({ colorMaskOpacity: value }) }} onSlidingComplete={value => { applyDraftPatch({ colorMaskOpacity: value }, true) }} />
<SliderField label={t('setting_theme_play_detail_background_mask_saturation')} value={draft.maskSaturation} minimumValue={0.03} maximumValue={0.72} step={0.01} formatValue={formatDecimal} onValueChange={value => { applyDraftPatch({ maskSaturation: value }) }} onSlidingComplete={value => { applyDraftPatch({ maskSaturation: value }, true) }} />
<SliderField label={t('setting_theme_play_detail_background_mask_lightness')} value={draft.maskLightness} minimumValue={0.12} maximumValue={0.82} step={0.01} formatValue={formatDecimal} onValueChange={value => { applyDraftPatch({ maskLightness: value }) }} onSlidingComplete={value => { applyDraftPatch({ maskLightness: value }, true) }} />
<SliderField label={t('setting_theme_play_detail_background_vignette_size')} value={draft.vignetteSize} minimumValue={60} maximumValue={680} step={2} onValueChange={value => { applyDraftPatch({ vignetteSize: value }) }} onSlidingComplete={value => { applyDraftPatch({ vignetteSize: value }, true) }} />
<SliderField label={t('setting_theme_play_detail_background_vignette_strength')} value={draft.vignetteStrength} minimumValue={0.08} maximumValue={0.78} step={0.01} formatValue={formatPercent} onValueChange={value => { applyDraftPatch({ vignetteStrength: value }) }} onSlidingComplete={value => { applyDraftPatch({ vignetteStrength: value }, true) }} />
```

```json
// src/lang/zh-cn.json
"setting_theme_play_detail_background_vignette_strength": "四周压暗强度"
```

```json
// src/lang/zh-tw.json
"setting_theme_play_detail_background_vignette_strength": "四周壓暗強度"
```

```json
// src/lang/en-us.json
"setting_theme_play_detail_background_vignette_strength": "Vignette strength"
```

```js
// tools/play-detail-bg-preview/preview.js
const controls = [
  { key: 'stretchScale', label: 'stretchScale', type: 'range', min: 1, max: 1.6, step: 0.01, format: value => value.toFixed(2) },
  { key: 'blurRadius', label: 'blurRadius', type: 'range', min: 60, max: 560, step: 2, format: value => `${value}px` },
  { key: 'imageBrightness', label: 'imageBrightness', type: 'range', min: 0.35, max: 1.85, step: 0.01, format: value => value.toFixed(2) },
  { key: 'imageContrast', label: 'imageContrast', type: 'range', min: 0.7, max: 3.2, step: 0.01, format: value => value.toFixed(2) },
  { key: 'colorMaskOpacity', label: 'colorMaskOpacity', type: 'range', min: 0.05, max: 0.95, step: 0.01, format: value => value.toFixed(2) },
  { key: 'maskSaturation', label: 'maskSaturation', type: 'range', min: 0.03, max: 0.72, step: 0.001, format: value => value.toFixed(3) },
  { key: 'maskLightness', label: 'maskLightness', type: 'range', min: 0.12, max: 0.82, step: 0.001, format: value => value.toFixed(3) },
  { key: 'vignetteSize', label: 'vignetteSize', type: 'range', min: 60, max: 680, step: 2, format: value => `${value}px` },
  { key: 'vignetteStrength', label: 'vignetteStrength', type: 'range', min: 0.08, max: 0.78, step: 0.01, format: value => value.toFixed(2) },
]

const applyValues = () => {
  rootStyle.setProperty('--preview-bg-url', `url("${state.sourceImageSrc}")`)
  rootStyle.setProperty('--preview-stretch-scale', state.values.stretchScale.toFixed(2))
  rootStyle.setProperty('--preview-blur-radius', `${state.values.blurRadius}px`)
  rootStyle.setProperty('--preview-image-brightness', state.values.imageBrightness.toFixed(2).replace(/\.00$/, ''))
  rootStyle.setProperty('--preview-image-contrast', state.values.imageContrast.toFixed(2).replace(/0$/, '').replace(/\.0$/, ''))
  rootStyle.setProperty('--preview-color-mask', buildRgba(state.values.maskColor, state.values.colorMaskOpacity))
  rootStyle.setProperty('--preview-vignette-color', buildRgba(state.values.vignetteColor, state.values.vignetteStrength))
  rootStyle.setProperty('--preview-vignette-size', `${state.values.vignetteSize}px`)
}
```

```css
/* tools/play-detail-bg-preview/styles.css */
:root {
  --preview-vignette-color: rgba(137, 134, 133, 0.25);
  --preview-vignette-size: 250px;
}

.vignette {
  background:
    linear-gradient(180deg, var(--preview-vignette-color) 0%, rgba(0, 0, 0, 0) var(--preview-vignette-size)),
    linear-gradient(0deg, var(--preview-vignette-color) 0%, rgba(0, 0, 0, 0) var(--preview-vignette-size)),
    linear-gradient(90deg, var(--preview-vignette-color) 0%, rgba(0, 0, 0, 0) var(--preview-vignette-size)),
    linear-gradient(270deg, var(--preview-vignette-color) 0%, rgba(0, 0, 0, 0) var(--preview-vignette-size));
}
```

```md
<!-- tools/play-detail-bg-preview/README.md -->
- `vignetteStrength`：控制四周压暗强度，和 App 里的 `theme.playDetail.background.vignetteStrength` 保持一致。
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/play-detail/background-settings.test.js tests/play-detail/background-preview-tool.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/play-detail/background-settings.test.js tests/play-detail/background-preview-tool.test.js src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json tools/play-detail-bg-preview/preview.js tools/play-detail-bg-preview/styles.css tools/play-detail-bg-preview/README.md
git commit -m "feat: expose wider play detail background controls"
```

### Task 4: Final verification and changelog

**Files:**
- Modify: `CHANGELOG.md`
- Test: `tests/play-detail/background-settings.test.js`
- Test: `tests/play-detail/background-preset.test.js`
- Test: `tests/play-detail/background-preview-tool.test.js`

- [ ] **Step 1: Write the failing test**

```md
## [Unreleased] - 2026-04-09

### 优化

- 播放页背景设置新增独立“四周压暗强度”，并扩大模糊、拉伸、亮度、对比度与蒙版的真实可调范围
- 播放页背景预览工具同步到新的线性压暗语义，避免预览和 App 实际效果继续脱节
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/play-detail/background-settings.test.js tests/play-detail/background-preset.test.js tests/play-detail/background-preview-tool.test.js`
Expected: 至少一项 FAIL，直到前三个任务全部完成。

- [ ] **Step 3: Write minimal implementation**

```md
# CHANGELOG.md
## [Unreleased] - 2026-04-09

### 优化

- 播放页背景设置新增独立“四周压暗强度”，并扩大模糊、拉伸、亮度、对比度与蒙版的真实可调范围
- 播放页背景预览工具同步到新的线性压暗语义，避免预览和 App 实际效果继续脱节
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/play-detail/background-settings.test.js tests/play-detail/background-preset.test.js tests/play-detail/background-preview-tool.test.js`
Expected: PASS.

Run: `npx eslint src/screens/PlayDetail/backgroundConfig.ts src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx tests/play-detail/background-settings.test.js tests/play-detail/background-preset.test.js tests/play-detail/background-preview-tool.test.js tools/play-detail-bg-preview/preview.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: note stronger play detail background controls"
```
