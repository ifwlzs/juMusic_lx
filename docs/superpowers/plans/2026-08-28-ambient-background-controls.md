# Ambient Background Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-adjustable brightness, saturation, hue spread, and overlay controls for the existing `ambientDark` play-detail background while preserving the legacy blur configuration unchanged.

**Architecture:** Store four new ambient-only settings beside the existing background keys. Keep the pure palette resolver responsible for applying those settings, and let the settings dialog maintain a local draft for live preview before persisting each slider on release. The production page and settings preview will consume the same resolved palette and renderer, so the preview matches playback.

**Tech Stack:** TypeScript, React Native, `react-native-linear-gradient`, existing settings hooks, Node `node:test` contracts.

## Global Constraints

- `theme.playDetail.background.variant` remains independent from all legacy blur settings.
- New ambient controls affect only the `ambientDark` renderer.
- Defaults must remain dark enough for white foreground content while visibly separating the three gradient colors.
- Slider movement updates preview immediately; persistence occurs on slider release and writes only the changed ambient key.
- Invalid or missing cover colors continue to use a deterministic fallback palette.
- All new or modified nontrivial code receives concise Chinese comments.
- Existing blur mode values and behavior must remain byte-for-byte equivalent in the settings map and resolver path.

---

### Task 1: Add ambient control settings and pure palette parameters

**Files:**
- Modify: `src/types/app_setting.d.ts`
- Modify: `src/config/defaultSetting.ts`
- Modify: `src/screens/PlayDetail/backgroundConfig.ts`
- Modify: `tests/play-detail/ambient-dark-background.test.js`

**Interfaces:**
- Produces four settings: `ambientBrightness: number`, `ambientSaturation: number`, `ambientOverlayOpacity: number`, `ambientHueSpread: number`.
- Extends `resolveAmbientDarkPalette(colors, fallbackHue, options?)` with optional `AmbientDarkPaletteOptions`.
- Defaults: brightness `1.18`, saturation `1.12`, overlay opacity `0.26`, hue spread `42` degrees.

- [ ] **Step 1: Write failing setting and resolver tests**

Add assertions for the four typed/default keys and call:

```js
const palette = resolveAmbientDarkPalette(['#ffffff', '#ff0000', '#00ff66'], null, {
  brightness: 1.18,
  saturation: 1.12,
  hueSpread: 42,
})
assert.equal(palette.length, 3)
assert.ok(palette.some(color => rgbLightness(color) >= 0.25))
assert.ok(new Set(palette).size >= 3)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
D:\Program Files\nvm\v24.14.0\node.exe --test tests/play-detail/ambient-dark-background.test.js
```

Expected: FAIL because the settings and resolver options do not exist.

- [ ] **Step 3: Add typed/default settings**

Add the four keys next to the existing background settings, with Chinese comments explaining that they apply only to `ambientDark`. Add the exact defaults listed above without changing any existing background defaults.

- [ ] **Step 4: Implement brightness/saturation/spread-aware palette resolution**

Define:

```ts
export interface AmbientDarkPaletteOptions {
  brightness?: number
  saturation?: number
  hueSpread?: number
}
```

Update normalization to multiply source lightness by `0.42 * brightness`, multiply saturation by `saturation`, clamp final lightness to `0.10..0.32`, clamp saturation to `0.24..0.68`, and derive missing hues using `hueSpread`, `-hueSpread - 6`, and `hueSpread * 2 + 2`. Keep the invalid-input fallback deterministic.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the ambient background test file and confirm all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/types/app_setting.d.ts src/config/defaultSetting.ts src/screens/PlayDetail/backgroundConfig.ts tests/play-detail/ambient-dark-background.test.js
git commit -m "feat(player): add ambient background controls"
```

### Task 2: Apply controls to production and settings preview

**Files:**
- Modify: `src/components/PageContent.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx`
- Modify: `src/screens/PlayDetail/AmbientDarkBackgroundLayer.tsx`
- Modify: `tests/play-detail/ambient-dark-background.test.js`

**Interfaces:**
- Production and preview both call `resolveAmbientDarkPalette(..., ambientOptions)`.
- `AmbientDarkBackgroundLayer` receives `overlayOpacity?: number` and defaults to the configured value.

- [ ] **Step 1: Write failing integration contracts**

Assert that production and dialog read all four settings, pass options to `resolveAmbientDarkPalette`, expose four ambient slider labels, and render the overlay with a configurable opacity.

- [ ] **Step 2: Run tests and verify RED**

Run the focused ambient and background settings tests; expected failure is missing controls and option wiring.

- [ ] **Step 3: Wire production palette options**

Read the four values with `useSettingValue`, create a memoized `ambientOptions` object, and pass it to `useAmbientDarkPalette`. Keep the blur resolver and source path untouched.

- [ ] **Step 4: Wire settings dialog draft and persistence**

Keep ambient values in a separate local draft. Add sliders with ranges:

```text
brightness: 0.85..1.45, step 0.01
saturation: 0.70..1.45, step 0.01
hueSpread: 18..90 degrees, step 1
overlayOpacity: 0.12..0.38, step 0.01
```

Update preview on every slider movement and call `updateSetting` with only the corresponding ambient key from `onSlidingComplete`. Do not invoke `persistDraftPatch` for these keys.

- [ ] **Step 5: Make the overlay configurable and add reset controls**

Pass `overlayOpacity` into `AmbientDarkBackgroundLayer`. Add an ambient-only restore button that writes the four ambient defaults and never touches the eleven blur values.

- [ ] **Step 6: Run tests and ESLint**

Run all play-detail tests and focused ESLint for the modified files.

- [ ] **Step 7: Commit**

```powershell
git add src/components/PageContent.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundSettings.tsx src/screens/PlayDetail/AmbientDarkBackgroundLayer.tsx tests/play-detail/ambient-dark-background.test.js
git commit -m "feat(player): expose ambient tuning controls"
```

### Task 3: Add translations, changelog, and final verification

**Files:**
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`
- Modify: `CHANGELOG.md`
- Verify: `tests/play-detail/*.test.js`, `tests/search/music-ranking.test.js`, `tests/media-library/search-integration.test.js`, `tests/mylist/artist-related-songs.test.js`

**Interfaces:**
- Adds four slider labels, four value descriptions, and ambient reset text in all three languages.

- [ ] **Step 1: Add exact translations**

Use concise labels matching the controls: brightness, saturation, hue spread, readability overlay, and restore ambient defaults.

- [ ] **Step 2: Add changelog entry**

Record that ambient background brightness, color intensity, hue separation, and readability overlay are user-adjustable without changing blur settings.

- [ ] **Step 3: Run JSON parsing and all focused tests**

Explicitly enumerate play-detail test files on Windows and run all search/media-library regressions. Confirm `0` failures.

- [ ] **Step 4: Run focused ESLint and `git diff --check`**

Confirm no lint errors and no whitespace errors.

- [ ] **Step 5: Commit final documentation**

```powershell
git add src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json CHANGELOG.md
git commit -m "docs: document ambient background controls"
```
