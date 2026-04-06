const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizeImportSelection } = require('../../src/core/mediaLibrary/browse.js')
const { createOneDriveProvider } = require('../../src/core/mediaLibrary/providers/onedrive.js')

test('onedrive provider browseConnection follows pagination and keeps directories plus audio files only', async() => {
  const calls = []
  const provider = createOneDriveProvider({
    async listChildren(connection, pathOrUri, nextLink = null) {
      calls.push({ connectionId: connection.connectionId, pathOrUri, nextLink })
      if (!nextLink) {
        return {
          items: [
            {
              id: 'dir_albums',
              name: 'Albums',
              folder: { childCount: 1 },
              size: 0,
              eTag: '"dir_1"',
              parentReference: { path: '/drive/root:' },
            },
            {
              id: 'cover_1',
              name: 'cover.jpg',
              file: { mimeType: 'image/jpeg' },
              size: 10,
              eTag: '"cover_1"',
              parentReference: { path: '/drive/root:' },
            },
          ],
          nextLink: 'page_2',
        }
      }

      return {
        items: [
          {
            id: 'track_1',
            name: 'song.mp3',
            file: { mimeType: 'audio/mpeg' },
            size: 100,
            eTag: '"song_1"',
            parentReference: { path: '/drive/root:' },
            lastModifiedDateTime: '2026-04-06T10:00:00Z',
          },
        ],
        nextLink: null,
      }
    },
    async getItemByPath() {
      return null
    },
    async downloadFile() {
      return null
    },
    async readMetadata() {
      return null
    },
  })

  const nodes = await provider.browseConnection({
    connectionId: 'onedrive_conn',
    providerType: 'onedrive',
    rootPathOrUri: '/',
  }, '/')

  assert.deepEqual(nodes.map(node => [node.kind, node.name, node.pathOrUri]), [
    ['directory', 'Albums', '/Albums'],
    ['track', 'song.mp3', '/song.mp3'],
  ])
  assert.deepEqual(calls, [
    { connectionId: 'onedrive_conn', pathOrUri: '/', nextLink: null },
    { connectionId: 'onedrive_conn', pathOrUri: '/', nextLink: 'page_2' },
  ])
})

test('onedrive provider scanSelection merges recursive directories and explicit tracks without duplicates', async() => {
  const tempFiles = []
  const provider = createOneDriveProvider({
    async listChildren(connection, pathOrUri) {
      switch (pathOrUri) {
        case '/Albums':
          return {
            items: [
              {
                id: 'nested_dir',
                name: 'Disc 1',
                folder: { childCount: 1 },
                size: 0,
                eTag: '"dir_nested"',
                parentReference: { path: '/drive/root:/Albums' },
              },
              {
                id: 'album_track',
                name: 'intro.mp3',
                file: { mimeType: 'audio/mpeg' },
                size: 101,
                eTag: '"track_intro"',
                parentReference: { path: '/drive/root:/Albums' },
                lastModifiedDateTime: '2026-04-06T10:00:00Z',
              },
            ],
            nextLink: null,
          }
        case '/Albums/Disc 1':
          return {
            items: [
              {
                id: 'nested_track',
                name: 'theme.flac',
                file: { mimeType: 'audio/flac' },
                size: 202,
                eTag: '"track_theme"',
                parentReference: { path: '/drive/root:/Albums/Disc 1' },
                lastModifiedDateTime: '2026-04-06T11:00:00Z',
              },
            ],
            nextLink: null,
          }
        default:
          return {
            items: [],
            nextLink: null,
          }
      }
    },
    async getItemByPath(connection, pathOrUri) {
      if (pathOrUri === '/Singles/lone.m4a') {
        return {
          id: 'single_track',
          name: 'lone.m4a',
          file: { mimeType: 'audio/mp4' },
          size: 303,
          eTag: '"track_lone"',
          parentReference: { path: '/drive/root:/Singles' },
          lastModifiedDateTime: '2026-04-06T12:00:00Z',
        }
      }
      return null
    },
    async downloadFile(connection, pathOrUri, savePath) {
      tempFiles.push(['download', connection.connectionId, pathOrUri, savePath])
      return savePath
    },
    async readMetadata(localPath) {
      tempFiles.push(['metadata', localPath])
      return {
        name: localPath.split('/').at(-1)?.replace(/\.[^.]+$/, '') || '',
        singer: 'artist',
        albumName: 'album',
        interval: 188,
      }
    },
    createTempFilePath(fileName) {
      tempFiles.push(['temp', fileName])
      return `/tmp/${fileName}`
    },
    async removeTempFile(localPath) {
      tempFiles.push(['cleanup', localPath])
    },
  })

  const result = await provider.scanSelection({
    connectionId: 'onedrive_conn',
    providerType: 'onedrive',
    rootPathOrUri: '/',
  }, normalizeImportSelection({
    directories: [
      { selectionId: 'dir_1', kind: 'directory', pathOrUri: '/Albums', displayName: 'Albums' },
    ],
    tracks: [
      { selectionId: 'track_1', kind: 'track', pathOrUri: '/Albums/Disc 1/theme.flac', displayName: 'theme.flac' },
      { selectionId: 'track_2', kind: 'track', pathOrUri: '/Singles/lone.m4a', displayName: 'lone.m4a' },
    ],
  }))

  assert.deepEqual(result.items.map(item => item.pathOrUri), [
    '/Albums/intro.mp3',
    '/Albums/Disc 1/theme.flac',
    '/Singles/lone.m4a',
  ])
  assert.deepEqual(result.summary, {
    success: 3,
    failed: 0,
    skipped: 0,
  })
  assert.equal(result.items[0].providerType, 'onedrive')
  assert.equal(result.items[0].durationSec, 188)
  assert.equal(result.items[1].versionToken, '"track_theme"')
  assert.deepEqual(tempFiles.map(item => item.join('::')).sort(), [
    'cleanup::/tmp/intro.mp3',
    'cleanup::/tmp/lone.m4a',
    'cleanup::/tmp/theme.flac',
    'download::onedrive_conn::/Albums/Disc 1/theme.flac::/tmp/theme.flac',
    'download::onedrive_conn::/Albums/intro.mp3::/tmp/intro.mp3',
    'download::onedrive_conn::/Singles/lone.m4a::/tmp/lone.m4a',
    'metadata::/tmp/intro.mp3',
    'metadata::/tmp/lone.m4a',
    'metadata::/tmp/theme.flac',
    'temp::intro.mp3',
    'temp::lone.m4a',
    'temp::theme.flac',
  ])
})

test('onedrive provider downloadToCache delegates to downloadFile', async() => {
  const calls = []
  const provider = createOneDriveProvider({
    async listChildren() {
      return {
        items: [],
        nextLink: null,
      }
    },
    async getItemByPath() {
      return null
    },
    async downloadFile(connection, pathOrUri, savePath) {
      calls.push([connection.connectionId, pathOrUri, savePath])
      return 'ok'
    },
    async readMetadata() {
      return null
    },
  })

  const result = await provider.downloadToCache({
    connectionId: 'onedrive_conn',
  }, {
    pathOrUri: '/Music/test.mp3',
  }, '/cache/test.mp3')

  assert.equal(result, 'ok')
  assert.deepEqual(calls, [['onedrive_conn', '/Music/test.mp3', '/cache/test.mp3']])
})

test('onedrive provider caps concurrent metadata reads during scanSelection', async() => {
  let activeMetadataReads = 0
  let maxActiveMetadataReads = 0
  const blockers = []
  const provider = createOneDriveProvider({
    async listChildren() {
      return {
        items: Array.from({ length: 5 }, (_, index) => ({
          id: `track_${index + 1}`,
          name: `song_${index + 1}.mp3`,
          file: { mimeType: 'audio/mpeg' },
          size: 100 + index,
          eTag: `"track_${index + 1}"`,
          parentReference: { path: '/drive/root:/Albums' },
          lastModifiedDateTime: '2026-04-06T12:00:00Z',
        })),
        nextLink: null,
      }
    },
    async getItemByPath() {
      return null
    },
    async downloadFile(connection, pathOrUri, savePath) {
      return { connection, pathOrUri, savePath }
    },
    async readMetadata(localPath) {
      activeMetadataReads += 1
      if (activeMetadataReads > maxActiveMetadataReads) maxActiveMetadataReads = activeMetadataReads
      await new Promise(resolve => {
        blockers.push(() => {
          activeMetadataReads -= 1
          resolve(null)
        })
      })
      return {
        name: localPath.split('/').at(-1)?.replace(/\.[^.]+$/, '') || '',
        singer: 'artist',
        albumName: 'album',
        interval: 188,
      }
    },
    createTempFilePath(fileName) {
      return `/tmp/${fileName}`
    },
    async removeTempFile() {},
    metadataConcurrency: 2,
  })

  const scanPromise = provider.scanSelection({
    connectionId: 'onedrive_conn',
    providerType: 'onedrive',
    rootPathOrUri: '/',
  }, normalizeImportSelection({
    directories: [
      { selectionId: 'dir_1', kind: 'directory', pathOrUri: '/Albums', displayName: 'Albums' },
    ],
    tracks: [],
  }))

  for (let i = 0; i < 20; i++) {
    if (blockers.length >= 2) break
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  assert.equal(blockers.length, 2)
  assert.equal(maxActiveMetadataReads, 2)

  const releaseTimer = setInterval(() => {
    const next = blockers.shift()
    if (next) next()
  }, 0)

  const result = await scanPromise.finally(() => {
    clearInterval(releaseTimer)
  })

  assert.equal(result.items.length, 5)
  assert.equal(maxActiveMetadataReads, 2)
})
