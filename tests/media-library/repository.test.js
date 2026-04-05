const test = require('node:test')
const assert = require('node:assert/strict')

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
