const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('play detail foreground uses a shared theme-driven palette across text and icon surfaces', () => {
  const paletteFile = readFile('src/screens/PlayDetail/palette.ts')
  const filesUsingPalette = [
    'src/screens/PlayDetail/Vertical/components/Header.tsx',
    'src/screens/PlayDetail/Vertical/components/Btn.tsx',
    'src/screens/PlayDetail/Vertical/components/TimeoutExitBtn.tsx',
    'src/screens/PlayDetail/Vertical/Player/components/Status.tsx',
    'src/screens/PlayDetail/Vertical/Player/components/PlayInfo.tsx',
    'src/screens/PlayDetail/Vertical/Player/components/ControlBtn.tsx',
    'src/screens/PlayDetail/Vertical/Player/components/MoreBtn/Btn.tsx',
    'src/screens/PlayDetail/Vertical/Player/components/MoreBtn/TimeoutExitBtn.tsx',
    'src/screens/PlayDetail/Vertical/Lyric.tsx',
    'src/screens/PlayDetail/Horizontal/components/Header.tsx',
    'src/screens/PlayDetail/Horizontal/components/Btn.tsx',
    'src/screens/PlayDetail/Horizontal/Player/Status.tsx',
    'src/screens/PlayDetail/Horizontal/Player/PlayInfo.tsx',
    'src/screens/PlayDetail/Horizontal/Player/ControlBtn.tsx',
    'src/screens/PlayDetail/Horizontal/MoreBtn/Btn.tsx',
    'src/screens/PlayDetail/Horizontal/MoreBtn/TimeoutExitBtn.tsx',
    'src/screens/PlayDetail/Horizontal/Lyric.tsx',
    'src/screens/PlayDetail/components/SettingPopup/settings/SettingVolume.tsx',
    'src/screens/PlayDetail/components/SettingPopup/settings/SettingPlaybackRate.tsx',
    'src/screens/PlayDetail/components/SettingPopup/settings/SettingLrcFontSize.tsx',
  ].map(readFile)

  assert.match(paletteFile, /themeState\.theme\['c-primary-font'\]/)
  assert.match(paletteFile, /themeState\.theme\['c-primary-font-active'\]/)
  assert.match(paletteFile, /themeState\.theme\['c-primary-light-100'\]/)
  assert.match(paletteFile, /themeState\.theme\['c-primary-light-200'\]/)
  assert.match(paletteFile, /get PRIMARY_TEXT\(\)/)
  assert.match(paletteFile, /get SECONDARY_TEXT\(\)/)
  assert.match(paletteFile, /get TERTIARY_TEXT\(\)/)
  assert.match(paletteFile, /get LYRIC_ACTIVE_TEXT\(\)/)
  assert.match(paletteFile, /get LYRIC_ACTIVE_TRANSLATION_TEXT\(\)/)

  for (const file of filesUsingPalette) {
    assert.match(file, /playDetailPalette\./)
  }
})

test('play detail lyric current line uses lighter theme tones so it stands apart from non-active lines', () => {
  const verticalLyric = readFile('src/screens/PlayDetail/Vertical/Lyric.tsx')
  const horizontalLyric = readFile('src/screens/PlayDetail/Horizontal/Lyric.tsx')

  assert.match(verticalLyric, /playDetailPalette\.LYRIC_ACTIVE_TEXT/)
  assert.match(verticalLyric, /playDetailPalette\.LYRIC_ACTIVE_TRANSLATION_TEXT/)
  assert.match(horizontalLyric, /playDetailPalette\.LYRIC_ACTIVE_TEXT/)
  assert.match(horizontalLyric, /playDetailPalette\.LYRIC_ACTIVE_TRANSLATION_TEXT/)
  assert.doesNotMatch(verticalLyric, /theme\['c-primary'\]/)
  assert.doesNotMatch(horizontalLyric, /theme\['c-primary'\]/)
})

test('play detail stops using gray helper tokens for primary foreground content', () => {
  const playDetailFiles = [
    'src/screens/PlayDetail/Vertical/components/Header.tsx',
    'src/screens/PlayDetail/Vertical/components/Btn.tsx',
    'src/screens/PlayDetail/Vertical/components/TimeoutExitBtn.tsx',
    'src/screens/PlayDetail/Vertical/Player/components/Status.tsx',
    'src/screens/PlayDetail/Vertical/Player/components/PlayInfo.tsx',
    'src/screens/PlayDetail/Vertical/Player/components/ControlBtn.tsx',
    'src/screens/PlayDetail/Vertical/Player/components/MoreBtn/Btn.tsx',
    'src/screens/PlayDetail/Vertical/Player/components/MoreBtn/TimeoutExitBtn.tsx',
    'src/screens/PlayDetail/Vertical/Lyric.tsx',
    'src/screens/PlayDetail/Horizontal/components/Header.tsx',
    'src/screens/PlayDetail/Horizontal/components/Btn.tsx',
    'src/screens/PlayDetail/Horizontal/Player/Status.tsx',
    'src/screens/PlayDetail/Horizontal/Player/PlayInfo.tsx',
    'src/screens/PlayDetail/Horizontal/Player/ControlBtn.tsx',
    'src/screens/PlayDetail/Horizontal/MoreBtn/Btn.tsx',
    'src/screens/PlayDetail/Horizontal/MoreBtn/TimeoutExitBtn.tsx',
    'src/screens/PlayDetail/Horizontal/Lyric.tsx',
  ].map(readFile).join('\n')

  assert.doesNotMatch(playDetailFiles, /theme\['c-font-label'\]/)
  assert.doesNotMatch(playDetailFiles, /theme\['c-500'\]/)
  assert.doesNotMatch(playDetailFiles, /theme\['c-550'\]/)
  assert.doesNotMatch(playDetailFiles, /theme\['c-350'\]/)
  assert.doesNotMatch(playDetailFiles, /theme\['c-button-font'\]/)
})

test('play detail palette imports resolve from each folder depth correctly', () => {
  const horizontalMoreBtn = readFile('src/screens/PlayDetail/Horizontal/MoreBtn/Btn.tsx')
  const horizontalMoreTimeoutBtn = readFile('src/screens/PlayDetail/Horizontal/MoreBtn/TimeoutExitBtn.tsx')
  const verticalMoreBtn = readFile('src/screens/PlayDetail/Vertical/Player/components/MoreBtn/Btn.tsx')
  const verticalMoreTimeoutBtn = readFile('src/screens/PlayDetail/Vertical/Player/components/MoreBtn/TimeoutExitBtn.tsx')

  assert.match(horizontalMoreBtn, /from '\.\.\/\.\.\/palette'/)
  assert.match(horizontalMoreTimeoutBtn, /from '\.\.\/\.\.\/palette'/)
  assert.match(verticalMoreBtn, /from '\.\.\/\.\.\/\.\.\/\.\.\/palette'/)
  assert.match(verticalMoreTimeoutBtn, /from '\.\.\/\.\.\/\.\.\/\.\.\/palette'/)
})

test('mini player title uses deep body text instead of gray helper text', () => {
  const playerBarTitle = readFile('src/components/player/PlayerBar/components/Title.tsx')

  assert.match(playerBarTitle, /<Text color=\{theme\['c-font'\]\} numberOfLines=\{1\}>\{title\}<\/Text>/)
  assert.doesNotMatch(playerBarTitle, /theme\['c-font-label'\]/)
})
