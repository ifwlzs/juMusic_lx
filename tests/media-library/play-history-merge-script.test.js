const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

test('merge-play-history script merges multiple exports and deduplicates sessions', () => {
  const rootDir = path.resolve(__dirname, '../../')
  const scriptPath = path.resolve(rootDir, 'scripts/play-history/merge-play-history.js')
  assert.equal(fs.existsSync(scriptPath), true)

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-play-history-merge-'))
  const fileA = path.join(tempDir, 'phone-a.json')
  const fileB = path.join(tempDir, 'phone-b.json')

  const sharedItem = {
    aggregateSongId: 'song_shared',
    sourceItemId: 'source_shared',
    startedAt: 1713000000000,
    endedAt: 1713000123000,
    listenedSec: 123,
    durationSec: 180,
    countedPlay: true,
    completionRate: 0.68,
    endReason: 'manual_next',
    entrySource: 'search',
    seekCount: 1,
    seekForwardSec: 3,
    seekBackwardSec: 0,
    startYear: 2024,
    startMonth: 4,
    startDay: 13,
    startDateKey: '2024-04-13',
    startWeekday: 6,
    startHour: 12,
    startSeason: 'spring',
    startTimeBucket: 'noon',
    nightOwningDateKey: '2024-04-13',
    nightSortMinute: 720,
    titleSnapshot: 'Shared Song',
    artistSnapshot: 'Shared Artist',
    albumSnapshot: 'Shared Album',
    providerTypeSnapshot: 'webdav',
    fileNameSnapshot: 'shared.mp3',
    remotePathSnapshot: '/music/shared.mp3',
    listIdSnapshot: 'media__all',
    listTypeSnapshot: 'search',
    song: {
      title: 'Shared Song',
      artist: 'Shared Artist',
      album: 'Shared Album',
      canonicalDurationSec: 180,
      providerType: 'webdav',
      pathOrUri: '/music/shared.mp3',
      fileName: 'shared.mp3',
    },
  }

  const uniqueA = {
    ...sharedItem,
    aggregateSongId: 'song_a_only',
    sourceItemId: 'source_a_only',
    startedAt: 1713001000000,
    endedAt: 1713001400000,
    titleSnapshot: 'Song A',
    artistSnapshot: 'Artist A',
    fileNameSnapshot: 'a.mp3',
    remotePathSnapshot: '/music/a.mp3',
  }
  const uniqueB = {
    ...sharedItem,
    aggregateSongId: 'song_b_only',
    sourceItemId: 'source_b_only',
    startedAt: 1713002000000,
    endedAt: 1713002400000,
    titleSnapshot: 'Song B',
    artistSnapshot: 'Artist B',
    fileNameSnapshot: 'b.mp3',
    remotePathSnapshot: '/music/b.mp3',
  }

  const payloadA = {
    type: 'playHistoryExport_v1',
    exportedAt: 1713005000000,
    timezone: 'Asia/Shanghai',
    range: { preset: 'all', start: null, end: null },
    count: 2,
    items: [sharedItem, uniqueA],
  }
  const payloadB = {
    type: 'playHistoryExport_v1',
    exportedAt: 1713006000000,
    timezone: 'Asia/Shanghai',
    range: { preset: 'all', start: null, end: null },
    count: 2,
    items: [sharedItem, uniqueB],
  }

  fs.writeFileSync(fileA, JSON.stringify(payloadA), 'utf8')
  fs.writeFileSync(fileB, JSON.stringify(payloadB), 'utf8')

  const outputPath = path.join(tempDir, 'merged.json')
  execFileSync('node', [scriptPath, '--output', outputPath, fileA, fileB], {
    cwd: rootDir,
    stdio: 'pipe',
  })

  const merged = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  assert.equal(merged.type, 'playHistoryExport_v1')
  assert.equal(Array.isArray(merged.items), true)
  assert.equal(merged.count, 3)
  assert.equal(merged.items.length, 3)
  assert.equal(merged.mergeMeta.inputFiles, 2)
  assert.equal(merged.mergeMeta.inputItems, 4)
  assert.equal(merged.mergeMeta.dedupedItems, 1)
  assert.equal(merged.items[0].startedAt <= merged.items[1].startedAt, true)
  assert.equal(merged.items[1].startedAt <= merged.items[2].startedAt, true)
})
