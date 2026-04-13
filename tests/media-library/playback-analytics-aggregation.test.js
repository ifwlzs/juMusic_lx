const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createEmptyPlaybackAnalyticsCaches,
  applyPlayHistoryEntryToCaches,
  rebuildPlaybackAnalyticsCaches,
} = require('../../src/core/mediaLibrary/playbackAnalyticsAggregation.js')

test('applyPlayHistoryEntryToCaches updates summary and first-seen index', () => {
  const caches = createEmptyPlaybackAnalyticsCaches()
  applyPlayHistoryEntryToCaches(caches, {
    aggregateSongId: 'agg_1',
    startedAt: new Date(2026, 0, 2, 23, 40, 0, 0).getTime(),
    listenedSec: 180,
    countedPlay: true,
    startYear: 2026,
    startMonth: 1,
    startDateKey: '2026-01-02',
    startWeekday: 5,
    startHour: 23,
    startSeason: 'winter',
    startTimeBucket: 'night',
    nightOwningDateKey: '2026-01-02',
    nightSortMinute: 1420,
    titleSnapshot: 'Song A',
    artistSnapshot: 'Artist A',
    albumSnapshot: 'Album A',
  })
  assert.equal(caches.yearSummary.get(2026).totalSessions, 1)
  assert.equal(caches.lifetimeEntityIndex.songFirstSeen.agg_1.firstYear, 2026)
})

test('rebuildPlaybackAnalyticsCaches supports best-effort for legacy history', () => {
  const rebuilt = rebuildPlaybackAnalyticsCaches({
    playHistory: [{
      aggregateSongId: 'agg_legacy',
      sourceItemId: 'item_legacy',
      startedAt: new Date(2025, 11, 31, 0, 30, 0, 0).getTime(),
      endedAt: new Date(2025, 11, 31, 0, 33, 0, 0).getTime(),
      listenedSec: 180,
      durationSec: 240,
      countedPlay: true,
    }],
    aggregateSongs: [{
      aggregateSongId: 'agg_legacy',
      canonicalTitle: 'Legacy Song',
      canonicalArtist: 'Legacy Artist',
      canonicalAlbum: 'Legacy Album',
      preferredSourceItemId: 'item_legacy',
      sourceCount: 1,
      canonicalDurationSec: 240,
    }],
    sourceItems: [{
      sourceItemId: 'item_legacy',
      connectionId: 'conn_1',
      providerType: 'webdav',
      sourceUniqueKey: 'legacy',
      pathOrUri: '/Legacy/song.mp3',
      fileName: 'song.mp3',
      versionToken: 'v1',
    }],
  })

  assert.equal(rebuilt.yearSummary.get(2025).totalSessions, 1)
  assert.equal(rebuilt.yearEntityStats.get(2025).songs.agg_legacy.titleSnapshot, 'Legacy Song')
})
