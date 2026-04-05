const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('mylist song rows use readable colors instead of washed-out grey helpers', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MusicList/ListItem.tsx')

  assert.match(file, /opacity: !isSupported \? 0\.5 : isUnavailable \? 0\.72 : 1/)
  assert.match(file, /<Text style=\{styles\.sn\} size=\{13\} color=\{theme\['c-font'\]\}>\{index \+ 1\}<\/Text>/)
  assert.match(file, /color=\{active \? theme\['c-primary-font'\] : theme\['c-font-label'\]\}/)
  assert.doesNotMatch(file, /theme\['c-300'\]/)
  assert.doesNotMatch(file, /theme\['c-500'\]/)
  assert.doesNotMatch(file, /theme\['c-250'\]/)
})

test('mylist sidebar list names stay normal for generated read-only lists', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/List.tsx')

  assert.match(file, /<Text numberOfLines=\{1\} color=\{active \? theme\['c-primary-font'\] : theme\['c-font'\]\}>\{item\.name\}<\/Text>/)
  assert.doesNotMatch(file, /mediaSource\?\.readOnly.*c-font-label/)
})
