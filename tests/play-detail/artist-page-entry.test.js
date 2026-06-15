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

test('歌手页头部避让异形屏状态栏安全区', () => {
  const file = read('src/screens/ArtistPage/index.tsx')
  assert.match(file, /useStatusbarHeight/)
  assert.match(file, /const\s+statusBarHeight\s*=\s*useStatusbarHeight\(\)/)
  assert.match(file, /height:\s*HEADER_HEIGHT\s*\+\s*statusBarHeight/)
  assert.match(file, /paddingTop:\s*statusBarHeight/)
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
  assert.match(file, /componentId\?:\s*string/)
  assert.match(file, /componentId\s*\?\?\s*commonState\.componentIds\.playDetail/)
})

test('歌手页文案 key 覆盖三种语言', () => {
  for (const lang of ['zh-cn', 'zh-tw', 'en-us']) {
    const json = JSON.parse(read(`src/lang/${lang}.json`))
    for (const key of [
      'artist_page_song_count',
      'artist_page_play_all',
      'artist_page_choose_artist_title',
      'artist_page_exact_match_option',
      'artist_page_empty_in_library',
      'artist_page_no_artist_info',
      'artist_page_load_failed',
    ]) {
      assert.ok(json[key], `${lang} missing ${key}`)
    }
  }
})
