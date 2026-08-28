const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const configPath = path.resolve(__dirname, '../../src/screens/PlayDetail/backgroundConfig.ts')
const palettePath = path.resolve(__dirname, '../../src/screens/PlayDetail/palette.ts')
const loadBackgroundConfig = () => {
  const source = fs.readFileSync(configPath, 'utf8')
  const outputText = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: configPath }).outputText
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

test('ambient palette keeps three cover relationships inside dark lightness ceiling', () => {
  const { resolveAmbientDarkPalette } = loadBackgroundConfig()
  const palette = resolveAmbientDarkPalette(['#ffffff', '#ffe600', '#ff0000', '#00ff66'])
  assert.equal(palette.length, 3)
  assert.equal(new Set(palette).size, 3)
  for (const color of palette) {
    assert.match(color, /^#[0-9a-f]{6}$/)
    assert.ok(rgbLightness(color) <= 0.34, `${color} is not dark enough`)
  }
})

test('ambient palette options increase visible color brightness and hue separation', () => {
  const { resolveAmbientDarkPalette } = loadBackgroundConfig()
  const palette = resolveAmbientDarkPalette(['#ffffff', '#ff0000', '#00ff66'], null, {
    brightness: 1.18,
    saturation: 1.12,
    hueSpread: 42,
  })
  assert.equal(palette.length, 3)
  assert.ok(palette.some(color => rgbLightness(color) >= 0.25))
  assert.ok(new Set(palette).size >= 3)
})

test('ambient brightness controls have independent defaults', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/config/defaultSetting.ts'), 'utf8')
  for (const [key, value] of [
    ['ambientBrightness', '1.18'],
    ['ambientSaturation', '1.12'],
    ['ambientOverlayOpacity', '0.26'],
    ['ambientHueSpread', '42'],
  ]) {
    assert.match(source, new RegExp(`theme\\.playDetail\\.background\\.${key}.*${value}`))
  }
})

test('ambient palette derives missing colors and falls back for invalid input', () => {
  const { ambientDarkFallbackPalette, resolveAmbientDarkPalette } = loadBackgroundConfig()
  const derived = resolveAmbientDarkPalette(['#4a90e2'])
  assert.equal(derived.length, 3)
  assert.equal(new Set(derived).size, 3)
  assert.deepEqual(resolveAmbientDarkPalette(['bad', '', '#gggggg']), ambientDarkFallbackPalette)
})

test('ambient renderer is static and independent from legacy blur config', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/PlayDetail/AmbientDarkBackgroundLayer.tsx'), 'utf8')
  assert.match(source, /react-native-linear-gradient/)
  assert.match(source, /colors=\{\[colors\[0\], colors\[1\], colors\[2\]\]\}/)
  assert.match(source, /overlayOpacity\?: number/)
  assert.match(source, /rgba\(0, 0, 0, \$\{overlayOpacity\.toFixed\(2\)\}\)/)
  assert.doesNotMatch(source, /Animated|setInterval|useEffect|blurRadius|ResolvedPlayDetailBackgroundConfig/)
})

test('ambient palette bridge and hook provide native colors with stale-request protection', () => {
  const nativeSource = fs.readFileSync(path.resolve(__dirname, '../../android/app/src/main/java/io/ifwlzs/jumusic/lx/utils/UtilsModule.java'), 'utf8')
  const bridgeSource = fs.readFileSync(path.resolve(__dirname, '../../src/utils/nativeModules/utils.ts'), 'utf8')
  const hookPath = path.resolve(__dirname, '../../src/screens/PlayDetail/useAmbientDarkPalette.ts')
  assert.match(nativeSource, /extractDominantColorsFromImage\(String imageUri, Promise promise\)/)
  assert.match(nativeSource, /WritableArray/)
  assert.match(bridgeSource, /export const extractDominantColorsFromImage/)
  assert.match(bridgeSource, /Promise\.resolve\(\[\]\)/)
  assert.equal(fs.existsSync(hookPath), true)
  const hookSource = fs.readFileSync(hookPath, 'utf8')
  assert.match(hookSource, /requestVersionRef/)
  assert.match(hookSource, /resolveAmbientDarkPalette/)
  assert.match(hookSource, /extractDominantHueFromImage/)
})

test('production page and settings select ambient renderer without adding variant to legacy map', () => {
  const pageContentFile = fs.readFileSync(path.resolve(__dirname, '../../src/components/PageContent.tsx'), 'utf8')
  const dialogFile = fs.readFileSync(path.resolve(__dirname, '../../src/screens/Home/Views/Setting/settings/Theme/PlayDetailBackgroundDialog.tsx'), 'utf8')
  assert.match(pageContentFile, /useSettingValue\('theme\.playDetail\.background\.variant'\)/)
  assert.match(pageContentFile, /variant == 'ambientDark'/)
  assert.match(pageContentFile, /<AmbientDarkBackgroundLayer/)
  assert.match(dialogFile, /setting_theme_play_detail_background_variant_blur/)
  assert.match(dialogFile, /setting_theme_play_detail_background_variant_ambient_dark/)
  assert.match(dialogFile, /variant == 'blur'/)
  assert.match(dialogFile, /<AmbientDarkBackgroundLayer/)
  for (const key of ['ambientBrightness', 'ambientSaturation', 'ambientOverlayOpacity', 'ambientHueSpread']) {
    assert.match(pageContentFile, new RegExp(`theme\\.playDetail\\.background\\.${key}`))
    assert.match(dialogFile, new RegExp(`theme\\.playDetail\\.background\\.${key}`))
  }
  for (const key of ['ambient_brightness', 'ambient_saturation', 'ambient_hue_spread', 'ambient_overlay']) {
    assert.match(dialogFile, new RegExp(`setting_theme_play_detail_background_${key}`))
  }
  const legacyMap = dialogFile.match(/const backgroundSettingKeyMap[\s\S]*?\n\}/)?.[0] ?? ''
  assert.doesNotMatch(legacyMap, /variant/)
})

test('all languages define ambient background labels', () => {
  const keys = [
    'setting_theme_play_detail_background_variant',
    'setting_theme_play_detail_background_variant_blur',
    'setting_theme_play_detail_background_variant_ambient_dark',
    'setting_theme_play_detail_background_ambient_dark_desc',
  ]
  for (const language of ['zh-cn', 'zh-tw', 'en-us']) {
    const values = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../src/lang/${language}.json`), 'utf8'))
    for (const key of keys) assert.equal(typeof values[key], 'string', `${language} missing ${key}`)
  }
})

// 直接执行 palette getter，验证背景方案切换后的真实颜色，而非依赖源文件字符串。
const loadPalette = (setting, theme) => {
  const source = fs.readFileSync(palettePath, 'utf8')
  const outputText = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: palettePath }).outputText
  const mod = new Module(palettePath, module)
  mod.filename = palettePath
  mod.paths = Module._nodeModulePaths(path.dirname(palettePath))
  mod.require = request => {
    if (request === '@/store/setting/state') return { default: { setting } }
    if (request === '@/store/theme/state') return { default: { theme } }
    if (request === '@react-native/normalize-colors') {
      return {
        default: color => {
          if (!/^#[0-9a-f]{6}$/i.test(color)) return null
          return (Number.parseInt(color.slice(1), 16) * 256 + 255) >>> 0
        },
      }
    }
    throw new Error(`Unexpected dependency: ${request}`)
  }
  mod._compile(outputText, palettePath)
  return mod.exports.playDetailPalette
}

test('ambient variant forces every foreground surface into a white hierarchy', () => {
  const setting = {
    'theme.playDetail.background.variant': 'ambientDark',
  }
  const theme = { isDark: false, 'c-primary-font': '#111111', 'c-primary-font-active': '#222222', 'c-primary-light-100': '#333333', 'c-primary-light-200': '#444444', 'c-primary': '#555555' }
  const palette = loadPalette(setting, theme)
  assert.equal(palette.PRIMARY_TEXT, '#FFFFFF')
  assert.equal(palette.LYRIC_ACTIVE_TEXT, '#FFFFFF')
  assert.match(palette.SECONDARY_TEXT, /^rgba\(255, 255, 255, 0\.[0-9]{2}\)$/)
  assert.match(palette.LYRIC_INACTIVE_TEXT, /^rgba\(255, 255, 255, 0\.[0-9]{2}\)$/)
  assert.equal(palette.PROGRESS_COLORS.thumb, '#FFFFFF')
  for (const value of Object.values(palette.PROGRESS_COLORS)) {
    assert.match(value, /^(#FFFFFF|rgba\(255, 255, 255, (0\.[0-9]{2}|1\.00)\))$/)
  }
})

test('blur variant preserves custom play detail colors', () => {
  const setting = {
    'theme.playDetail.background.variant': 'blur',
    'theme.playDetail.light.primary': '#112233',
    'theme.playDetail.light.lyricActive': '#223344',
    'theme.playDetail.light.lyricInactive': '#334455',
    'theme.playDetail.light.lyricTranslation': '#445566',
    'theme.playDetail.light.lyricRoma': '#556677',
  }
  const theme = { isDark: false, 'c-primary-font': '#111111', 'c-primary-font-active': '#222222', 'c-primary-light-100': '#333333', 'c-primary-light-200': '#444444', 'c-primary': '#555555' }
  const palette = loadPalette(setting, theme)
  assert.equal(palette.PRIMARY_TEXT, '#112233')
  assert.equal(palette.LYRIC_ACTIVE_TEXT, '#223344')
  assert.equal(palette.LYRIC_INACTIVE_TEXT, '#334455')
})
