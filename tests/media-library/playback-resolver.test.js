const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { createMediaLibraryRepository } = require('../../src/core/mediaLibrary/repository.js')
const { resolvePlayableResource } = require('../../src/core/mediaLibrary/playbackResolver.js')
const { upsertCacheEntry } = require('../../src/core/mediaLibrary/cache.js')

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
    },
  ])
})

test('mediaLibrary 播放链路通过 credentialRef 解析远端凭据并优先读取本地歌词', () => {
  const content = readFile('src/core/music/mediaLibrary.ts')
  assert.match(content, /readLyric/)
  assert.match(content, /parseLyric/)
  assert.match(content, /resolveLocalPlayableFilePath/)
  assert.match(content, /resolveConnectionCredential/)
  assert.match(content, /encodeURIComponent\(musicInfo\.meta\.mediaLibrary!\.sourceItemId\)/)
  assert.doesNotMatch(content, /connection\.credentials\./)
})

test('core/music 将 webdav 和 smb 路由到 mediaLibrary 播放链路', () => {
  const content = readFile('src/core/music/index.ts')
  assert.match(content, /getMediaLibraryMusicUrl/)
  assert.match(content, /getMediaLibraryPicUrl/)
  assert.match(content, /getMediaLibraryLyricInfo/)
  assert.match(content, /musicInfo\.source == 'webdav' \|\| musicInfo\.source == 'smb'/)
})
