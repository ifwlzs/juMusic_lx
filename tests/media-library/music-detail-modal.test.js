const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('媒体库歌曲详情菜单对本地和不可用歌曲不再禁用', () => {
  const menuFile = readFile('src/screens/Home/Views/Mylist/MusicList/ListMenu.tsx')

  assert.match(menuFile, /musicSourceDetail/)
  assert.doesNotMatch(menuFile, /musicInfo\.source == 'local' \|\| isUnavailable/)
  assert.doesNotMatch(menuFile, /disabled:\s*musicInfo\.source == 'local'/)
  assert.doesNotMatch(menuFile, /disabled:\s*.*isUnavailable/)
})

test('我的列表详情动作对在线音源走外链，对媒体库歌曲走应用内详情弹窗', () => {
  const actionFile = readFile('src/screens/Home/Views/Mylist/MusicList/listAction.ts')
  const indexFile = readFile('src/screens/Home/Views/Mylist/MusicList/index.tsx')

  assert.match(actionFile, /isInternalMusicDetailTarget/)
  assert.match(actionFile, /return !!\(musicInfo\.source == 'local' \|\| getMediaLibraryInfo\(musicInfo\)\)/)
  assert.match(actionFile, /musicSdk\[minfo\.source as LX\.OnlineSource\]\?\.getMusicDetailPageUrl/)
  assert.match(indexFile, /MusicDetailModal/)
  assert.match(indexFile, /onMusicSourceDetail=\{info => \{/)
})