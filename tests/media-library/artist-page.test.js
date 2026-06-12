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
