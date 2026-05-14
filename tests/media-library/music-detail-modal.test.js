const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// 统一从仓库根目录读取源码文件，避免测试受执行目录影响。
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

test('媒体库歌曲详情弹窗组件通过 state 刷新当前歌曲并显示最小 Dialog', () => {
  const modalFile = readFile('src/components/MusicDetailModal/index.tsx')

  // 锁定任务 1 修复后的关键契约：show() 要先更新 state，避免重复打开时显示旧歌信息。
  assert.match(modalFile, /from '@\/components\/common\/Dialog'/)
  assert.match(modalFile, /const dialogRef = useRef<DialogType>\(null\)/)
  assert.match(modalFile, /const \[musicInfo, setMusicInfo\] = useState<LX\.Music\.MusicInfo \| null>\(null\)/)
  assert.match(modalFile, /setMusicInfo\(musicInfo\)/)
  assert.match(modalFile, /dialogRef\.current\?\.setVisible\(true\)/)
  assert.match(modalFile, /title=\{[^\n]*歌曲详情[^\n]*\}/)
  assert.match(modalFile, /musicInfo\?\.name/)
  assert.match(modalFile, /musicInfo\?\.singer/)
  assert.doesNotMatch(modalFile, /musicInfoRef\.current/)
})

test('任务 1 修复涉及的新增契约代码补齐中文注释', () => {
  const actionFile = readFile('src/screens/Home/Views/Mylist/MusicList/listAction.ts')
  const modalFile = readFile('src/components/MusicDetailModal/index.tsx')
  const indexFile = readFile('src/screens/Home/Views/Mylist/MusicList/index.tsx')
  const menuFile = readFile('src/screens/Home/Views/Mylist/MusicList/ListMenu.tsx')

  // 锁定本次修复要求的中文注释，避免后续回退为无说明实现。
  assert.match(actionFile, /\/\/.*媒体库/)
  assert.match(actionFile, /\/\/.*应用内详情弹窗/)
  assert.match(actionFile, /\/\/.*外链/)
  assert.match(modalFile, /\/\/.*弹窗/)
  assert.match(modalFile, /\/\/.*刷新/)
  assert.match(modalFile, /\/\/.*歌曲详情/)
  assert.match(indexFile, /\/\/.*应用内详情弹窗/)
  assert.match(indexFile, /\/\/.*外链/)
  assert.match(menuFile, /\/\/.*详情入口/)
})
