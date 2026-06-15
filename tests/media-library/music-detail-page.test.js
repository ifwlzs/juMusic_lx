const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('媒体库歌曲详情独立页完成导航注册', () => {
  assert.match(read('src/navigation/screenNames.ts'), /MUSIC_DETAIL_SCREEN\s*=\s*'lxm\.MusicDetailScreen'/)
  assert.match(read('src/navigation/registerScreens.tsx'), /MusicDetailPage/)
  assert.match(read('src/navigation/registerScreens.tsx'), /Navigation\.registerComponent\(MUSIC_DETAIL_SCREEN/)
  assert.match(read('src/navigation/navigation.ts'), /pushMusicDetailScreen/)
  assert.match(read('src/navigation/navigation.ts'), /name:\s*MUSIC_DETAIL_SCREEN/)
  assert.match(read('src/navigation/navigation.ts'), /passProps:\s*params/)
  assert.match(read('src/screens/index.ts'), /MusicDetailPage/)
})

test('媒体库歌曲详情独立页复用详情模型复制动作和安全区 Header', () => {
  const file = read('src/screens/MusicDetailPage/index.tsx')
  assert.match(file, /buildMusicDetailSections/)
  assert.match(file, /getMusicDetailCopyActions/)
  assert.match(file, /buildMusicDetailCopyText/)
  assert.match(file, /clipboardWriteText/)
  assert.match(file, /ScrollView/)
  assert.match(file, /useStatusbarHeight/)
  assert.match(file, /height:\s*HEADER_HEIGHT\s*\+\s*statusBarHeight/)
  assert.match(file, /paddingTop:\s*statusBarHeight/)
})

test('媒体库歌曲详情独立页接入歌手入口并从当前页面压栈歌手页', () => {
  const file = read('src/screens/MusicDetailPage/index.tsx')
  assert.match(file, /ArtistEntry/)
  assert.match(file, /componentId=\{componentId\}/)
  assert.match(file, /singer=\{musicInfo\.singer\}/)
})

test('我的列表内部详情目标改为 push 独立详情页且在线音源仍走外链', () => {
  const file = read('src/screens/Home/Views/Mylist/MusicList/index.tsx')
  assert.match(file, /pushMusicDetailScreen/)
  assert.match(file, /isInternalMusicDetailTarget\(info\.musicInfo\)/)
  assert.match(file, /pushMusicDetailScreen\([^,]+,\s*\{[\s\S]*musicInfo:\s*info\.musicInfo[\s\S]*sourceListId:\s*info\.listId/)
  assert.match(file, /handleShowMusicSourceDetail\(info\.musicInfo\)/)
  assert.doesNotMatch(file, /musicDetailModalRef\.current\?\.show\(info\.musicInfo\)/)
})

test('媒体库歌曲详情独立页复制动作会写剪贴板并复用现有 toast', () => {
  const file = read('src/screens/MusicDetailPage/index.tsx')
  assert.match(file, /const\s+handleCopy\s*=\s*useCallback/)
  assert.match(file, /buildMusicDetailCopyText\(action\.key,\s*musicInfo\)/)
  assert.match(file, /clipboardWriteText\(text\)/)
  assert.match(file, /toast\(t\('copy_name_tip'\)\)/)
  assert.match(file, /onPress=\{\(\)\s*=>\s*\{\s*handleCopy\(action\)\s*\}\}/)
})

test('媒体库歌曲详情独立页会翻译详情模型中的 i18n 值而不是裸露 key', () => {
  const file = read('src/screens/MusicDetailPage/index.tsx')
  assert.match(file, /isTranslateValueKey/)
  assert.match(file, /value\.startsWith\('music_detail_'\)/)
  assert.match(file, /value\.startsWith\('source_real_'\)/)
  assert.match(file, /isTranslateValueKey\(item\.value\)\s*\?\s*t\(item\.value\)\s*:\s*item\.value/)
})
