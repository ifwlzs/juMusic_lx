const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('我的列表菜单移除来源歌曲列表入口', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/ListMenu.tsx')
  assert.doesNotMatch(file, /sourceLists/)
})

test('我的列表页面不再挂载来源歌曲列表浮层', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/index.tsx')
  assert.doesNotMatch(file, /SourceLists/)
})

test('LibraryMusicList 在 Task 7 后允许远端来源走统一播放链路', () => {
  const file = readFile('src/components/LibraryMusicList/index.tsx')
  assert.doesNotMatch(file, /musicInfo\.source\s*===\s*'local'/)
  assert.match(file, /addListMusics/)
  assert.match(file, /playList/)
})

test('Task 6 来源歌曲列表骨架不直接承担连接创建与凭据保存', () => {
  const file = readFile('src/screens/Home/Views/Mylist/SourceLists/ConnectionList.tsx')
  assert.doesNotMatch(file, /saveConnections/)
})

test('来源列表为 provider 与数量文案显式使用深色正文而不是跟随浅辅助色', () => {
  const file = readFile('src/screens/Home/Views/Mylist/SourceLists/ConnectionList.tsx')

  assert.match(file, /useTheme/)
  assert.match(file, /<Text size=\{12\} color=\{theme\['c-font'\]\}>/)
})

test('SourceLists 相关文案通过 i18n 提供而不是硬编码中文', () => {
  const connectionList = readFile('src/screens/Home/Views/Mylist/SourceLists/ConnectionList.tsx')
  const connectionForm = readFile('src/screens/Home/Views/Mylist/SourceLists/ConnectionForm.tsx')
  const sourceMusicList = readFile('src/screens/Home/Views/Mylist/SourceLists/SourceMusicList.tsx')

  assert.doesNotMatch(connectionList, /新增来源|首/)
  assert.match(connectionForm, /useI18n/)
  assert.doesNotMatch(connectionForm, /来源类型|来源名称|根路径或 URI|用户名|密码|主机|共享名|保存|取消/)
  assert.match(sourceMusicList, /t\('back'\)/)
  assert.match(sourceMusicList, /t\('close'\)/)
})
