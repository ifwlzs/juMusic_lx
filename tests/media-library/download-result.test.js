const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { resolveDownloadResult } = require('../../src/core/mediaLibrary/downloadResult.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('resolveDownloadResult rejects non-2xx downloads from RNFS-style tasks', async() => {
  await assert.rejects(
    resolveDownloadResult({
      promise: Promise.resolve({ statusCode: 401, bytesWritten: 128 }),
    }, { operation: 'webdav download' }),
    /webdav download.*401/i,
  )
})

test('resolveDownloadResult rejects empty RNFS downloads', async() => {
  await assert.rejects(
    resolveDownloadResult({
      promise: Promise.resolve({ statusCode: 200, bytesWritten: 0 }),
    }, { operation: 'webdav download' }),
    /empty file|0 bytes/i,
  )
})

test('resolveDownloadResult preserves native-module downloads without RNFS metadata', async() => {
  assert.equal(await resolveDownloadResult('C:/cache/test.mp3'), 'C:/cache/test.mp3')
  assert.deepEqual(
    await resolveDownloadResult({ promise: Promise.resolve({ localPath: '/cache/test.mp3' }) }),
    { localPath: '/cache/test.mp3' },
  )
})

test('remote media playback path validates download results before using cached files', () => {
  const mediaLibraryFile = readFile('src/core/music/mediaLibrary.ts')
  const runtimeRegistryFile = readFile('src/core/mediaLibrary/runtimeRegistry.js')
  const webdavProviderFile = readFile('src/core/mediaLibrary/providers/webdav.js')
  const oneDriveProviderFile = readFile('src/core/mediaLibrary/providers/onedrive.js')

  assert.match(mediaLibraryFile, /resolveDownloadResult/)
  assert.match(runtimeRegistryFile, /resolveDownloadResult/)
  assert.match(webdavProviderFile, /resolveDownloadResult/)
  assert.match(oneDriveProviderFile, /resolveDownloadResult/)
})
