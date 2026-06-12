const ARTIST_PAGE_TEMP_LIST_ID = 'artist_page_temp'
const PLAYER_TEMP_LIST_ID = 'temp'

const { toMediaLibraryMusicInfo } = require('./sourceLists.js')

// 统一维护歌手联名分隔符，保证播放页入口和媒体库查询使用同一套拆分口径。
const ARTIST_SPLIT_PATTERN = /\s*(?:、|\/|;|；|,|，|&|\bfeat\.?\s*|\bft\.?\s*|\bwith\s*)/i

/**
 * 标准化歌手名，仅裁剪空白，避免破坏艺名。
 * @param {string} [value]
 * @returns {string}
 */
function normalizeArtistName(value = '') {
  // 只裁剪首尾空白，避免破坏用户原始艺名中的有效字符。
  return String(value || '').trim()
}

/**
 * 按常见联名分隔符拆分歌手名，并保持首次出现顺序。
 * @param {string} [value]
 * @returns {string[]}
 */
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

/**
 * 判断媒体库歌曲歌手字段是否匹配目标歌手。
 * @param {string} [singer]
 * @param {string} [artistName]
 * @param {'token' | 'exact'} [matchMode]
 * @returns {boolean}
 */
function isArtistMatch(singer = '', artistName = '', matchMode = 'token') {
  const normalizedArtist = normalizeArtistName(artistName)
  if (!normalizedArtist) return false
  const normalizedSinger = normalizeArtistName(singer)
  if (!normalizedSinger) return false
  if (matchMode === 'exact') return normalizedSinger === normalizedArtist
  // token 模式先拆分联名歌手，再做全等匹配，避免包含匹配误伤相似艺名。
  return splitArtistNames(normalizedSinger).includes(normalizedArtist)
}

/**
 * 从歌曲列表中过滤目标歌手歌曲，保留输入顺序和重复来源。
 * @param {LX.Music.MusicInfo[]} [list]
 * @param {{ artistName?: string, matchMode?: 'token' | 'exact' }} [options]
 * @returns {LX.Music.MusicInfo[]}
 */
function findArtistSongs(list = [], { artistName = '', matchMode = 'token' } = {}) {
  return Array.isArray(list)
    ? list.filter(musicInfo => isArtistMatch(musicInfo?.singer || '', artistName, matchMode))
    : []
}

/**
 * 构造歌手页临时播放列表 ID，用于播放器复用临时队列。
 * @param {string} [artistName]
 * @returns {string}
 */
function buildArtistPageTempListId(artistName = '') {
  return `${ARTIST_PAGE_TEMP_LIST_ID}__${normalizeArtistName(artistName)}`
}

/**
 * 从媒体库源歌曲视图加载目标歌手歌曲。
 * @param {{ repository?: { getConnections?: () => Promise<Array<{ connectionId: string }>>, getAllSourceItems?: (connectionIds: string[]) => Promise<LX.MediaLibrary.SourceItem[]> }, artistName?: string, matchMode?: 'token' | 'exact' }} [options]
 * @returns {Promise<LX.Music.MusicInfo[]>}
 */
async function loadArtistSongs({ repository, artistName = '', matchMode = 'token' } = {}) {
  if (!repository || typeof repository.getConnections !== 'function' || typeof repository.getAllSourceItems !== 'function') return []
  const connections = await repository.getConnections()
  const connectionIds = (connections || []).map(item => item.connectionId).filter(Boolean)
  if (!connectionIds.length) return []
  const sourceItems = await repository.getAllSourceItems(connectionIds)
  // 歌手页按源歌曲视图查询，保留本地、WebDAV、SMB、OneDrive 等不同来源里的重复歌曲。
  return findArtistSongs((sourceItems || []).map(item => toMediaLibraryMusicInfo(item)), { artistName, matchMode })
}

/**
 * 把当前歌手页列表写入临时队列并从指定位置开始播放。
 * @param {{ artistName?: string, songs?: LX.Music.MusicInfo[], index?: number, setTempList: (id: string, list: LX.Music.MusicInfo[]) => Promise<void>, playList: (listId: string, index: number, options: { entrySource: LX.MediaLibrary.PlaybackEntrySource }) => Promise<void> }} options
 * @returns {Promise<void>}
 */
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
