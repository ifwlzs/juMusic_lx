const test = require('node:test')
const assert = require('node:assert/strict')

const { walkLocalTree, createLocalProvider } = require('../../src/core/mediaLibrary/providers/local.js')
const { scanConnection } = require('../../src/core/mediaLibrary/scan.js')

test('walkLocalTree 递归返回音频文件', async() => {
  const readDir = async(path) => {
    if (path === '/root') {
      return [
        { path: '/root/a.mp3', name: 'a.mp3', isDirectory: false },
        { path: '/root/nested', name: 'nested', isDirectory: true },
      ]
    }
    if (path === '/root/nested') {
      return [
        { path: '/root/nested/b.flac', name: 'b.flac', isDirectory: false },
        { path: '/root/nested/cover.jpg', name: 'cover.jpg', isDirectory: false },
      ]
    }
    return []
  }

  const files = await walkLocalTree(readDir, '/root')
  assert.deepEqual(files.map(file => file.path), ['/root/a.mp3', '/root/nested/b.flac'])
})

test('createLocalProvider 标记元数据读取失败并更新 lastSeenAt', async() => {
  const now = 1700000000000
  const originalNow = Date.now
  Date.now = () => now

  const readDir = async() => ([
    { path: '/root/a.mp3', name: 'a.mp3', isDirectory: false, size: 10, lastModified: 1 },
    { path: '/root/b.flac', name: 'b.flac', isDirectory: false, size: 20, lastModified: 2 },
    { path: '/root/c.mp3', name: 'c.mp3', isDirectory: false, size: 30, lastModified: 3 },
    { path: '/root/cover.jpg', name: 'cover.jpg', isDirectory: false, size: 1, lastModified: 4 },
  ])
  const readMetadata = async(path) => {
    if (path === '/root/a.mp3') {
      return { name: 'a', singer: 'A', albumName: 'AA', interval: 120 }
    }
    if (path === '/root/c.mp3') {
      return null
    }
    throw new Error('bad metadata')
  }

  const provider = createLocalProvider({ readDir, readMetadata })
  const result = await provider.scanConnection({ connectionId: 'conn_1', rootPathOrUri: '/root' })
  const items = result.items
  const successItem = items.find(item => item.pathOrUri === '/root/a.mp3')
  const failedItem = items.find(item => item.pathOrUri === '/root/b.flac')
  const nullItem = items.find(item => item.pathOrUri === '/root/c.mp3')

  assert.equal(successItem.scanStatus, 'success')
  assert.equal(failedItem.scanStatus, 'failed')
  assert.equal(nullItem.scanStatus, 'failed')
  assert.equal(successItem.lastSeenAt, now)
  assert.equal(failedItem.lastSeenAt, now)
  assert.deepEqual(result.summary, { success: 1, failed: 2, skipped: 1 })

  Date.now = originalNow
})

test('scanConnection 在版本变化时立刻删除旧缓存并重建总曲库', async() => {
  const deleted = []
  const savedAggregates = []
  const savedConnections = []
  const now = 1700000000000
  const originalNow = Date.now
  Date.now = () => now
  const repository = {
    async reconcileScannedItems() {
      return {
        invalidatedCaches: [{
          cacheId: 'cache_1',
          localFilePath: '/cache/old.mp3',
        }],
      }
    },
    async removeCaches(cacheIds) {
      assert.deepEqual(cacheIds, ['cache_1'])
    },
    async getConnections() {
      return [{ connectionId: 'conn_1', providerType: 'local' }]
    },
    async getAllSourceItems() {
      return [{
        sourceItemId: 'local_1',
        providerType: 'local',
        title: '七里香',
        artist: '周杰伦',
        durationSec: 300,
        scanStatus: 'success',
      }, {
        sourceItemId: 'local_2',
        providerType: 'local',
        title: '失败',
        artist: '忽略',
        durationSec: 100,
        scanStatus: 'failed',
      }]
    },
    async saveAggregateSongs(items) {
      savedAggregates.push(items)
    },
    async saveConnections(items) {
      savedConnections.push(items)
    },
  }
  const registry = {
    get() {
      return {
        async scanConnection() {
          return {
            items: [{
              sourceItemId: 'local_1',
              providerType: 'local',
              title: '七里香',
              artist: '周杰伦',
              durationSec: 300,
            }],
            summary: {
              success: 1,
              failed: 0,
              skipped: 1,
            },
          }
        },
      }
    },
  }

  await scanConnection({
    repository,
    registry,
    connection: { connectionId: 'conn_1', providerType: 'local' },
    deleteLocalFile: async(path) => { deleted.push(path) },
  })

  assert.deepEqual(deleted, ['/cache/old.mp3'])
  assert.equal(savedAggregates.at(-1).length, 1)
  assert.equal(savedAggregates.at(-1)[0].aggregateSongId, '七里香__周杰伦__300')
  assert.equal(savedConnections.at(-1)[0].lastScanAt, now)
  assert.equal(savedConnections.at(-1)[0].lastScanStatus, 'success')
  assert.match(savedConnections.at(-1)[0].lastScanSummary, /success/i)
  assert.match(savedConnections.at(-1)[0].lastScanSummary, /skipped: 1/i)

  Date.now = originalNow
})


test('enumerateSelection stays lightweight before metadata hydration', async() => {
  let readMetadataCalled = 0
  const readDir = async(path) => {
    if (path === '/root') {
      return [
        { path: '/root/AlbumA', name: 'AlbumA', isDirectory: true },
        { path: '/root/song-root.mp3', name: 'song-root.mp3', isDirectory: false, size: 50, lastModified: 10 },
      ]
    }
    if (path === '/root/AlbumA') {
      return [
        { path: '/root/AlbumA/song-a.flac', name: 'song-a.flac', isDirectory: false, size: 100, lastModified: 1000 },
        { path: '/root/AlbumA/song-b.mp3', name: 'song-b.mp3', isDirectory: false, size: 200, lastModified: 2000 },
      ]
    }
    return []
  }
  const readMetadata = async() => {
    readMetadataCalled += 1
    return { name: 'should-not-be-called' }
  }
  const provider = createLocalProvider({ readDir, readMetadata })
  const connection = { connectionId: 'conn_1', rootPathOrUri: '/root' }

  const result = await provider.enumerateSelection(connection, {
    directories: [{ pathOrUri: '/root/AlbumA' }],
    tracks: [{ pathOrUri: '/root/AlbumA/song-a.flac' }, { pathOrUri: '/root/song-root.mp3' }],
  })

  assert.equal(readMetadataCalled, 0)
  assert.equal(result.complete, true)
  assert.equal(result.items.length, 3)

  const songA = result.items.find(item => item.pathOrUri === '/root/AlbumA/song-a.flac')
  assert.deepEqual(songA, {
    sourceStableKey: '/root/AlbumA/song-a.flac',
    connectionId: 'conn_1',
    providerType: 'local',
    pathOrUri: '/root/AlbumA/song-a.flac',
    fileName: 'song-a.flac',
    fileSize: 100,
    modifiedTime: 1000,
    versionToken: '/root/AlbumA/song-a.flac__100__1000',
    metadataLevelReached: 0,
  })
})

test('hydrateCandidate reads metadata for a lightweight candidate', async() => {
  const readDir = async(path) => {
    if (path === '/root') {
      return [
        { path: '/root/song-a.flac', name: 'song-a.flac', isDirectory: false, size: 100, lastModified: 1000 },
      ]
    }
    return []
  }
  const readMetadataCalls = []
  const readMetadata = async(path) => {
    readMetadataCalls.push(path)
    return {
      singer: 'Artist A',
      albumName: 'Album A',
      interval: 180,
    }
  }
  const provider = createLocalProvider({ readDir, readMetadata })
  const connection = { connectionId: 'conn_1', rootPathOrUri: '/root' }
  const enumerateResult = await provider.enumerateSelection(connection, {
    tracks: [{ pathOrUri: '/root/song-a.flac' }],
  })
  const candidate = enumerateResult.items[0]

  const hydrated = await provider.hydrateCandidate(connection, candidate, { attempt: 2 })

  assert.deepEqual(readMetadataCalls, ['/root/song-a.flac'])
  assert.equal(hydrated.candidate.pathOrUri, '/root/song-a.flac')
  assert.deepEqual(hydrated.metadata, {
    title: 'song-a',
    artist: 'Artist A',
    album: 'Album A',
    durationSec: 180,
  })
  assert.equal(hydrated.metadataLevelReached, 2)
})
