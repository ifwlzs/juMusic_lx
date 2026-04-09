# Play Detail Background Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated "播放页背景效果" settings entry with real-time preview, shared play-detail background rendering, and user-configurable background parameters that affect only the play detail background layer.

**Architecture:** Keep the current `playDetailEmby` variant name as the runtime entry point, but move its fixed values into a shared play-detail background config/resolver module. Reuse a single background rendering layer for both `PageContent` and the new settings dialog preview, and bridge dominant-hue extraction through the existing native `UtilsModule` so the approved gray-biased auto mask logic can run against the current cover image.

**Tech Stack:** React Native, TypeScript, existing setting store, Node file-contract tests, Android native module (`UtilsModule.java`)

---

### Task 1: Add schema defaults and lock the new background setting keys in tests

**Files:**
- Create: `tests/play-detail/background-settings.test.js`
- Modify: `src/types/app_setting.d.ts`
- Modify: `src/config/defaultSetting.ts`
- Test: `tests/play-detail/background-settings.test.js`

- [ ] **Step 1: Write the failing schema/defaults test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('play detail background settings define dedicated schema keys and approved defaults', () => {
  const appSettingFile = readFile('src/types/app_setting.d.ts')
  const defaultSettingFile = readFile('src/config/defaultSetting.ts')

  assert.match(appSettingFile, /'theme\.playDetail\.background\.stretchScale': number/)
  assert.match(appSettingFile, /'theme\.playDetail\.background\.blurRadius': number/)
  assert.match(appSettingFile, /'theme\.playDetail\.background\.imageBrightness': number/)
  assert.match(appSettingFile, /'theme\.playDetail\.background\.imageContrast': number/)
  assert.match(appSettingFile, /'theme\.playDetail\.background\.maskMode': 'auto' \| 'manual'/)
  assert.match(appSettingFile, /'theme\.playDetail\.background\.maskColor': string/)
  assert.match(appSettingFile, /'theme\.playDetail\.background\.colorMaskOpacity': number/)
  assert.match(appSettingFile, /'theme\.playDetail\.background\.maskSaturation': number/)
  assert.match(appSettingFile, /'theme\.playDetail\.background\.maskLightness': number/)
  assert.match(appSettingFile, /'theme\.playDetail\.background\.vignetteColor': string/)
  assert.match(appSettingFile, /'theme\.playDetail\.background\.vignetteSize': number/)

  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.stretchScale': 1/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.blurRadius': 200/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.imageBrightness': 1/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.imageContrast': 1\.5/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.maskMode': 'auto'/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.maskColor': '#914c4c'/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.colorMaskOpacity': 0\.37/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.maskSaturation': 0\.312/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.maskLightness': 0\.433/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.vignetteColor': '#898685'/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.background\.vignetteSize': 250/)
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/play-detail/background-settings.test.js`
Expected: FAIL because the schema keys and defaults do not exist yet.

- [ ] **Step 3: Add the new setting keys and defaults**

```ts
// src/types/app_setting.d.ts
'theme.playDetail.background.stretchScale': number
'theme.playDetail.background.blurRadius': number
'theme.playDetail.background.imageBrightness': number
'theme.playDetail.background.imageContrast': number
'theme.playDetail.background.maskMode': 'auto' | 'manual'
'theme.playDetail.background.maskColor': string
'theme.playDetail.background.colorMaskOpacity': number
'theme.playDetail.background.maskSaturation': number
'theme.playDetail.background.maskLightness': number
'theme.playDetail.background.vignetteColor': string
'theme.playDetail.background.vignetteSize': number

// src/config/defaultSetting.ts
'theme.playDetail.background.stretchScale': 1,
'theme.playDetail.background.blurRadius': 200,
'theme.playDetail.background.imageBrightness': 1,
'theme.playDetail.background.imageContrast': 1.5,
'theme.playDetail.background.maskMode': 'auto',
'theme.playDetail.background.maskColor': '#914c4c',
'theme.playDetail.background.colorMaskOpacity': 0.37,
'theme.playDetail.background.maskSaturation': 0.312,
'theme.playDetail.background.maskLightness': 0.433,
'theme.playDetail.background.vignetteColor': '#898685',
'theme.playDetail.background.vignetteSize': 250,
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `node --test tests/play-detail/background-settings.test.js`
Expected: PASS

- [ ] **Step 5: Commit the schema/defaults slice**

```bash
git add tests/play-detail/background-settings.test.js src/types/app_setting.d.ts src/config/defaultSetting.ts
git commit -m "feat: add play detail background setting schema"
```

### Task 2: Add shared background config resolution and dominant-hue extraction support

**Files:**
- Create: `src/screens/PlayDetail/backgroundConfig.ts`
- Create: `src/screens/PlayDetail/BackgroundLayer.tsx`
- Modify: `src/utils/nativeModules/utils.ts`
- Modify: `android/app/src/main/java/io/ifwlzs/jumusic/lx/utils/UtilsModule.java`
- Modify: `tests/play-detail/background-settings.test.js`
- Test: `tests/play-detail/background-settings.test.js`

- [ ] **Step 1: Extend the test to lock the shared resolver and native bridge contract**

```js
test('play detail background exports shared defaults, auto-mask helpers, and a native hue bridge', () => {
  const configFile = readFile('src/screens/PlayDetail/backgroundConfig.ts')
  const layerFile = readFile('src/screens/PlayDetail/BackgroundLayer.tsx')
  const nativeUtilsFile = readFile('src/utils/nativeModules/utils.ts')
  const androidUtilsFile = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/utils/UtilsModule.java')

  assert.match(configFile, /export const playDetailBackgroundDefaults = \{/) 
  assert.match(configFile, /export const snapHue = \(hue: number, step = 15\)/)
  assert.match(configFile, /export const createGrayBiasedMaskColor = \(/)
  assert.match(configFile, /export const readPlayDetailBackgroundSetting = \(/)
  assert.match(configFile, /export const resolvePlayDetailBackgroundConfig = \(/)
  assert.match(configFile, /maskMode == 'manual' \? setting\.maskColor : recommendedMaskColor \?\? setting\.maskColor/)

  assert.match(layerFile, /export default function PlayDetailBackgroundLayer/)
  assert.match(layerFile, /blurRadius=\{resolvedConfig\.blurRadius\}/)
  assert.match(layerFile, /resolvedConfig\.imageBrightness/)
  assert.match(layerFile, /resolvedConfig\.imageContrast/)
  assert.match(layerFile, /resolvedConfig\.vignetteColor/)
  assert.match(layerFile, /resolvedConfig\.vignetteSize/)
  assert.match(layerFile, /backgroundColor: resolvedConfig\.colorMask/)

  assert.match(nativeUtilsFile, /export const extractDominantHueFromImage = \(imageUri: string\)/)
  assert.match(androidUtilsFile, /@ReactMethod\s+public void extractDominantHueFromImage\(String imageUri, Promise promise\)/)
  assert.match(androidUtilsFile, /BitmapFactory/)
  assert.match(androidUtilsFile, /Math\.atan2/)
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/play-detail/background-settings.test.js`
Expected: FAIL because the resolver, renderer, and native bridge do not exist yet.

- [ ] **Step 3: Implement the shared config module and background layer**

```ts
// src/screens/PlayDetail/backgroundConfig.ts
export const playDetailBackgroundDefaults = {
  stretchScale: 1,
  blurRadius: 200,
  imageBrightness: 1,
  imageContrast: 1.5,
  maskMode: 'auto' as const,
  maskColor: '#914c4c',
  colorMaskOpacity: 0.37,
  maskSaturation: 0.312,
  maskLightness: 0.433,
  vignetteColor: '#898685',
  vignetteSize: 250,
}

export const snapHue = (hue: number, step = 15) => Math.round(hue / step) * step
export const createGrayBiasedMaskColor = (hue: number, saturation: number, lightness: number) => {
  const snappedHue = snapHue(hue, 15)
  return rgbToHex(hslToRgb(snappedHue, saturation, lightness))
}

export const readPlayDetailBackgroundSetting = (setting: LX.AppSetting) => ({
  stretchScale: setting['theme.playDetail.background.stretchScale'],
  blurRadius: setting['theme.playDetail.background.blurRadius'],
  imageBrightness: setting['theme.playDetail.background.imageBrightness'],
  imageContrast: setting['theme.playDetail.background.imageContrast'],
  maskMode: setting['theme.playDetail.background.maskMode'],
  maskColor: setting['theme.playDetail.background.maskColor'],
  colorMaskOpacity: setting['theme.playDetail.background.colorMaskOpacity'],
  maskSaturation: setting['theme.playDetail.background.maskSaturation'],
  maskLightness: setting['theme.playDetail.background.maskLightness'],
  vignetteColor: setting['theme.playDetail.background.vignetteColor'],
  vignetteSize: setting['theme.playDetail.background.vignetteSize'],
})

export const resolvePlayDetailBackgroundConfig = ({
  setting,
  recommendedMaskColor,
}: {
  setting: PlayDetailBackgroundSettingValues
  recommendedMaskColor?: string | null
}) => ({
  ...setting,
  resolvedMaskColor: setting.maskMode == 'manual' ? setting.maskColor : recommendedMaskColor ?? setting.maskColor,
  colorMask: buildRgba(setting.maskMode == 'manual' ? setting.maskColor : recommendedMaskColor ?? setting.maskColor, setting.colorMaskOpacity),
})

// src/screens/PlayDetail/BackgroundLayer.tsx
export default function PlayDetailBackgroundLayer({ source, resolvedConfig, children }: Props) {
  return (
    <ImageBackground
      source={source}
      resizeMode="stretch"
      blurRadius={resolvedConfig.blurRadius}
      imageStyle={{
        transform: [{ scaleX: resolvedConfig.stretchScale }, { scaleY: resolvedConfig.stretchScale }],
      }}
    >
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: resolvedConfig.brightnessOverlayColor, opacity: resolvedConfig.imageBrightnessOverlayOpacity }} />
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: resolvedConfig.colorMask }} />
      {renderVignetteBands(resolvedConfig.vignetteColor, resolvedConfig.vignetteSize, resolvedConfig.imageContrast)}
      {children}
    </ImageBackground>
  )
}
```

- [ ] **Step 4: Add the native hue extraction bridge**

```ts
// src/utils/nativeModules/utils.ts
export const extractDominantHueFromImage = (imageUri: string): Promise<number | null> => {
  return UtilsModule.extractDominantHueFromImage(imageUri)
}
```

```java
// android/app/src/main/java/io/ifwlzs/jumusic/lx/utils/UtilsModule.java
@ReactMethod
public void extractDominantHueFromImage(String imageUri, Promise promise) {
  new Thread(() -> {
    try {
      Bitmap bitmap = decodeBitmap(imageUri);
      if (bitmap == null) {
        promise.resolve(null);
        return;
      }
      double[] vector = calculateHueVector(bitmap);
      if (vector[2] <= 0) {
        promise.resolve(null);
        return;
      }
      double hue = (Math.toDegrees(Math.atan2(vector[1], vector[0])) + 360d) % 360d;
      promise.resolve(hue);
    } catch (Exception error) {
      promise.resolve(null);
    }
  }).start();
}
```

- [ ] **Step 5: Run the focused test again**

Run: `node --test tests/play-detail/background-settings.test.js`
Expected: PASS

- [ ] **Step 6: Lint the new shared files**

Run: `npx eslint src/screens/PlayDetail/backgroundConfig.ts src/screens/PlayDetail/BackgroundLayer.tsx src/utils/nativeModules/utils.ts`
Expected: PASS

- [ ] **Step 7: Commit the shared runtime slice**

```bash
git add tests/play-detail/background-settings.test.js src/screens/PlayDetail/backgroundConfig.ts src/screens/PlayDetail/BackgroundLayer.tsx src/utils/nativeModules/utils.ts android/app/src/main/java/io/ifwlzs/jumusic/lx/utils/UtilsModule.java
git commit -m "feat: add shared play detail background runtime"
```

### Task 3: Add the theme settings entry, dialog, preview, and copy

**Files:**
- Create: `src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx`
- Create: `src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Theme/index.tsx`
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`
- Modify: `tests/play-detail/theme-customization.test.js`
- Modify: `tests/play-detail/background-settings.test.js`
- Test: `tests/play-detail/theme-customization.test.js`
- Test: `tests/play-detail/background-settings.test.js`

- [ ] **Step 1: Write the failing UI contract tests**

```js
// tests/play-detail/theme-customization.test.js
assert.match(themeSettingsIndexFile, /import PlayDetailBackgroundSettings from '\.\/PlayDetailBackgroundSettings'/)
assert.match(themeSettingsIndexFile, /<PlayDetailBackgroundSettings \/>/)

// tests/play-detail/background-settings.test.js
const settingsFile = readFile('src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx')
const dialogFile = readFile('src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx')
const zhCn = readFile('src/lang/zh-cn.json')

assert.match(settingsFile, /setting_theme_play_detail_background/)
assert.match(settingsFile, /setting_theme_play_detail_background_open/)
assert.match(settingsFile, /theme\.dynamicBg/)
assert.match(dialogFile, /usePlayerMusicInfo\(\)/)
assert.match(dialogFile, /PlayDetailBackgroundLayer/)
assert.match(dialogFile, /theme\.playDetail\.background\.blurRadius/)
assert.match(dialogFile, /theme\.playDetail\.background\.maskMode/)
assert.match(dialogFile, /theme\.playDetail\.background\.vignetteSize/)
assert.match(dialogFile, /套用当前推荐色|setting_theme_play_detail_background_apply_auto_mask/)
assert.doesNotMatch(dialogFile, /setting_theme_play_detail_primary/)
assert.match(zhCn, /"setting_theme_play_detail_background"/)
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --test tests/play-detail/theme-customization.test.js tests/play-detail/background-settings.test.js`
Expected: FAIL because the entry component, dialog, and strings do not exist yet.

- [ ] **Step 3: Implement the settings entry and dialog**

```tsx
// src/screens/Home/Views/Setting/settings/Theme/index.tsx
import PlayDetailBackgroundSettings from './PlayDetailBackgroundSettings'

export default memo(() => {
  return (
    <>
      <Theme />
      <IsAutoTheme />
      <IsHideBgDark />
      <IsDynamicBg />
      <PlayDetailBackgroundSettings />
      <IsFontShadow />
      <CustomColors />
    </>
  )
})
```

```tsx
// src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx
export default memo(() => {
  const dialogRef = useRef<DialogType>(null)
  const t = useI18n()
  const isDynamicBg = useSettingValue('theme.dynamicBg')
  const maskMode = useSettingValue('theme.playDetail.background.maskMode')
  const blurRadius = useSettingValue('theme.playDetail.background.blurRadius')
  const colorMaskOpacity = useSettingValue('theme.playDetail.background.colorMaskOpacity')

  return (
    <SubTitle title={t('setting_theme_play_detail_background')}>
      <Text size={12}>{t('setting_theme_play_detail_background_summary', { maskMode, blurRadius, opacity: colorMaskOpacity })}</Text>
      {!isDynamicBg ? <Text size={12}>{t('setting_theme_play_detail_background_disabled_hint')}</Text> : null}
      <View style={styles.actions}>
        <Button onPress={() => { dialogRef.current?.setVisible(true) }}>{t('setting_theme_play_detail_background_open')}</Button>
      </View>
      <PlayDetailBackgroundDialog ref={dialogRef} />
    </SubTitle>
  )
})
```

```tsx
// src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx
export default forwardRef<DialogType, {}>((props, ref) => {
  const musicInfo = usePlayerMusicInfo()
  const setting = useSetting()
  const [draft, setDraft] = useState(readPlayDetailBackgroundSetting(setting))
  const [recommendedMaskColor, setRecommendedMaskColor] = useState<string | null>(null)
  const resolvedConfig = useMemo(() => resolvePlayDetailBackgroundConfig({ setting: draft, recommendedMaskColor }), [draft, recommendedMaskColor])

  return (
    <Dialog ref={ref} title={t('setting_theme_play_detail_background')} height="86%" bgHide={false}>
      <PlayDetailBackgroundLayer source={musicInfo.pic ? { uri: musicInfo.pic, headers: defaultHeaders } : null} resolvedConfig={resolvedConfig}>
        <PreviewPlaceholder />
      </PlayDetailBackgroundLayer>
      <ScrollView>
        <MaskModeToggle ... />
        <SliderRow settingKey="theme.playDetail.background.blurRadius" ... />
        <SliderRow settingKey="theme.playDetail.background.colorMaskOpacity" ... />
        <InputItem label={t('setting_theme_play_detail_background_mask_color')} ... />
      </ScrollView>
    </Dialog>
  )
})
```

- [ ] **Step 4: Add the new language strings**

```json
"setting_theme_play_detail_background": "播放页背景效果",
"setting_theme_play_detail_background_open": "打开调节",
"setting_theme_play_detail_background_disabled_hint": "当前未开启动态背景，开启后会作用到播放页",
"setting_theme_play_detail_background_mask_mode_auto": "自动取色",
"setting_theme_play_detail_background_mask_mode_manual": "手动颜色",
"setting_theme_play_detail_background_apply_auto_mask": "套用当前推荐色"
```

- [ ] **Step 5: Run the focused UI tests again**

Run: `node --test tests/play-detail/theme-customization.test.js tests/play-detail/background-settings.test.js`
Expected: PASS

- [ ] **Step 6: Lint the settings UI files**

Run: `npx eslint src/screens/Home/Views/Setting/settings/Theme/index.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx`
Expected: PASS

- [ ] **Step 7: Commit the settings UI slice**

```bash
git add tests/play-detail/theme-customization.test.js tests/play-detail/background-settings.test.js src/screens/Home/Views/Setting/settings/Theme/index.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json
git commit -m "feat: add play detail background settings dialog"
```

### Task 4: Rewire PageContent to the shared background runtime and remove the fixed edge-band preset

**Files:**
- Modify: `src/components/PageContent.tsx`
- Modify: `tests/play-detail/background-preset.test.js`
- Modify: `tests/play-detail/background-settings.test.js`
- Test: `tests/play-detail/background-preset.test.js`
- Test: `tests/play-detail/background-settings.test.js`

- [ ] **Step 1: Replace the old fixed-preset test with a shared-runtime contract test**

```js
const pageContentFile = readFile('src/components/PageContent.tsx')

assert.match(pageContentFile, /import PlayDetailBackgroundLayer from '@\/screens\/PlayDetail\/BackgroundLayer'/)
assert.match(pageContentFile, /import \{[^}]*readPlayDetailBackgroundSetting[^}]*resolvePlayDetailBackgroundConfig[^}]*\} from '@\/screens\/PlayDetail\/backgroundConfig'/)
assert.match(pageContentFile, /const setting = useSetting\(\)/)
assert.match(pageContentFile, /const playDetailBackgroundSetting = readPlayDetailBackgroundSetting\(setting\)/)
assert.match(pageContentFile, /const resolvedPlayDetailBackgroundConfig = useMemo\(\(\) => resolvePlayDetailBackgroundConfig\(/)
assert.match(pageContentFile, /<PlayDetailBackgroundLayer/)
assert.doesNotMatch(pageContentFile, /playDetailEmbyEdgeOverlayBands/)
assert.doesNotMatch(pageContentFile, /renderPlayDetailEmbyEdgeOverlay/)
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --test tests/play-detail/background-preset.test.js tests/play-detail/background-settings.test.js`
Expected: FAIL because `PageContent` still uses the old fixed edge-band implementation.

- [ ] **Step 3: Rewire `PageContent` to the shared background runtime**

```tsx
// src/components/PageContent.tsx
import { useSetting } from '@/store/setting/hook'
import PlayDetailBackgroundLayer from '@/screens/PlayDetail/BackgroundLayer'
import {
  readPlayDetailBackgroundSetting,
  resolvePlayDetailBackgroundConfig,
} from '@/screens/PlayDetail/backgroundConfig'

const setting = useSetting()
const playDetailBackgroundSetting = readPlayDetailBackgroundSetting(setting)
const resolvedPlayDetailBackgroundConfig = useMemo(() => resolvePlayDetailBackgroundConfig({
  setting: playDetailBackgroundSetting,
  recommendedMaskColor,
}), [playDetailBackgroundSetting, recommendedMaskColor])

return (
  <PlayDetailBackgroundLayer
    source={pic ? { uri: pic, headers: defaultHeaders } : theme['bg-image']}
    resolvedConfig={resolvedPlayDetailBackgroundConfig}
  >
    <View style={{ flex: 1, flexDirection: 'column' }}>{children}</View>
  </PlayDetailBackgroundLayer>
)
```

- [ ] **Step 4: Run the play-detail regression suite**

Run: `node --test tests/play-detail/background-preset.test.js tests/play-detail/background-settings.test.js tests/play-detail/theme-customization.test.js tests/play-detail/foreground-colors.test.js`
Expected: PASS

- [ ] **Step 5: Run broader verification and lint**

Run: `npx eslint src/components/PageContent.tsx src/screens/PlayDetail/backgroundConfig.ts src/screens/PlayDetail/BackgroundLayer.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx tests/play-detail/background-preset.test.js tests/play-detail/background-settings.test.js tests/play-detail/theme-customization.test.js`
Expected: PASS

Run: `node --test tests/play-detail`
Expected: PASS

- [ ] **Step 6: Commit the integrated play-detail background settings feature**

```bash
git add src/components/PageContent.tsx tests/play-detail/background-preset.test.js tests/play-detail/background-settings.test.js
git commit -m "feat: wire play detail background settings into runtime"
```

### Task 5: Final verification before packaging and release work

**Files:**
- Modify: `CHANGELOG.md`
- Test: `tests/play-detail/*`
- Test: release/package scripts

- [ ] **Step 1: Add the change log entry**

```md
## [Unreleased] - 2026-04-09

优化

- 新增“设置 -> 主题设置 -> 播放页背景效果”入口，可基于当前歌曲封面实时调节播放页背景的模糊、蒙版与四周压暗参数
```

- [ ] **Step 2: Re-run the focused verification suite fresh**

Run: `node --test tests/play-detail/background-preset.test.js tests/play-detail/background-settings.test.js tests/play-detail/theme-customization.test.js tests/play-detail/foreground-colors.test.js`
Expected: PASS

- [ ] **Step 3: Re-run lint on all modified files fresh**

Run: `npx eslint src/components/PageContent.tsx src/screens/PlayDetail/backgroundConfig.ts src/screens/PlayDetail/BackgroundLayer.tsx src/screens/Home/Views/Setting/settings/Theme/index.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx src/utils/nativeModules/utils.ts tests/play-detail/background-preset.test.js tests/play-detail/background-settings.test.js tests/play-detail/theme-customization.test.js`
Expected: PASS

- [ ] **Step 4: Build the Android release package**

Run: `npm run pack:android`
Expected: SUCCESS and generated release APKs under `android/app/build/outputs/apk/release/`

- [ ] **Step 5: Commit the release-ready branch state**

```bash
git add CHANGELOG.md
git commit -m "chore: note play detail background settings"
```
