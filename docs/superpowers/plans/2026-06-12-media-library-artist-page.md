# 媒体库歌手页实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 从播放页点击歌手名进入独立媒体库歌手页，支持联名歌手选择、媒体库范围查询、播放全部和按歌手页队列播放。

**架构：** 先把歌手拆分/匹配和媒体库查询收敛成纯函数与轻量数据服务，再新增独立歌手页和导航注册，最后把竖屏/横屏播放页歌手文本接入统一入口。歌手页使用临时列表作为播放队列，避免改动播放器核心队列模型。

**技术栈：** React Native、React Native Navigation、TypeScript、Node.js `node:test`、现有媒体库 repository/list/player/i18n 工具。

---

## 基线与验证命令

- 当前 Windows + Node v24 环境下，`npm run test:media-library` 会把 `tests/media-library` 目录当作模块入口解析并失败，不能作为本轮可靠验证命令。
- 媒体库基线使用：`node --test tests/media-library/*.test.js`，当前基线结果为 314/314 通过。
- 本功能新增测试后，优先运行：
  - `node --test tests/media-library/artist-page.test.js`
  - `node --test tests/play-detail/artist-page-entry.test.js`
  - `node --test tests/media-library/*.test.js`
  - `node --test tests/play-detail/*.test.js`

## 文件结构

- 创建：`src/core/mediaLibrary/artistPage.js`
  - 纯函数与查询服务：歌手标准化、联名拆分、token/完整匹配、媒体库歌手查询、临时歌手列表 ID 构造。
  - 该文件使用 CommonJS，便于现有 Node 测试直接加载。

- 创建：`src/screens/ArtistPage/index.tsx`
  - 独立歌手页 UI：返回、歌手名、歌曲数量、播放全部、歌曲列表。
  - 页面内按导航参数查询媒体库，并在有结果时展示列表。

- 修改：`src/screens/index.ts`
  - 导出 `ArtistPage` 页面。

- 修改：`src/navigation/screenNames.ts`
  - 新增 `ARTIST_PAGE_SCREEN`。

- 修改：`src/navigation/registerScreens.tsx`
  - 注册 `ArtistPage` 页面。

- 修改：`src/navigation/navigation.ts`
  - 新增 `pushArtistPageScreen(componentId, params)`。

- 创建：`src/screens/PlayDetail/components/ArtistEntry.tsx`
  - 播放页歌手点击入口，封装无歌手 toast、联名歌手底部选择、查询命中检查和导航跳转。

- 修改：`src/screens/PlayDetail/Vertical/components/Header.tsx`
  - 竖屏 Header 使用 `ArtistEntry` 包装歌手名。

- 修改：`src/screens/PlayDetail/Horizontal/components/Header.tsx`
  - 横屏 Header 使用 `ArtistEntry` 包装歌手名。

- 修改：`src/lang/zh-cn.json`
  - 新增歌手页中文文案。

- 修改：`src/lang/zh-tw.json`
  - 新增歌手页繁中文案。

- 修改：`src/lang/en-us.json`
  - 新增歌手页英文文案。

- 创建：`tests/media-library/artist-page.test.js`
  - 覆盖拆分、匹配、查询顺序、重复保留和临时列表 ID。

- 创建：`tests/play-detail/artist-page-entry.test.js`
  - 结构测试覆盖导航注册、播放页入口、歌手页基本 UI 与 i18n key。

## 任务 1：歌手拆分、匹配与查询纯函数

**文件：**
- 创建：`tests/media-library/artist-page.test.js`
- 创建：`src/core/mediaLibrary/artistPage.js`

- [ ] **步骤 1：编写失败的纯函数测试**

在 `tests/media-library/artist-page.test.js` 写入：

```js
const assert = require('node:assert/strict')
const test = require('node:test')
const {
  ARTIST_PAGE_TEMP_LIST_ID,
  splitArtistNames,
  normalizeArtistName,
  isArtistMatch,
  findArtistSongs,
  buildArtistPageTempListId,
} = require('../../src/core/mediaLibrary/artistPage.js')

function music(id, singer, extra = {}) {
  return {
    id,
    name: extra.name || `歌曲 ${id}`,
    singer,
    source: extra.source || 'local',
    interval: extra.interval || '03:00',
    meta: extra.meta || { albumName: '' },
  }
}

test('splitArtistNames 清理空白、去重并按常见联名分隔符拆分', () => {
  assert.deepEqual(splitArtistNames(' 周杰伦 / 方文山 feat. 林俊杰 & 周杰伦 '), ['周杰伦', '方文山', '林俊杰'])
  assert.deepEqual(splitArtistNames('周杰伦，方文山、林俊杰; 阿信；五月天 ft. 怪兽 with 石头'), ['周杰伦', '方文山', '林俊杰', '阿信', '五月天', '怪兽', '石头'])
})

test('splitArtistNames 对单歌手和空歌手返回稳定结果', () => {
  assert.deepEqual(splitArtistNames(' 周杰伦 '), ['周杰伦'])
  assert.deepEqual(splitArtistNames('   '), [])
})

test('isArtistMatch token 精确命中联名歌手但不做包含误命中', () => {
  assert.equal(isArtistMatch('周杰伦', '周杰伦', 'token'), true)
  assert.equal(isArtistMatch('周杰伦 / 方文山', '周杰伦', 'token'), true)
  assert.equal(isArtistMatch('周杰伦 feat. 林俊杰', '周杰伦', 'token'), true)
  assert.equal(isArtistMatch('周杰伦乐队', '周杰伦', 'token'), false)
  assert.equal(isArtistMatch('周杰', '周杰伦', 'token'), false)
})

test('isArtistMatch exact 只匹配完整 singer 字段', () => {
  assert.equal(isArtistMatch('周杰伦 / 方文山', '周杰伦 / 方文山', 'exact'), true)
  assert.equal(isArtistMatch('周杰伦 / 方文山', '周杰伦', 'exact'), false)
})

test('findArtistSongs 保持输入顺序并保留重复来源歌曲', () => {
  const list = [
    music('1', '周杰伦'),
    music('2', '林俊杰'),
    music('3', '周杰伦 / 方文山', { source: 'webdav' }),
    music('4', '周杰伦', { source: 'smb' }),
  ]
  assert.deepEqual(findArtistSongs(list, { artistName: '周杰伦', matchMode: 'token' }).map(item => item.id), ['1', '3', '4'])
})

test('buildArtistPageTempListId 使用固定前缀和标准化歌手生成临时列表 ID', () => {
  assert.equal(ARTIST_PAGE_TEMP_LIST_ID, 'artist_page_temp')
  assert.equal(buildArtistPageTempListId(' 周杰伦 '), 'artist_page_temp__周杰伦')
  assert.equal(normalizeArtistName(' 周杰伦 '), '周杰伦')
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/media-library/artist-page.test.js`

预期：FAIL，报错包含 `Cannot find module '../../src/core/mediaLibrary/artistPage.js'`。

- [ ] **步骤 3：编写最少实现代码**

创建 `src/core/mediaLibrary/artistPage.js`：

```js
const ARTIST_PAGE_TEMP_LIST_ID = 'artist_page_temp'

const ARTIST_SPLIT_PATTERN = /\s*(?:、|\/|;|；|,|，|&|\bfeat\.\b|\bft\.\b|\bwith\b)\s*/i

function normalizeArtistName(value = '') {
  return String(value || '').trim()
}

function splitArtistNames(value = '') {
  const seen = new Set()
  const result = []
  for (const item of String(value || '').split(ARTIST_SPLIT_PATTERN)) {
    const artist = normalizeArtistName(item)
    if (!artist || seen.has(artist)) continue
    seen.add(artist)
    result.push(artist)
  }
  return result
}

function isArtistMatch(singer = '', artistName = '', matchMode = 'token') {
  const normalizedArtist = normalizeArtistName(artistName)
  if (!normalizedArtist) return false
  const normalizedSinger = normalizeArtistName(singer)
  if (!normalizedSinger) return false
  if (matchMode === 'exact') return normalizedSinger === normalizedArtist
  return splitArtistNames(normalizedSinger).includes(normalizedArtist)
}

function findArtistSongs(list = [], { artistName = '', matchMode = 'token' } = {}) {
  return Array.isArray(list)
    ? list.filter(musicInfo => isArtistMatch(musicInfo?.singer || '', artistName, matchMode))
    : []
}

function buildArtistPageTempListId(artistName = '') {
  return `${ARTIST_PAGE_TEMP_LIST_ID}__${normalizeArtistName(artistName)}`
}

module.exports = {
  ARTIST_PAGE_TEMP_LIST_ID,
  normalizeArtistName,
  splitArtistNames,
  isArtistMatch,
  findArtistSongs,
  buildArtistPageTempListId,
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test tests/media-library/artist-page.test.js`

预期：PASS，6 个测试通过。

- [ ] **步骤 5：Commit**

```bash
git add tests/media-library/artist-page.test.js src/core/mediaLibrary/artistPage.js
git commit -m "feat: 添加媒体库歌手匹配规则"
```

## 任务 2：媒体库歌手查询与临时队列播放服务

**文件：**
- 修改：`tests/media-library/artist-page.test.js`
- 修改：`src/core/mediaLibrary/artistPage.js`

- [ ] **步骤 1：编写失败的查询服务测试**

追加测试：

```js
test('loadArtistSongs 从 repository 聚合歌曲读取媒体库范围歌曲', async() => {
  const calls = []
  const repo = {
    async getAggregateSongs() {
      calls.push('getAggregateSongs')
      return [
        { aggregateSongId: 'agg_1', canonicalTitle: '七里香', canonicalArtist: '周杰伦', canonicalDurationSec: 300, preferredSource: 'local', preferredSourceItemId: 'item_1' },
        { aggregateSongId: 'agg_2', canonicalTitle: '江南', canonicalArtist: '林俊杰', canonicalDurationSec: 280, preferredSource: 'webdav', preferredSourceItemId: 'item_2' },
        { aggregateSongId: 'agg_3', canonicalTitle: '青花瓷', canonicalArtist: '周杰伦 / 方文山', canonicalDurationSec: 260, preferredSource: 'smb', preferredSourceItemId: 'item_3' },
      ]
    },
  }
  const { loadArtistSongs } = require('../../src/core/mediaLibrary/artistPage.js')
  const list = await loadArtistSongs({ repository: repo, artistName: '周杰伦', matchMode: 'token' })
  assert.deepEqual(calls, ['getAggregateSongs'])
  assert.deepEqual(list.map(item => item.id), ['agg_1', 'agg_3'])
})

test('playArtistSongs 用临时列表写入当前歌手列表并从指定位置播放', async() => {
  const calls = []
  const { playArtistSongs } = require('../../src/core/mediaLibrary/artistPage.js')
  await playArtistSongs({
    artistName: '周杰伦',
    songs: [music('1', '周杰伦'), music('2', '周杰伦')],
    index: 1,
    setTempList: async(listId, list) => calls.push(['setTempList', listId, list.map(item => item.id)]),
    playList: async(listId, index, options) => calls.push(['playList', listId, index, options]),
  })
  assert.deepEqual(calls, [
    ['setTempList', 'artist_page_temp__周杰伦', ['1', '2']],
    ['playList', 'temp', 1, { entrySource: 'media_library_artist_page' }],
  ])
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/media-library/artist-page.test.js`

预期：FAIL，报错包含 `loadArtistSongs is not a function` 或 `playArtistSongs is not a function`。

- [ ] **步骤 3：实现查询与播放服务**

在 `src/core/mediaLibrary/artistPage.js` 中增加：

```js
const { LIST_IDS } = require('../../config/constant.ts')
const { toMediaLibraryMusicInfo } = require('./sourceLists.js')

async function loadArtistSongs({ repository, artistName = '', matchMode = 'token' }) {
  const aggregateSongs = await repository.getAggregateSongs()
  return findArtistSongs((aggregateSongs || []).map(item => toMediaLibraryMusicInfo(item)), { artistName, matchMode })
}

async function playArtistSongs({ artistName = '', songs = [], index = 0, setTempList, playList }) {
  const listId = buildArtistPageTempListId(artistName)
  await setTempList(listId, [...songs])
  await playList(LIST_IDS.TEMP, index, { entrySource: 'media_library_artist_page' })
}
```

并导出 `loadArtistSongs`、`playArtistSongs`。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test tests/media-library/artist-page.test.js`

预期：PASS，8 个测试通过。

- [ ] **步骤 5：Commit**

```bash
git add tests/media-library/artist-page.test.js src/core/mediaLibrary/artistPage.js
git commit -m "feat: 添加媒体库歌手查询与播放服务"
```

## 任务 3：独立歌手页与导航注册

**文件：**
- 创建：`tests/play-detail/artist-page-entry.test.js`
- 创建：`src/screens/ArtistPage/index.tsx`
- 修改：`src/screens/index.ts`
- 修改：`src/navigation/screenNames.ts`
- 修改：`src/navigation/registerScreens.tsx`
- 修改：`src/navigation/navigation.ts`

- [ ] **步骤 1：编写失败的结构测试**

创建 `tests/play-detail/artist-page-entry.test.js`：

```js
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/play-detail/artist-page-entry.test.js`

预期：FAIL，缺少 `ARTIST_PAGE_SCREEN` 或 `ArtistPage/index.tsx`。

- [ ] **步骤 3：实现导航与歌手页页面**

实现：

- `screenNames.ts` 新增 `ARTIST_PAGE_SCREEN`。
- `screens/index.ts` 导出 `ArtistPage`。
- `registerScreens.tsx` import 并注册 `ARTIST_PAGE_SCREEN`。
- `navigation.ts` 新增 `pushArtistPageScreen(componentId, params)`。
- `src/screens/ArtistPage/index.tsx` 接收 `componentId`、`artistName`、`matchMode`、`sourceSinger`，调用 `loadArtistSongs`，展示页面并调用 `playArtistSongs`。

页面实现注意：

- 使用 `pop(componentId)` 返回。
- 使用 `useTheme()` 适配背景与文字颜色。
- 所有复杂逻辑加中文注释。
- `FlatList` 的 `keyExtractor` 用 `${item.id}_${index}`，避免重复来源 ID 冲突。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test tests/play-detail/artist-page-entry.test.js`

预期：PASS，2 个测试通过。

- [ ] **步骤 5：Commit**

```bash
git add tests/play-detail/artist-page-entry.test.js src/screens/ArtistPage/index.tsx src/screens/index.ts src/navigation/screenNames.ts src/navigation/registerScreens.tsx src/navigation/navigation.ts
git commit -m "feat: 新增媒体库歌手页"
```

## 任务 4：播放页歌手入口和联名选择

**文件：**
- 修改：`tests/play-detail/artist-page-entry.test.js`
- 创建：`src/screens/PlayDetail/components/ArtistEntry.tsx`
- 修改：`src/screens/PlayDetail/Vertical/components/Header.tsx`
- 修改：`src/screens/PlayDetail/Horizontal/components/Header.tsx`

- [ ] **步骤 1：编写失败的入口结构测试**

追加测试：

```js
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/play-detail/artist-page-entry.test.js`

预期：FAIL，缺少 `ArtistEntry`。

- [ ] **步骤 3：实现 ArtistEntry 与 Header 接入**

创建 `ArtistEntry.tsx`：

- 渲染可点击 singer 文本。
- singer 为空时 toast `artist_page_no_artist_info`。
- 单歌手直接查询；多歌手通过 React Native `ActionSheetIOS` 只支持 iOS，不适合跨平台，改用项目通用 `Menu` 或 `Modal` 实现底部选择面板。
- 第一版可以用现有 `confirmDialog` 不足以表达多选项，因此新增本组件内轻量 `Modal` + 列表按钮。
- 选择候选后调用 `loadArtistSongs` 做入口前命中检查；空结果 toast `artist_page_empty_in_library`；有结果再 `pushArtistPageScreen`。

修改两个 Header：

- import `ArtistEntry`。
- 用 `<ArtistEntry singer={musicInfo.singer} textStyle={styles.title} textColor={playDetailPalette.SECONDARY_TEXT} />` 替换原歌手 Text。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test tests/play-detail/artist-page-entry.test.js`

预期：PASS，4 个测试通过。

- [ ] **步骤 5：Commit**

```bash
git add tests/play-detail/artist-page-entry.test.js src/screens/PlayDetail/components/ArtistEntry.tsx src/screens/PlayDetail/Vertical/components/Header.tsx src/screens/PlayDetail/Horizontal/components/Header.tsx
git commit -m "feat: 播放页接入歌手页入口"
```

## 任务 5：文案、类型收口与全量验证

**文件：**
- 修改：`src/lang/zh-cn.json`
- 修改：`src/lang/zh-tw.json`
- 修改：`src/lang/en-us.json`
- 视验证结果必要时修改相关类型文件。

- [ ] **步骤 1：编写失败的 i18n 结构测试**

在 `tests/play-detail/artist-page-entry.test.js` 追加：

```js
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/play-detail/artist-page-entry.test.js`

预期：FAIL，缺少 `artist_page_*` key。

- [ ] **步骤 3：补齐文案与类型问题**

新增文案：

- `artist_page_song_count`
- `artist_page_play_all`
- `artist_page_choose_artist_title`
- `artist_page_exact_match_option`
- `artist_page_empty_in_library`
- `artist_page_no_artist_info`
- `artist_page_load_failed`

如 TypeScript 对 `media_library_artist_page` entrySource 报错，则在对应类型定义中加入该枚举值，并加中文注释说明来源用于歌手页队列播放统计。

- [ ] **步骤 4：运行目标测试验证通过**

运行：

```bash
node --test tests/media-library/artist-page.test.js
node --test tests/play-detail/artist-page-entry.test.js
```

预期：全部 PASS。

- [ ] **步骤 5：运行回归验证**

运行：

```bash
node --test tests/media-library/*.test.js
node --test tests/play-detail/*.test.js
npx tsc --noEmit
```

预期：测试全部 PASS；如果 `npx tsc --noEmit` 暴露仓库既有全局类型问题，记录具体错误并至少保证本轮新增文件没有相关错误。

- [ ] **步骤 6：Commit**

```bash
git add src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json tests/play-detail/artist-page-entry.test.js
git commit -m "feat: 补齐歌手页文案与验证"
```
