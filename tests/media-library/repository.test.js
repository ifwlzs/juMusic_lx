const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { createKeyBuilder, createMediaLibraryRepository } = require('../../src/core/mediaLibrary/repository.js')

const createMemoryStorage = () => {
  const map = new Map()
  return {
    async get(key) { return map.has(key) ? map.get(key) : null },
    async set(key, value) { map.set(key, value) },
    async remove(key) { map.delete(key) },
  }
}

test('createKeyBuilder 生成稳定的媒体库 key', () => {
  const keys = createKeyBuilder('@media_library__')
  assert.equal(keys.connections(), '@media_library__connections')
  assert.equal(keys.sourceItems('conn_1'), '@media_library__source_items__conn_1')
})

test('createKeyBuilder supports playback analytics cache keys', () => {
  const keys = createKeyBuilder('@media_library__')
  assert.equal(keys.yearSummary(2026), '@media_library__year_summary__2026')
  assert.equal(keys.yearTimeStats(2026), '@media_library__year_time_stats__2026')
  assert.equal(keys.yearEntityStats(2026), '@media_library__year_entity_stats__2026')
  assert.equal(keys.lifetimeEntityIndex(), '@media_library__lifetime_entity_index')
})

test('saveConnections 不持久化明文 credentials', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveConnections([{
    connectionId: 'conn_1',
    providerType: 'webdav',
    displayName: 'WebDAV',
    rootPathOrUri: 'https://example.test/music',
    credentialRef: 'cred_1',
    credentials: {
      username: 'alice',
      password: 'secret',
    },
  }])

  const connections = await repo.getConnections()
  assert.equal(connections[0].credentialRef, 'cred_1')
  assert.equal('credentials' in connections[0], false)
})

test('仓储层在版本变化时返回需要失效的缓存项', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveSourceItems('conn_1', [{
    sourceItemId: 'item_1',
    connectionId: 'conn_1',
    versionToken: 'old',
  }])
  await repo.saveCaches([{
    cacheId: 'cache_1',
    sourceItemId: 'item_1',
    versionToken: 'old',
    localFilePath: '/cache/old.mp3',
  }])

  const diff = await repo.reconcileScannedItems('conn_1', [{
    sourceItemId: 'item_1',
    connectionId: 'conn_1',
    versionToken: 'new',
  }])

  assert.deepEqual(diff.invalidatedCaches.map(item => item.cacheId), ['cache_1'])
})

test('savePlayHistory fills analytics defaults', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.savePlayHistory([{
    aggregateSongId: 'agg_1',
    sourceItemId: 'item_1',
    startedAt: 100,
    endedAt: 200,
    listenedSec: 100,
    durationSec: 300,
    countedPlay: false,
  }])

  const item = (await repo.getPlayHistory())[0]
  assert.equal(item.entrySource, 'unknown')
  assert.equal(item.endReason, 'unknown')
  assert.equal(item.seekCount, 0)
  assert.equal(item.listTypeSnapshot, 'unknown')
  assert.equal(item.startDateKey, '')
  assert.equal(item.nightOwningDateKey, '')
})

test('repository supports year summary persistence', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveYearSummary(2026, { year: 2026, totalSessions: 1 })
  const summary = await repo.getYearSummary(2026)

  assert.equal(summary.totalSessions, 1)
})

test('reconcileScannedItems 在版本变化时删除旧 media_cache 记录', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveSourceItems('conn_1', [{
    sourceItemId: 'item_1',
    connectionId: 'conn_1',
    versionToken: 'old',
  }])
  await repo.saveCaches([{
    cacheId: 'cache_1',
    sourceItemId: 'item_1',
    versionToken: 'old',
    localFilePath: '/cache/old.mp3',
  }])

  await repo.reconcileScannedItems('conn_1', [{
    sourceItemId: 'item_1',
    connectionId: 'conn_1',
    versionToken: 'new',
  }])

  assert.deepEqual(await repo.getCaches(), [])
})

test('mediaLibrary 类型定义覆盖索引记录且不暴露明文 credentials', () => {
  const content = fs.readFileSync(path.resolve(__dirname, '../../src/types/mediaLibrary.d.ts'), 'utf8')

  assert.match(content, /interface SourceItem/)
  assert.match(content, /interface AggregateSong/)
  assert.match(content, /interface MediaCache/)
  assert.match(content, /interface PlayStat/)
  assert.match(content, /type PlaybackEntrySource/)
  assert.match(content, /type PlaybackEndReason/)
  assert.match(content, /interface YearSummary/)
  assert.match(content, /startDateKey: string/)
  assert.match(content, /nightOwningDateKey: string/)
  assert.doesNotMatch(content, /credentials\?:/)
})
