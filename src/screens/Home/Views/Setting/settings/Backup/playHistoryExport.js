function padNum(num) {
  return num < 10 ? `0${num}` : `${num}`
}

function formatDateKey(timestamp) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${padNum(date.getMonth() + 1)}-${padNum(date.getDate())}`
}

function startOfDay(timestamp) {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function endOfDay(timestamp) {
  const date = new Date(timestamp)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

function parseDateInput(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(num => parseInt(num))
  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null
  return date.getTime()
}

function resolvePlayHistoryExportRange(selection = {}, now = Date.now()) {
  switch (selection.preset) {
    case 'all':
      return {
        preset: 'all',
        start: null,
        end: null,
      }
    case 'year': {
      const current = new Date(now)
      return {
        preset: 'year',
        start: new Date(current.getFullYear(), 0, 1, 0, 0, 0, 0).getTime(),
        end: new Date(current.getFullYear(), 11, 31, 23, 59, 59, 999).getTime(),
      }
    }
    case 'last30Days': {
      const currentDayStart = startOfDay(now)
      return {
        preset: 'last30Days',
        start: startOfDay(currentDayStart - 29 * 24 * 60 * 60 * 1000),
        end: endOfDay(now),
      }
    }
    case 'custom': {
      const start = parseDateInput(selection.startDate)
      if (start == null) throw new Error('invalid_start_date')
      const end = parseDateInput(selection.endDate)
      if (end == null) throw new Error('invalid_end_date')
      const range = {
        preset: 'custom',
        start: startOfDay(start),
        end: endOfDay(end),
      }
      if (range.end < range.start) throw new Error('invalid_date_range')
      return range
    }
    default:
      throw new Error('invalid_range_preset')
  }
}

function buildSongInfo(history, aggregateSongsMap, sourceItemsMap) {
  const aggregate = aggregateSongsMap.get(history.aggregateSongId) || {}
  const sourceItem = sourceItemsMap.get(history.sourceItemId) || sourceItemsMap.get(aggregate.preferredSourceItemId) || {}

  return {
    title: aggregate.canonicalTitle || '',
    artist: aggregate.canonicalArtist || '',
    album: aggregate.canonicalAlbum || '',
    canonicalDurationSec: Number(aggregate.canonicalDurationSec) || 0,
    providerType: sourceItem.providerType || aggregate.preferredSource || '',
    pathOrUri: sourceItem.pathOrUri || '',
    fileName: sourceItem.fileName || '',
  }
}

function buildPlayHistoryExportPayload({
  exportedAt = Date.now(),
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  range,
  playHistory = [],
  aggregateSongs = [],
  sourceItems = [],
}) {
  const aggregateSongsMap = new Map(aggregateSongs.map(item => [item.aggregateSongId, item]))
  const sourceItemsMap = new Map(sourceItems.map(item => [item.sourceItemId, item]))

  const items = playHistory
    .filter(item => {
      if (!range) return true
      if (range.start != null && item.startedAt < range.start) return false
      if (range.end != null && item.startedAt > range.end) return false
      return true
    })
    .map(item => ({
      aggregateSongId: item.aggregateSongId,
      sourceItemId: item.sourceItemId,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      listenedSec: item.listenedSec,
      durationSec: item.durationSec,
      countedPlay: item.countedPlay === true,
      completionRate: Number(item.completionRate) || 0,
      endReason: item.endReason || 'unknown',
      entrySource: item.entrySource || 'unknown',
      seekCount: Number(item.seekCount) || 0,
      seekForwardSec: Number(item.seekForwardSec) || 0,
      seekBackwardSec: Number(item.seekBackwardSec) || 0,
      startYear: Number(item.startYear) || 0,
      startMonth: Number(item.startMonth) || 0,
      startDay: Number(item.startDay) || 0,
      startDateKey: item.startDateKey || '',
      startWeekday: Number(item.startWeekday) || 0,
      startHour: Number(item.startHour) || 0,
      startSeason: item.startSeason || 'winter',
      startTimeBucket: item.startTimeBucket || 'late_night',
      nightOwningDateKey: item.nightOwningDateKey || '',
      nightSortMinute: Number(item.nightSortMinute) || 0,
      titleSnapshot: item.titleSnapshot || '',
      artistSnapshot: item.artistSnapshot || '',
      albumSnapshot: item.albumSnapshot || '',
      providerTypeSnapshot: item.providerTypeSnapshot || '',
      fileNameSnapshot: item.fileNameSnapshot || '',
      remotePathSnapshot: item.remotePathSnapshot || '',
      listIdSnapshot: item.listIdSnapshot ?? null,
      listTypeSnapshot: item.listTypeSnapshot || 'unknown',
      song: buildSongInfo(item, aggregateSongsMap, sourceItemsMap),
    }))

  return {
    type: 'playHistoryExport_v1',
    exportedAt,
    timezone,
    range: range ?? {
      preset: 'all',
      start: null,
      end: null,
    },
    count: items.length,
    items,
  }
}

function buildPlayHistoryExportFileName(range) {
  if (!range || range.preset === 'all' || range.start == null || range.end == null) return 'lx_play_history_all.json'
  return `lx_play_history_${formatDateKey(range.start)}_${formatDateKey(range.end)}.json`
}

module.exports = {
  buildPlayHistoryExportFileName,
  buildPlayHistoryExportPayload,
  formatDateKey,
  parseDateInput,
  resolvePlayHistoryExportRange,
}
