function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function resolvePlaybackTimeBucket(hour) {
  const normalized = Number(hour)
  if (normalized <= 5) return 'late_night'
  if (normalized <= 10) return 'morning'
  if (normalized <= 13) return 'noon'
  if (normalized <= 17) return 'afternoon'
  if (normalized <= 21) return 'evening'
  return 'night'
}

function resolvePlaybackSeason(month) {
  const normalized = Number(month)
  if (normalized >= 3 && normalized <= 5) return 'spring'
  if (normalized >= 6 && normalized <= 8) return 'summer'
  if (normalized >= 9 && normalized <= 11) return 'autumn'
  return 'winter'
}

function resolveNightOwningDateKey(ts) {
  const date = new Date(ts)
  if (date.getHours() < 6) date.setDate(date.getDate() - 1)
  return formatDateKey(date)
}

function resolveNightSortMinute(ts) {
  const date = new Date(ts)
  const minute = date.getHours() * 60 + date.getMinutes()
  return date.getHours() < 6 ? 1440 + minute : minute
}

function clampCompletionRate(listenedSec, durationSec) {
  const duration = Number(durationSec) || 0
  if (duration <= 0) return 0
  return Math.min(1, Math.max(0, (Number(listenedSec) || 0) / duration))
}

function computePlaybackTimeFacts(startedAt) {
  const date = new Date(startedAt)
  const weekday = date.getDay()
  return {
    startYear: date.getFullYear(),
    startMonth: date.getMonth() + 1,
    startDay: date.getDate(),
    startDateKey: formatDateKey(date),
    startWeekday: weekday === 0 ? 7 : weekday,
    startHour: date.getHours(),
    startSeason: resolvePlaybackSeason(date.getMonth() + 1),
    startTimeBucket: resolvePlaybackTimeBucket(date.getHours()),
    nightOwningDateKey: resolveNightOwningDateKey(startedAt),
    nightSortMinute: resolveNightSortMinute(startedAt),
  }
}

function resolvePlaybackListType({
  listId,
  isTempPlay,
  entrySource,
  isGeneratedMedia,
  isUserList,
} = {}) {
  if (entrySource === 'search') return 'search'
  if (isTempPlay || listId === 'temp') return 'temp'
  if (listId === 'default') return 'default'
  if (listId === 'love') return 'love'
  if (isGeneratedMedia) return 'generated_media'
  if (isUserList) return 'user'
  return 'unknown'
}

function normalizeArtistEntityKey(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAlbumEntityKey(artist, album) {
  return `${normalizeArtistEntityKey(artist)}::${String(album || '').trim().toLowerCase()}`
}

module.exports = {
  computePlaybackTimeFacts,
  resolvePlaybackTimeBucket,
  resolvePlaybackSeason,
  resolveNightOwningDateKey,
  resolveNightSortMinute,
  clampCompletionRate,
  resolvePlaybackListType,
  normalizeArtistEntityKey,
  normalizeAlbumEntityKey,
}
