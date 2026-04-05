const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('我的列表菜单移除旧来源入口并识别生成媒体列表只读状态', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/ListMenu.tsx')
  assert.doesNotMatch(file, /sourceLists/)
  assert.match(file, /mediaSource\?\.readOnly/)
})

test('我的列表页面不再挂载 SourceLists 浮层', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/index.tsx')
  assert.doesNotMatch(file, /SourceLists/)
  assert.doesNotMatch(file, /onSourceLists/)
})

test('歌曲列表对媒体来源不可用占位增加拦截与状态展示', () => {
  const listFile = readFile('src/screens/Home/Views/Mylist/MusicList/List.tsx')
  const itemFile = readFile('src/screens/Home/Views/Mylist/MusicList/ListItem.tsx')

  assert.match(listFile, /unavailableReason|isUnavailableMediaLibraryMusic/)
  assert.match(itemFile, /mediaLibrary/)
  assert.match(itemFile, /media_music_unavailable|UNAVAILABLE/)
  assert.doesNotMatch(itemFile, /media_list_read_only|READ ONLY|RO/)
})

test('歌曲菜单和动作对只读媒体歌单与不可用歌曲加保护', () => {
  const menuFile = readFile('src/screens/Home/Views/Mylist/MusicList/ListMenu.tsx')
  const actionFile = readFile('src/screens/Home/Views/Mylist/MusicList/listAction.ts')

  assert.match(menuFile, /mediaSource\?\.readOnly/)
  assert.match(menuFile, /unavailableReason/)
  assert.match(actionFile, /unavailableReason/)
  assert.match(actionFile, /media_list_read_only|media_music_unavailable/)
})

test('歌曲列表组件不再把只读状态作为行内展示逻辑传给 ListItem', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MusicList/List.tsx')

  assert.doesNotMatch(file, /isReadOnlyList=/)
})
