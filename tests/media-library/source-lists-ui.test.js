const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('我的列表菜单增加来源歌曲列表入口', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/ListMenu.tsx')
  assert.match(file, /sourceLists/)
})

test('来源歌曲列表页面文件存在', () => {
  assert.equal(fs.existsSync(path.resolve(__dirname, '../../src/screens/Home/Views/Mylist/SourceLists/index.tsx')), true)
})

test('LibraryMusicList 在 Task 7 之前避免直接点播未接入播放链路的远端来源', () => {
  const file = readFile('src/components/LibraryMusicList/index.tsx')
  assert.match(file, /musicInfo\.source\s*===\s*'local'/)
})

test('Task 6 来源歌曲列表骨架不直接承担连接创建与凭据保存', () => {
  const file = readFile('src/screens/Home/Views/Mylist/SourceLists/ConnectionList.tsx')
  assert.doesNotMatch(file, /saveConnections/)
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
