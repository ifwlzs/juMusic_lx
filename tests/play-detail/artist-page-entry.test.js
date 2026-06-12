const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('导航注册独立媒体库歌手页', () => {
  assert.match(read('src/navigation/screenNames.ts'), /ARTIST_PAGE_SCREEN\s*=\s*'lxm\.ArtistPageScreen'/)
  assert.match(read('src/navigation/registerScreens.tsx'), /ArtistPage/)
  assert.match(read('src/navigation/registerScreens.tsx'), /Navigation\.registerComponent\(ARTIST_PAGE_SCREEN/)
  assert.match(read('src/navigation/navigation.ts'), /pushArtistPageScreen/)
  assert.match(read('src/screens/index.ts'), /ArtistPage/)
})

test('歌手页包含标题、歌曲数量、播放全部和临时队列播放入口', () => {
  const file = read('src/screens/ArtistPage/index.tsx')
  assert.match(file, /artist_page_song_count/)
  assert.match(file, /artist_page_play_all/)
  assert.match(file, /loadArtistSongs/)
  assert.match(file, /playArtistSongs/)
  assert.match(file, /FlatList/)
})

test('播放页竖屏和横屏 Header 都接入 ArtistEntry', () => {
  assert.match(read('src/screens/PlayDetail/Vertical/components/Header.tsx'), /ArtistEntry/)
  assert.match(read('src/screens/PlayDetail/Horizontal/components/Header.tsx'), /ArtistEntry/)
})

test('ArtistEntry 负责联名歌手选择、无命中 toast 和进入歌手页', () => {
  const file = read('src/screens/PlayDetail/components/ArtistEntry.tsx')
  assert.match(file, /splitArtistNames/)
  assert.match(file, /artist_page_choose_artist_title/)
  assert.match(file, /artist_page_empty_in_library/)
  assert.match(file, /pushArtistPageScreen/)
  assert.match(file, /loadArtistSongs/)
})
