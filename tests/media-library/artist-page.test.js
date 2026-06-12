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
