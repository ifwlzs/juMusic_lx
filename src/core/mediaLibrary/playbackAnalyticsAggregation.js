const {
  computePlaybackTimeFacts,
  normalizeArtistEntityKey,
  normalizeAlbumEntityKey,
} = require('./playbackAnalyticsFacts.js')

function createEmptyPlaybackAnalyticsCaches() {
  return {
    yearSummary: new Map(),
    yearTimeStats: new Map(),
    yearEntityStats: new Map(),
    lifetimeEntityIndex: {
      songFirstSeen: {},
      artistFirstSeen: {},
      albumFirstSeen: {},
    },
  }
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function incrementCounter(bucket, key, amount = 1) {
  if (!key) return
  bucket[key] = (toNumber(bucket[key], 0) || 0) + amount
}

function addUniqueValue(list, value) {
  if (!value) return
  if (!Array.isArray(list)) return
  if (!list.includes(value)) list.push(value)
}

function ensureYearSummary(caches, year) {
  if (!caches.yearSummary.has(year)) {
    caches.yearSummary.set(year, {
      year,
      totalSessions: 0,
      totalListenedSec: 0,
      countedPlayCount: 0,
      activeDateKeys: [],
      activeDaysCount: 0,
      distinctSongs: 0,
      distinctArtists: 0,
      distinctAlbums: 0,
    })
  }
  return caches.yearSummary.get(year)
}

function ensureYearTimeStats(caches, year) {
  if (!caches.yearTimeStats.has(year)) {
    caches.yearTimeStats.set(year, {
      year,
      monthSessions: {},
      weekdaySessions: {},
      hourSessions: {},
      seasonSessions: {},
      timeBucketSessions: {},
      nightSessions: {},
    })
  }
  return caches.yearTimeStats.get(year)
}

function ensureYearEntityStats(caches, year) {
  if (!caches.yearEntityStats.has(year)) {
    caches.yearEntityStats.set(year, {
      year,
      songs: {},
      artists: {},
      albums: {},
    })
  }
  return caches.yearEntityStats.get(year)
}

function ensureEntityItem(bucket, key, defaults = {}) {
  if (!key) return null
  if (!bucket[key]) {
    bucket[key] = {
      key,
      sessions: 0,
      countedPlayCount: 0,
      listenedSec: 0,
      activeDateKeys: [],
      firstStartedAt: 0,
      lastStartedAt: 0,
      ...defaults,
    }
  }
  return bucket[key]
}

function updateEntityItem(item, {
  startedAt,
  listenedSec,
  countedPlay,
  dateKey,
  titleSnapshot,
  artistSnapshot,
  albumSnapshot,
}) {
  if (!item) return
  item.sessions = (toNumber(item.sessions, 0) || 0) + 1
  item.countedPlayCount = (toNumber(item.countedPlayCount, 0) || 0) + (countedPlay ? 1 : 0)
  item.listenedSec = (toNumber(item.listenedSec, 0) || 0) + (toNumber(listenedSec, 0) || 0)
  addUniqueValue(item.activeDateKeys, dateKey)
  if (!item.firstStartedAt || startedAt < item.firstStartedAt) item.firstStartedAt = startedAt
  if (!item.lastStartedAt || startedAt > item.lastStartedAt) item.lastStartedAt = startedAt

  if (titleSnapshot) item.titleSnapshot = titleSnapshot
  if (artistSnapshot) item.artistSnapshot = artistSnapshot
  if (albumSnapshot) item.albumSnapshot = albumSnapshot
}

function updateFirstSeen(indexBucket, key, {
  firstYear,
  firstStartedAt,
  firstDateKey,
}) {
  if (!key) return
  const prev = indexBucket[key]
  if (!prev || !prev.firstStartedAt || firstStartedAt < prev.firstStartedAt) {
    indexBucket[key] = {
      firstYear,
      firstStartedAt,
      firstDateKey,
    }
  }
}

function normalizeEntryForAggregation(entry = {}) {
  const startedAt = toNumber(entry.startedAt, 0)
  const fallbackFacts = computePlaybackTimeFacts(startedAt)
  return {
    aggregateSongId: entry.aggregateSongId || '',
    sourceItemId: entry.sourceItemId || '',
    startedAt,
    listenedSec: toNumber(entry.listenedSec, 0),
    countedPlay: entry.countedPlay === true,
    startYear: toNumber(entry.startYear, 0) || fallbackFacts.startYear,
    startMonth: toNumber(entry.startMonth, 0) || fallbackFacts.startMonth,
    startDateKey: entry.startDateKey || fallbackFacts.startDateKey,
    startWeekday: toNumber(entry.startWeekday, 0) || fallbackFacts.startWeekday,
    startHour: toNumber(entry.startHour, 0) || fallbackFacts.startHour,
    startSeason: entry.startSeason || fallbackFacts.startSeason,
    startTimeBucket: entry.startTimeBucket || fallbackFacts.startTimeBucket,
    nightOwningDateKey: entry.nightOwningDateKey || fallbackFacts.nightOwningDateKey,
    titleSnapshot: entry.titleSnapshot || '',
    artistSnapshot: entry.artistSnapshot || '',
    albumSnapshot: entry.albumSnapshot || '',
  }
}

function applyPlayHistoryEntryToCaches(caches, entry = {}) {
  const normalized = normalizeEntryForAggregation(entry)
  const year = normalized.startYear
  if (!year) return caches

  const yearSummary = ensureYearSummary(caches, year)
  const yearTimeStats = ensureYearTimeStats(caches, year)
  const yearEntityStats = ensureYearEntityStats(caches, year)

  yearSummary.totalSessions += 1
  yearSummary.totalListenedSec = (toNumber(yearSummary.totalListenedSec, 0) || 0) + normalized.listenedSec
  yearSummary.countedPlayCount = (toNumber(yearSummary.countedPlayCount, 0) || 0) + (normalized.countedPlay ? 1 : 0)
  addUniqueValue(yearSummary.activeDateKeys, normalized.startDateKey)
  yearSummary.activeDaysCount = yearSummary.activeDateKeys.length

  incrementCounter(yearTimeStats.monthSessions, String(normalized.startMonth))
  incrementCounter(yearTimeStats.weekdaySessions, String(normalized.startWeekday))
  incrementCounter(yearTimeStats.hourSessions, String(normalized.startHour))
  incrementCounter(yearTimeStats.seasonSessions, String(normalized.startSeason))
  incrementCounter(yearTimeStats.timeBucketSessions, String(normalized.startTimeBucket))
  incrementCounter(yearTimeStats.nightSessions, String(normalized.nightOwningDateKey))

  const songKey = normalized.aggregateSongId || normalized.sourceItemId
  const artistKey = normalizeArtistEntityKey(normalized.artistSnapshot)
  const albumKey = normalizeAlbumEntityKey(normalized.artistSnapshot, normalized.albumSnapshot)

  const songStats = ensureEntityItem(yearEntityStats.songs, songKey, {
    titleSnapshot: normalized.titleSnapshot,
    artistSnapshot: normalized.artistSnapshot,
    albumSnapshot: normalized.albumSnapshot,
  })
  updateEntityItem(songStats, {
    startedAt: normalized.startedAt,
    listenedSec: normalized.listenedSec,
    countedPlay: normalized.countedPlay,
    dateKey: normalized.startDateKey,
    titleSnapshot: normalized.titleSnapshot,
    artistSnapshot: normalized.artistSnapshot,
    albumSnapshot: normalized.albumSnapshot,
  })

  const artistStats = ensureEntityItem(yearEntityStats.artists, artistKey, {
    artistSnapshot: normalized.artistSnapshot,
  })
  updateEntityItem(artistStats, {
    startedAt: normalized.startedAt,
    listenedSec: normalized.listenedSec,
    countedPlay: normalized.countedPlay,
    dateKey: normalized.startDateKey,
    artistSnapshot: normalized.artistSnapshot,
  })

  const albumStats = ensureEntityItem(yearEntityStats.albums, albumKey, {
    artistSnapshot: normalized.artistSnapshot,
    albumSnapshot: normalized.albumSnapshot,
  })
  updateEntityItem(albumStats, {
    startedAt: normalized.startedAt,
    listenedSec: normalized.listenedSec,
    countedPlay: normalized.countedPlay,
    dateKey: normalized.startDateKey,
    artistSnapshot: normalized.artistSnapshot,
    albumSnapshot: normalized.albumSnapshot,
  })

  yearSummary.distinctSongs = Object.keys(yearEntityStats.songs).length
  yearSummary.distinctArtists = Object.keys(yearEntityStats.artists).length
  yearSummary.distinctAlbums = Object.keys(yearEntityStats.albums).length

  updateFirstSeen(caches.lifetimeEntityIndex.songFirstSeen, songKey, {
    firstYear: year,
    firstStartedAt: normalized.startedAt,
    firstDateKey: normalized.startDateKey,
  })
  updateFirstSeen(caches.lifetimeEntityIndex.artistFirstSeen, artistKey, {
    firstYear: year,
    firstStartedAt: normalized.startedAt,
    firstDateKey: normalized.startDateKey,
  })
  updateFirstSeen(caches.lifetimeEntityIndex.albumFirstSeen, albumKey, {
    firstYear: year,
    firstStartedAt: normalized.startedAt,
    firstDateKey: normalized.startDateKey,
  })

  return caches
}

function rebuildPlaybackAnalyticsCaches({
  playHistory = [],
  aggregateSongs = [],
  sourceItems = [],
} = {}) {
  const caches = createEmptyPlaybackAnalyticsCaches()
  const aggregateMap = new Map(aggregateSongs.map(item => [item.aggregateSongId, item]))
  const sourceMap = new Map(sourceItems.map(item => [item.sourceItemId, item]))

  for (const entry of playHistory) {
    const aggregateSong = aggregateMap.get(entry.aggregateSongId) || null
    const sourceItem = sourceMap.get(entry.sourceItemId || aggregateSong?.preferredSourceItemId) || null
    const withBestEffort = {
      ...entry,
      titleSnapshot: entry.titleSnapshot || aggregateSong?.canonicalTitle || '',
      artistSnapshot: entry.artistSnapshot || aggregateSong?.canonicalArtist || '',
      albumSnapshot: entry.albumSnapshot || aggregateSong?.canonicalAlbum || '',
      providerTypeSnapshot: entry.providerTypeSnapshot || sourceItem?.providerType || '',
      fileNameSnapshot: entry.fileNameSnapshot || sourceItem?.fileName || '',
      remotePathSnapshot: entry.remotePathSnapshot || sourceItem?.pathOrUri || '',
    }
    applyPlayHistoryEntryToCaches(caches, withBestEffort)
  }

  return caches
}

module.exports = {
  createEmptyPlaybackAnalyticsCaches,
  applyPlayHistoryEntryToCaches,
  rebuildPlaybackAnalyticsCaches,
}
