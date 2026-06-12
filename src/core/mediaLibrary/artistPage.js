const ARTIST_PAGE_TEMP_LIST_ID = 'artist_page_temp'
const PLAYER_TEMP_LIST_ID = 'temp'

const { toMediaLibraryMusicInfo } = require('./sourceLists.js')

// 统一维护歌手联名分隔符，保证播放页入口和媒体库查询使用同一套拆分口径。
const ARTIST_SPLIT_PATTERN = /\s*(?:、|\/|;|；|,|，|&|\bfeat\.?\s*|\bft\.?\s*|\bwith\s*)/i

function normalizeArtistName(value = '') {
  // 只裁剪首尾空白，避免破坏用户原始艺名中的有效字符。
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
  // token 模式先拆分联名歌手，再做全等匹配，避免包含匹配误伤相似艺名。
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

async function loadArtistSongs({ repository, artistName = '', matchMode = 'token' } = {}) {
  if (!repository || typeof repository.getAggregateSongs !== 'function') return []
  const aggregateSongs = await repository.getAggregateSongs()
  // 歌手页第一版使用聚合后的总曲库视图，保证查询范围覆盖本地和远端媒体库。
  return findArtistSongs((aggregateSongs || []).map(item => toMediaLibraryMusicInfo(item)), { artistName, matchMode })
}

async function playArtistSongs({ artistName = '', songs = [], index = 0, setTempList, playList } = {}) {
  const listId = buildArtistPageTempListId(artistName)
  // 播放器已有临时列表模型，歌手页复用它来形成独立播放队列，不污染默认收藏等用户列表。
  await setTempList(listId, [...songs])
  await playList(PLAYER_TEMP_LIST_ID, index, { entrySource: 'media_library_artist_page' })
}

module.exports = {
  ARTIST_PAGE_TEMP_LIST_ID,
  normalizeArtistName,
  splitArtistNames,
  isArtistMatch,
  findArtistSongs,
  buildArtistPageTempListId,
  loadArtistSongs,
  playArtistSongs,
}
