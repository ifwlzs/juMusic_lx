const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('play detail foreground uses a shared near-white palette across text and icon surfaces', () => {
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

  assert.match(paletteFile, /PRIMARY_TEXT:\s*'rgba\(255,\s*255,\s*255,\s*0\.96\)'/)
  assert.match(paletteFile, /SECONDARY_TEXT:\s*'rgba\(255,\s*255,\s*255,\s*0\.78\)'/)
  assert.match(paletteFile, /TERTIARY_TEXT:\s*'rgba\(255,\s*255,\s*255,\s*0\.62\)'/)

  for (const file of filesUsingPalette) {
    assert.match(file, /playDetailPalette\./)
  }
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
