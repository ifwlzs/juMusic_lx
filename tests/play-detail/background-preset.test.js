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
  const horizontalFile = readFile('src/screens/PlayDetail/Horizontal/index.tsx')
  const themeComponentBlock = pageContentFile.slice(
    pageContentFile.indexOf('const themeBackgroundProps'),
    pageContentFile.indexOf('const picComponent'),
  )

  assert.match(pageContentFile, /type BackgroundVariant = 'default' \| 'playDetailEmby'/)
  assert.match(pageContentFile, /playDetailEmby:/)
  assert.match(pageContentFile, /resizeMode: 'stretch'/)
  assert.match(pageContentFile, /blurRadius: Math\.max\(scaleSizeAbsHR\(28\), 24\)/)
  assert.match(pageContentFile, /backgroundColor: 'rgba\(0, 0, 0, 0\.14\)'/)
  assert.match(pageContentFile, /imageStyle: \{ transform: \[\{ scaleX: 1\.1 \}, \{ scaleY: 1\.08 \}\] \}/)
  assert.match(pageContentFile, /const playDetailEmbyOuterRingWidth = 4/)
  assert.match(pageContentFile, /const playDetailEmbyInnerRingWidth = 6/)
  assert.match(pageContentFile, /const playDetailEmbyOuterRingSegmentWidth = `\$\{playDetailEmbyOuterRingWidth \/ 2\}%`/)
  assert.match(pageContentFile, /const playDetailEmbyInnerRingSegmentWidth = `\$\{playDetailEmbyInnerRingWidth \/ 2\}%`/)
  assert.match(pageContentFile, /const playDetailEmbyEdgeOverlayLayers = \[/)
  assert.match(pageContentFile, /paddingHorizontal: playDetailEmbyOuterRingSegmentWidth/)
  assert.match(pageContentFile, /paddingVertical: playDetailEmbyOuterRingSegmentWidth/)
  assert.match(pageContentFile, /rgba\(145, 145, 145, 0\.34\)/)
  assert.match(pageContentFile, /rgba\(145, 145, 145, 0\.26\)/)
  assert.match(pageContentFile, /rgba\(145, 145, 145, 0\.2\)/)
  assert.match(pageContentFile, /rgba\(145, 145, 145, 0\.15\)/)
  assert.match(pageContentFile, /paddingHorizontal: playDetailEmbyInnerRingSegmentWidth/)
  assert.match(pageContentFile, /paddingVertical: playDetailEmbyInnerRingSegmentWidth/)
  assert.match(pageContentFile, /rgba\(145, 145, 145, 0\.12\)/)
  assert.match(pageContentFile, /rgba\(145, 145, 145, 0\.08\)/)
  assert.match(pageContentFile, /const themeBackgroundProps = useMemo\(\(\) => \(/)
  assert.match(themeComponentBlock, /resizeMode: bgConfig\.resizeMode/)
  assert.match(themeComponentBlock, /blurRadius: bgConfig\.blurRadius/)
  assert.match(themeComponentBlock, /imageStyle: bgConfig\.imageStyle/)
  assert.match(themeComponentBlock, /\{\.\.\.themeBackgroundProps\}/)
  assert.match(pageContentFile, /renderPlayDetailEmbyEdgeOverlay\(\)/)
  assert.doesNotMatch(horizontalFile, /<PageContent>/)
})
