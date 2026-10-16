const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { createMediaLibraryRepository } = require('../../src/core/mediaLibrary/repository.js')
const { resolvePlayableResource } = require('../../src/core/mediaLibrary/playbackResolver.js')
const { upsertCacheEntry } = require('../../src/core/mediaLibrary/cache.js')
const { buildMediaLibraryCacheFilePath } = require('../../src/core/mediaLibrary/cachePath.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

const createMemoryStorage = () => {
  const map = new Map()
  return {
    async get(key) { return map.has(key) ? map.get(key) : null },
    async set(key, value) { map.set(key, value) },
    async remove(key) { map.delete(key) },
  }
}

test('播放解析优先本地文件，其次有效缓存，最后远端拉取', async() => {
  const calls = []
  const result = await resolvePlayableResource({
    sourceItem: {
      providerType: 'webdav',
      sourceItemId: 'item_1',
      versionToken: 'v2',
      pathOrUri: '/music/test.mp3',
    },
    cacheEntry: {
      sourceItemId: 'item_1',
      versionToken: 'v2',
      localFilePath: '/cache/test.mp3',
    },
    downloadToCache: async() => {
      calls.push('download')
      return '/cache/new.mp3'
    },
  })

  assert.equal(result.url, 'file:///cache/test.mp3')
  assert.deepEqual(calls, [])
})

test('播放解析遇到过期缓存时先失效删除，再重新拉取', async() => {
  const calls = []
  const result = await resolvePlayableResource({
    sourceItem: {
      providerType: 'webdav',
      sourceItemId: 'item_1',
      versionToken: 'v2',
      pathOrUri: '/music/test.mp3',
    },
    cacheEntry: {
      cacheId: 'cache_1',
      sourceItemId: 'item_1',
      versionToken: 'v1',
      localFilePath: '/cache/old.mp3',
    },
    invalidateCacheEntry: async(cacheEntry) => {
      calls.push(`invalidate:${cacheEntry.cacheId}`)
    },
    downloadToCache: async() => {
      calls.push('download')
      return '/cache/new.mp3'
    },
  })

  assert.equal(result.url, 'file:///cache/new.mp3')
  assert.deepEqual(calls, ['invalidate:cache_1', 'download'])
})

test('upsertCacheEntry 只替换当前 sourceItem 的缓存记录', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveCaches([
    {
      cacheId: 'cache_other',
      sourceItemId: 'item_other',
      versionToken: 'v1',
      localFilePath: '/cache/other.mp3',
    },
    {
      cacheId: 'cache_old',
      sourceItemId: 'item_1',
      versionToken: 'v1',
      localFilePath: '/cache/old.mp3',
    },
  ])

  await upsertCacheEntry(repo, {
    cacheId: 'cache_new',
    sourceItemId: 'item_1',
    versionToken: 'v2',
    localFilePath: '/cache/new.mp3',
  }, {
    origin: 'play',
    now: () => 200,
  })

  assert.deepEqual(await repo.getCaches(), [
    {
      cacheId: 'cache_other',
      sourceItemId: 'item_other',
      versionToken: 'v1',
      localFilePath: '/cache/other.mp3',
    },
    {
      cacheId: 'cache_new',
      sourceItemId: 'item_1',
      versionToken: 'v2',
      localFilePath: '/cache/new.mp3',
      cacheOrigin: 'play',
      createdAt: 200,
      lastAccessAt: 200,
    },
  ])
})

test('媒体库缓存文件路径使用 file URI 安全文件名', () => {
  const cacheFilePath = buildMediaLibraryCacheFilePath(
    '/cache/media-library',
    'media_connection__1775397030580__/dav/tb/Music/%E2%96%93%E8%99%9A%E6%8B%9F%E6%AD%8C%E5%A7%AC%E2%96%93/GUMI%20-%20Binarization%202014.mp3',
    'mp3',
  )

  assert.match(cacheFilePath, /^\/cache\/media-library\/media_[0-9a-f]+\.mp3$/)
  assert.doesNotMatch(cacheFilePath, /%/)
  assert.doesNotMatch(path.basename(cacheFilePath), /[\\/]/)
})

test('mediaLibrary 播放链路通过 credentialRef 解析远端凭据并优先读取本地歌词', () => {
  const content = readFile('src/core/music/mediaLibrary.ts')
  assert.match(content, /readLyric/)
  assert.match(content, /parseLyric/)
  assert.match(content, /resolveLocalPlayableFilePath/)
  assert.match(content, /getMediaLibraryRuntimeRegistry/)
  assert.match(content, /provider\.downloadToCache\(/)
  assert.match(content, /buildMediaLibraryCacheFilePath/)
  assert.doesNotMatch(content, /buildWebdavHeaders|buildWebdavUrl/)
  assert.doesNotMatch(content, /downloadSmbFile/)
  assert.doesNotMatch(content, /resolveConnectionCredential/)
  assert.doesNotMatch(content, /connection\.credentials\./)
})

test('core/music 将 webdav、smb 和 onedrive 路由到 mediaLibrary 播放链路', () => {
  const content = readFile('src/core/music/index.ts')
  assert.match(content, /getMediaLibraryMusicUrl/)
  assert.match(content, /getMediaLibraryPicUrl/)
  assert.match(content, /getMediaLibraryLyricInfo/)
  assert.match(content, /musicInfo\.source == 'webdav' \|\| musicInfo\.source == 'smb' \|\| musicInfo\.source == 'onedrive'/)
})
