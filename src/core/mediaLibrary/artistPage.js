const ARTIST_PAGE_TEMP_LIST_ID = 'artist_page_temp'

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

module.exports = {
  ARTIST_PAGE_TEMP_LIST_ID,
  normalizeArtistName,
  splitArtistNames,
  isArtistMatch,
  findArtistSongs,
  buildArtistPageTempListId,
}


