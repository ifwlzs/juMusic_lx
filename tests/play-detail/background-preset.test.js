const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('play detail uses emby-style page background preset', () => {
  const playDetailFile = readFile('src/screens/PlayDetail/index.tsx')

  assert.match(playDetailFile, /<PageContent\s+backgroundVariant="playDetailEmby"/)
})

test('page content rewires the emby variant to the shared play detail background runtime', () => {
  const pageContentFile = readFile('src/components/PageContent.tsx')

  assert.match(pageContentFile, /type BackgroundVariant = 'default' \| 'playDetailEmby'/)
  assert.match(pageContentFile, /import PlayDetailBackgroundLayer from '@\/screens\/PlayDetail\/BackgroundLayer'/)
  assert.match(pageContentFile, /import \{[^}]*readPlayDetailBackgroundSetting[^}]*resolvePlayDetailBackgroundConfig[^}]*\} from '@\/screens\/PlayDetail\/backgroundConfig'/)
  assert.match(pageContentFile, /const setting = useSetting\(\)/)
  assert.match(pageContentFile, /const playDetailBackgroundSetting = readPlayDetailBackgroundSetting\(setting\)/)
  assert.match(pageContentFile, /const resolvedPlayDetailBackgroundConfig = useMemo\(\(\) => resolvePlayDetailBackgroundConfig\(/)
  assert.match(pageContentFile, /<PlayDetailBackgroundLayer/)
  assert.doesNotMatch(pageContentFile, /playDetailEmbyEdgeOverlayBands/)
  assert.doesNotMatch(pageContentFile, /renderPlayDetailEmbyEdgeOverlay/)
})
