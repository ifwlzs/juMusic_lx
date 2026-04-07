const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  getSearchSources,
  rankAggregatedResults,
  searchLibrarySongs,
} = require('../../src/core/mediaLibrary/searchRegistry.js')

test('综合搜索来源顺序为 本地 WebDAV SMB OneDrive 在线源 all', () => {
  assert.deepEqual(
    getSearchSources(['kw', 'wy']),
    ['local', 'webdav', 'smb', 'onedrive', 'kw', 'wy', 'all'],
  )
})

test('综合搜索结果优先返回个人曲库来源', () => {
  const ranked = rankAggregatedResults([
    { source: 'kw', id: 'online_1' },
    { source: 'onedrive', id: 'onedrive_1' },
    { source: 'webdav', id: 'dav_1' },
    { source: 'local', id: 'local_1' },
  ])

  assert.deepEqual(ranked.map(item => item.id), ['local_1', 'dav_1', 'onedrive_1', 'online_1'])
})

test('综合搜索只命中本地索引并保持个人曲库优先顺序', () => {
  const result = searchLibrarySongs({
    keyword: '七里香',
    source: 'all',
    aggregateSongs: [
      {
        id: 'kw_1',
        name: '七里香',
        singer: '周杰伦',
        source: 'kw',
        meta: { albumName: '七里香' },
      },
      {
        id: 'local_1',
        name: '七里香',
        singer: '周杰伦',
        source: 'local',
        meta: { albumName: '七里香' },
      },
      {
        id: 'dav_1',
        name: '七里香',
        singer: '周杰伦',
        source: 'webdav',
        meta: { albumName: '七里香' },
      },
      {
        id: 'onedrive_1',
        name: '七里香',
        singer: '周杰伦',
        source: 'onedrive',
        meta: { albumName: '七里香' },
      },
    ],
    sourceItems: [],
  })

  assert.equal(result.source, 'all')
  assert.deepEqual(result.list.map(item => item.id), ['local_1', 'dav_1', 'onedrive_1', 'kw_1'])
})

test('指定来源搜索只返回对应 provider 的文件项', () => {
  const result = searchLibrarySongs({
    keyword: '夜曲',
    source: 'smb',
    aggregateSongs: [],
    sourceItems: [
      {
        id: 'local_1',
        name: '夜曲',
        singer: '周杰伦',
        source: 'local',
        meta: { albumName: '十一月的萧邦' },
      },
      {
        id: 'smb_1',
        name: '夜曲',
        singer: '周杰伦',
        source: 'smb',
        meta: { albumName: '十一月的萧邦' },
      },
    ],
  })

  assert.equal(result.source, 'smb')
  assert.deepEqual(result.list.map(item => item.id), ['smb_1'])
})

test('搜索状态文件包含本地和远端文件源标签', () => {
  const commonTypes = fs.readFileSync(path.resolve(__dirname, '../../src/types/common.d.ts'), 'utf8')
  const content = fs.readFileSync(path.resolve(__dirname, '../../src/store/search/music/state.ts'), 'utf8')
  assert.match(commonTypes, /type Source = OnlineSource \| 'local' \| 'webdav' \| 'smb' \| 'onedrive'/)
  assert.match(content, /local/)
  assert.match(content, /webdav/)
  assert.match(content, /smb/)
  assert.match(content, /onedrive/)
})

test('搜索列表页为文件源和 all 使用 LibraryMusicList 组件', () => {
  const content = fs.readFileSync(path.resolve(__dirname, '../../src/screens/Home/Views/Search/List.tsx'), 'utf8')
  const actionContent = fs.readFileSync(path.resolve(__dirname, '../../src/store/search/music/action.ts'), 'utf8')
  assert.match(content, /LibraryMusicList/)
  assert.match(content, /local/)
  assert.match(content, /webdav/)
  assert.match(content, /smb/)
  assert.match(content, /onedrive/)
  assert.match(content, /all/)
  assert.match(actionContent, /case 'onedrive': return 3/)
  assert.match(actionContent, /item\.source == 'onedrive'/)
})

test('搜索页存在个人曲库结果列表组件文件', () => {
  const filePath = path.resolve(__dirname, '../../src/screens/Home/Views/Search/LibraryMusicList.tsx')
  assert.equal(fs.existsSync(filePath), true)
})
