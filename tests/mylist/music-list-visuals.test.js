const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('mylist song rows use readable colors instead of washed-out grey helpers', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MusicList/ListItem.tsx')

  assert.match(file, /const apiSupported = useAssertApiSupport\(item\.source\)/)
  assert.match(file, /const isSupported = apiSupported \|\| !!mediaLibrary/)
  assert.match(file, /opacity: !isSupported \? 0\.5 : isUnavailable \? 0\.88 : 1/)
  assert.match(file, /<Text style=\{styles\.sn\} size=\{13\} color=\{theme\['c-font'\]\}>\{index \+ 1\}<\/Text>/)
  assert.match(file, /color=\{active \? theme\['c-primary-font'\] : theme\['c-font'\]\}/)
  assert.match(file, /const sourceBadgeType = mediaLibrary\?\.providerType === 'webdav' \? 'secondary' : mediaLibrary\?\.providerType === 'smb' \? 'tertiary' : 'normal'/)
  assert.match(file, /<Badge type=\{sourceBadgeType\}>\{sourceBadge\}<\/Badge>/)
  assert.match(file, /<Icon name="dots-vertical" style=\{\{ color: theme\['c-font'\] \}\} size=\{12\} \/>/)
  assert.doesNotMatch(file, /theme\['c-font-label'\]/)
  assert.doesNotMatch(file, /theme\['c-300'\]/)
  assert.doesNotMatch(file, /theme\['c-500'\]/)
  assert.doesNotMatch(file, /theme\['c-250'\]/)
  assert.doesNotMatch(file, /theme\['c-350'\]/)
})

test('mylist sidebar list names stay normal for generated read-only lists', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/List.tsx')

  assert.match(file, /<Text numberOfLines=\{1\} color=\{active \? theme\['c-primary-font'\] : theme\['c-font'\]\}>\{item\.name\}<\/Text>/)
  assert.match(file, /<Icon name="dots-vertical" color=\{theme\['c-font'\]\} size=\{12\} \/>/)
  assert.doesNotMatch(file, /mediaSource\?\.readOnly.*c-font-label/)
  assert.doesNotMatch(file, /theme\['c-350'\]/)
})

test('source badges use stronger pill styling so remote provider labels stay readable', () => {
  const file = readFile('src/components/common/Badge.tsx')

  assert.match(file, /borderRadius:\s*999/)
  assert.match(file, /borderWidth:\s*1/)
  assert.match(file, /paddingHorizontal:\s*4/)
  assert.match(file, /paddingVertical:\s*1/)
  assert.match(file, /fontWeight:\s*'600'/)
})

test('generated playlist detail header and source search rows use dark body text instead of gray helper text', () => {
  const headerFile = readFile('src/screens/SonglistDetail/Header.tsx')
  const searchFile = readFile('src/screens/Home/Views/Mylist/MusicList/ListMusicSearch.tsx')

  assert.match(headerFile, /<Text size=\{13\} color=\{theme\['c-font'\]\} numberOfLines=\{ 4 \}>\{detailInfo\.desc\}<\/Text>/)
  assert.doesNotMatch(headerFile, /theme\['c-font-label'\]/)
  assert.doesNotMatch(searchFile, /theme\['c-font-label'\]/)
})
