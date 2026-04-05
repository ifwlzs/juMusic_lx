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
  assert.doesNotMatch(content, /credentials\?:/)
})
