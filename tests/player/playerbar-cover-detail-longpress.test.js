const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

// 读取源码文本做交互契约测试，避免 React Native 运行时依赖影响这个小行为的回归验证。
const readFile = relativePath => fs.readFileSync(path.resolve(__dirname, '../../', relativePath), 'utf8')

// 封面长按现在承担“打开歌曲详情页”的职责，详情页需要完整播放歌曲对象而不是展示态 musicInfo。
test('小播放器封面长按打开歌曲详情页', () => {
  const file = readFile('src/components/player/PlayerBar/components/Pic.tsx')
  const longPressBlock = file.slice(file.indexOf('const handleLongPress'), file.indexOf('const handleError'))

  assert.match(longPressBlock, /const playMusicInfo = playerState\.playMusicInfo\.musicInfo/)
  assert.match(longPressBlock, /'progress' in playMusicInfo/)
  assert.match(longPressBlock, /playMusicInfo\.metadata\.musicInfo/)
  assert.match(longPressBlock, /navigations\.pushMusicDetailScreen\(targetComponentId,\s*\{\s*musicInfo/)
  assert.doesNotMatch(longPressBlock, /jumpListPosition/)
})

// 标题长按继续保留列表定位能力，避免新增详情入口时把原有能力删掉。
test('小播放器标题长按继续定位当前播放歌曲到列表位置', () => {
  const file = readFile('src/components/player/PlayerBar/components/Title.tsx')
  const start = file.indexOf('const handleLongPress')
  const longPressBlock = file.slice(start, file.indexOf('const title', start))

  assert.match(longPressBlock, /global\.app_event\.jumpListPosition\(\)/)
})
