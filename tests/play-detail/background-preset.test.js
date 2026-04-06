const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('play detail uses emby-style page background preset', () => {
  const playDetailFile = readFile('src/screens/PlayDetail/index.tsx')

  assert.match(playDetailFile, /<PageContent\s+backgroundVariant="playDetailEmby"/)
})

test('page content defines the emby background variant with stronger blur, theme tint, and a neutral greying mask strong enough to pull white toward #919191', () => {
  const pageContentFile = readFile('src/components/PageContent.tsx')

  assert.match(pageContentFile, /type BackgroundVariant = 'default' \| 'playDetailEmby'/)
  assert.match(pageContentFile, /playDetailEmby:/)
  assert.match(pageContentFile, /resizeMode: 'stretch'/)
  assert.match(pageContentFile, /blurRadius: Math\.max\(scaleSizeAbsHR\(36\), 18\)/)
  assert.match(pageContentFile, /tintThemeColorKey: 'c-primary-background-active'/)
  assert.match(pageContentFile, /tintOpacity: 0\.16/)
  assert.match(pageContentFile, /backgroundColor: 'rgba\(0, 0, 0, 0\.43\)'/)
  assert.match(pageContentFile, /imageStyle: \{ transform: \[\{ scaleX: 1\.16 \}, \{ scaleY: 1\.08 \}\] \}/)
})
