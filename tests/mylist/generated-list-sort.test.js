const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('generated media-source lists keep the sort entry enabled in the my-list menu', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/ListMenu.tsx')

  assert.match(file, /sort = !userList\.mediaSource\?\.readOnly \|\| !!userList\.mediaSource\?\.generated/)
  assert.doesNotMatch(file, /^\s*sort = !userList\.mediaSource\?\.readOnly\s*$/m)
})

test('generated list sort modal exposes update-time and file-name fields', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/ListMusicSort.tsx')
  const zhCn = readFile('src/lang/zh-cn.json')
  const enUs = readFile('src/lang/en-us.json')

  assert.match(file, /'update_time'/)
  assert.match(file, /'file_name'/)
  assert.match(zhCn, /"list_sort_modal_by_update_time": "更新时间"/)
  assert.match(zhCn, /"list_sort_modal_by_file_name": "文件名"/)
  assert.match(enUs, /"list_sort_modal_by_update_time": "Updated Time"/)
  assert.match(enUs, /"list_sort_modal_by_file_name": "File Name"/)
})

test('generated list sort modal removes random mode for generated media-source lists', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/ListMusicSort.tsx')

  assert.match(file, /fieldTypes\.filter\(item => item != 'random'\)/)
})
