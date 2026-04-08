const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { createMediaLibraryRepository } = require('../../src/core/mediaLibrary/repository.js')
const { upsertCacheEntry } = require('../../src/core/mediaLibrary/cache.js')
const { createPrefetchScheduler } = require('../../src/core/mediaLibrary/prefetch.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

const createMemoryStorage = () => {
  const map = new Map()
  return {
    async get(key) { return map.has(key) ? map.get(key) : null },
    async set(key, value) { map.set(key, value) },
    async remove(key) { map.delete(key) },
  }
}

test('prefetch scheduler starts the next track after current playback begins', async() => {
  const calls = []
  const scheduler = createPrefetchScheduler({
    async ensureCached(musicInfo, origin) {
      calls.push([musicInfo.id, origin])
    },
  })

  await scheduler.onTrackStarted({ id: 'current' }, { id: 'next' })
  assert.deepEqual(calls, [['next', 'prefetch']])
})

test('prefetch scheduler defers next-track downloads while remote sync is actively enumerating or hydrating', async() => {
  const calls = []
  const waits = []
  let deferCount = 0
  const scheduler = createPrefetchScheduler({
    async ensureCached(musicInfo, origin) {
      calls.push([musicInfo.id, origin])
    },
    async shouldDeferPrefetch() {
      deferCount += 1
      return deferCount < 3
    },
    async wait(delay) {
      waits.push(delay)
    },
    retryDelayMs: 1234,
  })

  await scheduler.onTrackStarted({ id: 'current' }, { id: 'next' })

  assert.deepEqual(calls, [['next', 'prefetch']])
  assert.equal(deferCount, 3)
  assert.deepEqual(waits, [1234, 1234])
})

test('prefetch scheduler cancels stale work when the current track changes again', async() => {
  const calls = []
  const scheduler = createPrefetchScheduler({
    async ensureCached(musicInfo, origin) {
      calls.push([musicInfo.id, origin])
    },
  })

  const first = scheduler.onTrackStarted({ id: 'current_1' }, { id: 'next_1' })
  const second = scheduler.onTrackStarted({ id: 'current_2' }, { id: 'next_2' })
  await Promise.all([first, second])

  assert.deepEqual(calls, [['next_2', 'prefetch']])
})

test('upsertCacheEntry stores play and prefetch metadata on cache records', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await upsertCacheEntry(repo, {
    cacheId: 'cache_play',
    sourceItemId: 'item_play',
    versionToken: 'v1',
    localFilePath: '/cache/play.mp3',
  }, {
    origin: 'play',
    now: () => 100,
  })
  await upsertCacheEntry(repo, {
    cacheId: 'cache_prefetch',
    sourceItemId: 'item_prefetch',
    versionToken: 'v2',
    localFilePath: '/cache/prefetch.mp3',
  }, {
    origin: 'prefetch',
    now: () => 200,
  })

  assert.deepEqual(await repo.getCaches(), [
    {
      cacheId: 'cache_play',
      sourceItemId: 'item_play',
      versionToken: 'v1',
      localFilePath: '/cache/play.mp3',
      cacheOrigin: 'play',
      createdAt: 100,
      lastAccessAt: 100,
    },
    {
      cacheId: 'cache_prefetch',
      sourceItemId: 'item_prefetch',
      versionToken: 'v2',
      localFilePath: '/cache/prefetch.mp3',
      cacheOrigin: 'prefetch',
      prefetchState: 'ready',
      createdAt: 200,
      lastAccessAt: 200,
    },
  ])
})

test('media library playback path records play caches and next-track prefetch defers while remote sync is active', () => {
  const mediaLibraryFile = readFile('src/core/music/mediaLibrary.ts')
  const preloadFile = readFile('src/core/init/player/preloadNextMusic.ts')

  assert.match(mediaLibraryFile, /origin = 'play'/)
  assert.match(mediaLibraryFile, /upsertCacheEntry\(mediaLibraryRepository, \{[\s\S]*\}, \{ origin \}\)/)
  assert.match(mediaLibraryFile, /prefetchMediaLibraryTrack/)
  assert.match(preloadFile, /createPrefetchScheduler/)
  assert.match(preloadFile, /shouldDeferPrefetch/)
  assert.match(preloadFile, /mediaLibraryRepository\.getSyncRuns\(\)/)
  assert.match(preloadFile, /run\.status === 'running'/)
  assert.match(preloadFile, /run\.phase === 'enumerate'/)
  assert.match(preloadFile, /run\.phase === 'hydrate'/)
  assert.match(preloadFile, /prefetchMediaLibraryTrack/)
})
