const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('play detail can force a light status bar regardless of the active app theme', () => {
  const statusBarFile = readFile('src/components/common/StatusBar.tsx')
  const playDetailFile = readFile('src/screens/PlayDetail/index.tsx')
  const verticalHeaderFile = readFile('src/screens/PlayDetail/Vertical/components/Header.tsx')
  const horizontalFile = readFile('src/screens/PlayDetail/Horizontal/index.tsx')
  const navigationFile = readFile('src/navigation/navigation.ts')
  const playDetailNavigationBlock = navigationFile.slice(
    navigationFile.indexOf('export function pushPlayDetailScreen'),
    navigationFile.indexOf('export function pushSonglistDetailScreen'),
  )

  assert.match(statusBarFile, /forceLightContent\?: boolean/)
  assert.match(statusBarFile, /forceLightContent \? 'light-content' : statusBarStyle/)
  assert.match(playDetailFile, /<StatusBar forceLightContent \/>/)
  assert.match(verticalHeaderFile, /<StatusBar forceLightContent \/>/)
  assert.match(horizontalFile, /<StatusBar forceLightContent \/>/)
  assert.match(
    playDetailNavigationBlock,
    /name: PLAY_DETAIL_SCREEN[\s\S]*?statusBar:\s*\{[\s\S]*?style: 'light'/,
  )
  assert.doesNotMatch(
    playDetailNavigationBlock,
    /statusBar:\s*\{[\s\S]*?style: getStatusBarStyle\(theme\.isDark\)/,
  )
})

test('play detail palette resolves separate light and dark custom color groups, with white active lyrics by default in dark mode', () => {
  const paletteFile = readFile('src/screens/PlayDetail/palette.ts')
  const defaultSettingFile = readFile('src/config/defaultSetting.ts')
  const appSettingFile = readFile('src/types/app_setting.d.ts')

  assert.match(paletteFile, /theme\.playDetail\.light\.primary/)
  assert.match(paletteFile, /theme\.playDetail\.dark\.primary/)
  assert.match(paletteFile, /theme\.playDetail\.light\.lyricActive/)
  assert.match(paletteFile, /theme\.playDetail\.dark\.lyricActive/)
  assert.match(paletteFile, /themeState\.theme\.isDark[\s\S]*#FFFFFF/)
  assert.match(paletteFile, /get LYRIC_INACTIVE_TEXT\(\)/)
  assert.match(paletteFile, /get LYRIC_TRANSLATION_TEXT\(\)/)
  assert.match(paletteFile, /get LYRIC_ROMA_TEXT\(\)/)
  assert.match(paletteFile, /get LYRIC_ACTIVE_ROMA_TEXT\(\)/)

  assert.match(defaultSettingFile, /'theme\.playDetail\.light\.primary': ''/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.dark\.primary': ''/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.light\.lyricRoma': ''/)
  assert.match(defaultSettingFile, /'theme\.playDetail\.dark\.lyricRoma': ''/)

  assert.match(appSettingFile, /'theme\.playDetail\.light\.primary': string/)
  assert.match(appSettingFile, /'theme\.playDetail\.dark\.primary': string/)
  assert.match(appSettingFile, /'theme\.playDetail\.light\.lyricTranslation': string/)
  assert.match(appSettingFile, /'theme\.playDetail\.dark\.lyricTranslation': string/)
})

test('theme settings expose a dedicated custom colors editor for the play detail light and dark groups', () => {
  const themeSettingsIndexFile = readFile('src/screens/Home/Views/Setting/settings/Theme/index.tsx')
  const customColorsFile = readFile('src/screens/Home/Views/Setting/settings/Theme/CustomColors.tsx')

  assert.match(themeSettingsIndexFile, /import CustomColors from '\.\/CustomColors'/)
  assert.match(themeSettingsIndexFile, /<CustomColors \/>/)
  assert.match(customColorsFile, /theme\.playDetail\.light\.primary/)
  assert.match(customColorsFile, /theme\.playDetail\.dark\.primary/)
  assert.match(customColorsFile, /theme\.playDetail\.light\.lyricTranslation/)
  assert.match(customColorsFile, /theme\.playDetail\.dark\.lyricRoma/)
})

test('theme settings expose a dedicated play detail background settings entry', () => {
  const themeSettingsIndexFile = readFile('src/screens/Home/Views/Setting/settings/Theme/index.tsx')

  assert.match(themeSettingsIndexFile, /import PlayDetailBackgroundSettings from '\.\/PlayDetailBackgroundSettings'/)
  assert.match(themeSettingsIndexFile, /<PlayDetailBackgroundSettings \/>/)
})
