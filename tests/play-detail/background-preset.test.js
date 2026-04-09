const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('play detail uses emby-style page background preset', () => {
  const playDetailFile = readFile('src/screens/PlayDetail/index.tsx')

  assert.match(playDetailFile, /<PageContent\s+backgroundVariant="playDetailEmby"/)
})

test('page content rewires the emby variant to a mobile-safe shared background runtime instead of the old hard-band renderer', () => {
  const pageContentFile = readFile('src/components/PageContent.tsx')
  const backgroundConfigFile = readFile('src/screens/PlayDetail/backgroundConfig.ts')
  const backgroundLayerFile = readFile('src/screens/PlayDetail/BackgroundLayer.tsx')

  assert.match(pageContentFile, /type BackgroundVariant = 'default' \| 'playDetailEmby'/)
  assert.match(pageContentFile, /import PlayDetailBackgroundLayer from '@\/screens\/PlayDetail\/BackgroundLayer'/)
  assert.match(pageContentFile, /import \{[^}]*readPlayDetailBackgroundSetting[^}]*resolvePlayDetailBackgroundConfig[^}]*\} from '@\/screens\/PlayDetail\/backgroundConfig'/)
  assert.match(pageContentFile, /const setting = useSetting\(\)/)
  assert.match(pageContentFile, /const playDetailBackgroundSetting = readPlayDetailBackgroundSetting\(setting\)/)
  assert.match(pageContentFile, /const resolvedPlayDetailBackgroundConfig = useMemo\(\(\) => resolvePlayDetailBackgroundConfig\(/)
  assert.match(pageContentFile, /<PlayDetailBackgroundLayer/)

  assert.match(backgroundConfigFile, /export interface PlayDetailBackgroundBlurLayer/)
  assert.match(backgroundConfigFile, /export interface PlayDetailBackgroundVignetteBand/)
  assert.match(backgroundConfigFile, /blurLayers: PlayDetailBackgroundBlurLayer\[\]/)
  assert.match(backgroundConfigFile, /vignetteBands: PlayDetailBackgroundVignetteBand\[\]/)
  assert.match(backgroundConfigFile, /export const resolveNativeBlurLayers =/)
  assert.match(backgroundConfigFile, /export const resolveVignetteBands =/)
  assert.doesNotMatch(backgroundConfigFile, /brightnessOverlayColor: imageBrightnessDelta >= 0 \? '#ffffff' : '#000000'/)

  assert.match(backgroundLayerFile, /resolvedConfig\.blurLayers\.map/)
  assert.match(backgroundLayerFile, /resolvedConfig\.vignetteBands\.flatMap/)
  assert.match(backgroundLayerFile, /pointerEvents="none"/)
  assert.doesNotMatch(backgroundLayerFile, /blurRadius=\{resolvedConfig\.blurRadius\}/)
  assert.doesNotMatch(backgroundLayerFile, /const renderVignetteBands = \(/)
})
