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
