const test = require('node:test')
const assert = require('node:assert/strict')

const {
  computePlaybackTimeFacts,
  resolvePlaybackTimeBucket,
  resolvePlaybackSeason,
  resolveNightOwningDateKey,
  resolveNightSortMinute,
  clampCompletionRate,
  resolvePlaybackListType,
  normalizeArtistEntityKey,
  normalizeAlbumEntityKey,
} = require('../../src/core/mediaLibrary/playbackAnalyticsFacts.js')

test('time bucket and season mapping', () => {
  assert.equal(resolvePlaybackTimeBucket(0), 'late_night')
  assert.equal(resolvePlaybackTimeBucket(12), 'noon')
  assert.equal(resolvePlaybackTimeBucket(23), 'night')
  assert.equal(resolvePlaybackSeason(1), 'winter')
  assert.equal(resolvePlaybackSeason(7), 'summer')
})

test('night owning rule maps 00:30 to previous date and sortable minute', () => {
  const ts = new Date(2026, 0, 2, 0, 30, 0, 0).getTime()
  assert.equal(resolveNightOwningDateKey(ts), '2026-01-01')
  assert.equal(resolveNightSortMinute(ts), 1470)
})

test('facts and normalization', () => {
  const facts = computePlaybackTimeFacts(new Date(2026, 3, 12, 23, 40, 0, 0).getTime())
  assert.equal(facts.startYear, 2026)
  assert.equal(facts.startTimeBucket, 'night')
  assert.equal(clampCompletionRate(120, 300), 0.4)
  assert.equal(resolvePlaybackListType({ entrySource: 'search' }), 'search')
  assert.equal(normalizeArtistEntityKey('  Aimer  '), 'aimer')
  assert.equal(normalizeAlbumEntityKey('Aimer', ' Walpurgis '), 'aimer::walpurgis')
})
