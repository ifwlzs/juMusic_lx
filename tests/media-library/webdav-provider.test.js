const test = require('node:test')
const assert = require('node:assert/strict')

const { parseMultiStatus } = require('../../src/core/mediaLibrary/providers/webdavXml.js')
const { createWebdavProvider } = require('../../src/core/mediaLibrary/providers/webdav.js')
const { buildWebdavVersionToken } = require('../../src/core/mediaLibrary/versionToken.js')

test('parseMultiStatus 提取文件 href、etag、mtime、size', () => {
  const items = parseMultiStatus(`<?xml version="1.0"?>
  <d:multistatus xmlns:d="DAV:">
    <d:response>
      <d:href>/music/test.mp3</d:href>
      <d:propstat>
        <d:prop>
          <d:getetag>"abc"</d:getetag>
          <d:getlastmodified>Sat, 05 Apr 2026 10:00:00 GMT</d:getlastmodified>
          <d:getcontentlength>321</d:getcontentlength>
        </d:prop>
      </d:propstat>
    </d:response>
  </d:multistatus>`)

  assert.equal(items[0].href, '/music/test.mp3')
  assert.equal(items[0].etag, '"abc"')
  assert.equal(buildWebdavVersionToken(items[0]), '"abc"')
})

test('createWebdavProvider scanConnection 输出完整字段并过滤非音频与目录', async() => {
  const now = 1700000000000
  const originalNow = Date.now
  Date.now = () => now
  const xml = `<?xml version="1.0"?>
  <d:multistatus xmlns:d="DAV:">
    <d:response>
      <d:href>/music/</d:href>
      <d:propstat>
        <d:prop>
          <d:getetag>"root"</d:getetag>
        </d:prop>
      </d:propstat>
    </d:response>
    <d:response>
      <d:href>/music/cover.jpg</d:href>
      <d:propstat>
        <d:prop>
          <d:getetag>"cover"</d:getetag>
          <d:getcontentlength>12</d:getcontentlength>
        </d:prop>
      </d:propstat>
    </d:response>
    <d:response>
      <d:href>/music/test.mp3</d:href>
      <d:propstat>
        <d:prop>
          <d:getetag>"abc"</d:getetag>
          <d:getlastmodified>Sat, 05 Apr 2026 10:00:00 GMT</d:getlastmodified>
          <d:getcontentlength>321</d:getcontentlength>
        </d:prop>
      </d:propstat>
    </d:response>
    <d:response>
      <d:href>/music/track.flac</d:href>
      <d:propstat>
        <d:prop>
          <d:getlastmodified>Sat, 05 Apr 2026 11:00:00 GMT</d:getlastmodified>
          <d:getcontentlength>1000</d:getcontentlength>
        </d:prop>
      </d:propstat>
    </d:response>
    <d:response>
      <d:href>/music/unknown.mp3</d:href>
      <d:propstat>
        <d:prop>
          <d:getcontentlength></d:getcontentlength>
        </d:prop>
      </d:propstat>
    </d:response>
    <d:response>
      <d:href>/music/%E4%B8%AD%E6%96%87%20track.mp3</d:href>
      <d:propstat>
        <d:prop>
          <d:getetag>"encoded"</d:getetag>
          <d:getcontentlength>999</d:getcontentlength>
        </d:prop>
      </d:propstat>
    </d:response>
  </d:multistatus>`

  const request = async() => xml
  const provider = createWebdavProvider({ request, downloadFile: async() => {} })
  const result = await provider.scanConnection({ connectionId: 'conn_1' })
  const items = result.items

  assert.equal(items.length, 4)
  assert.deepEqual(result.summary, { success: 3, failed: 1, skipped: 2 })

  const mp3 = items.find(item => item.pathOrUri === '/music/test.mp3')
  assert.ok(mp3)
  assert.equal(mp3.sourceItemId, 'conn_1__/music/test.mp3')
  assert.equal(mp3.connectionId, 'conn_1')
  assert.equal(mp3.providerType, 'webdav')
  assert.equal(mp3.sourceUniqueKey, '/music/test.mp3')
  assert.equal(mp3.fileName, 'test.mp3')
  assert.equal(mp3.fileSize, 321)
  assert.equal(mp3.versionToken, '"abc"')
  assert.equal(mp3.lastSeenAt, now)
  assert.equal(mp3.scanStatus, 'success')

  const flac = items.find(item => item.pathOrUri === '/music/track.flac')
  assert.ok(flac)
  assert.equal(flac.sourceItemId, 'conn_1__/music/track.flac')
  assert.equal(flac.fileName, 'track.flac')
  assert.equal(flac.fileSize, 1000)
  assert.equal(flac.versionToken, `${Date.parse('Sat, 05 Apr 2026 11:00:00 GMT')}__1000`)

  const failed = items.find(item => item.pathOrUri === '/music/unknown.mp3')
  assert.ok(failed)
  assert.equal(failed.scanStatus, 'failed')
  assert.equal(failed.versionToken, '')

  const encoded = items.find(item => item.pathOrUri === '/music/%E4%B8%AD%E6%96%87%20track.mp3')
  assert.ok(encoded)
  assert.equal(encoded.fileName, '中文 track.mp3')

  Date.now = originalNow
})

test('downloadToCache 转发到 downloadFile', async() => {
  const calls = []
  const downloadFile = async(connection, uri, savePath) => {
    calls.push([connection, uri, savePath])
    return 'ok'
  }
  const provider = createWebdavProvider({ request: async() => '', downloadFile })
  const connection = { connectionId: 'conn_1' }
  const sourceItem = { pathOrUri: '/music/test.mp3' }

  const result = await provider.downloadToCache(connection, sourceItem, '/cache/test.mp3')

  assert.equal(result, 'ok')
  assert.deepEqual(calls, [[connection, '/music/test.mp3', '/cache/test.mp3']])
})

test('createWebdavProvider 在可下载并读取 metadata 时填充标题、歌手、专辑与时长', async() => {
  const xml = `<?xml version="1.0"?>
  <d:multistatus xmlns:d="DAV:">
    <d:response>
      <d:href>/music/</d:href>
      <d:propstat>
        <d:prop>
          <d:getetag>"root"</d:getetag>
        </d:prop>
      </d:propstat>
    </d:response>
    <d:response>
      <d:href>/music/test.mp3</d:href>
      <d:propstat>
        <d:prop>
          <d:getetag>"abc"</d:getetag>
          <d:getlastmodified>Sat, 05 Apr 2026 10:00:00 GMT</d:getlastmodified>
          <d:getcontentlength>321</d:getcontentlength>
        </d:prop>
      </d:propstat>
    </d:response>
  </d:multistatus>`

  const calls = []
  const provider = createWebdavProvider({
    request: async() => xml,
    async downloadFile(connection, uri, savePath) {
      calls.push(['download', connection.connectionId, uri, savePath])
      return savePath
    },
    async readMetadata(localPath) {
      calls.push(['metadata', localPath])
      return {
        name: '七里香',
        singer: '周杰伦',
        albumName: '七里香',
        interval: 300,
      }
    },
    createTempFilePath(fileName) {
      calls.push(['temp', fileName])
      return `/tmp/${fileName}`
    },
    async removeTempFile(localPath) {
      calls.push(['cleanup', localPath])
    },
  })

  const result = await provider.scanConnection({ connectionId: 'conn_1', rootPathOrUri: '/music' })
  const item = result.items[0]

  assert.equal(item.title, '七里香')
  assert.equal(item.artist, '周杰伦')
  assert.equal(item.album, '七里香')
  assert.equal(item.durationSec, 300)
  assert.deepEqual(calls, [
    ['temp', 'test.mp3'],
    ['download', 'conn_1', '/music/test.mp3', '/tmp/test.mp3'],
    ['metadata', '/tmp/test.mp3'],
    ['cleanup', '/tmp/test.mp3'],
  ])
})

test('createWebdavProvider streamEnumerateSelection streams candidates before hydration', async() => {
  const xml = `<?xml version="1.0"?>
  <d:multistatus xmlns:d="DAV:">
    <d:response>
      <d:href>/music/</d:href>
      <d:propstat><d:prop><d:getetag>"root"</d:getetag></d:prop></d:propstat>
    </d:response>
    <d:response>
      <d:href>/music/test.mp3</d:href>
      <d:propstat>
        <d:prop>
          <d:getetag>"abc"</d:getetag>
          <d:getlastmodified>Sat, 05 Apr 2026 10:00:00 GMT</d:getlastmodified>
          <d:getcontentlength>321</d:getcontentlength>
        </d:prop>
      </d:propstat>
    </d:response>
  </d:multistatus>`

  const batches = []
  const provider = createWebdavProvider({
    async request() { return xml },
    async downloadFile() {},
    async readMetadata() { return null },
  })

  const result = await provider.streamEnumerateSelection({
    connectionId: 'conn_1',
    providerType: 'webdav',
  }, {
    directories: [{ selectionId: 'dir_1', kind: 'directory', pathOrUri: '/music/', displayName: 'music' }],
    tracks: [],
  }, async batch => {
    batches.push(batch)
  })

  assert.equal(batches.length, 1)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].pathOrUri, '/music/test.mp3')
})

test('createWebdavProvider streamEnumerateSelection emits shallower directory candidates before deeper traversal finishes', async() => {
  const batches = []
  let resolveNestedRequest
  let releaseNestedDirectory
  const nestedRequested = new Promise(resolve => {
    resolveNestedRequest = resolve
  })
  const nestedBlocked = new Promise(resolve => {
    releaseNestedDirectory = resolve
  })

  const provider = createWebdavProvider({
    async request(_connection, { pathOrUri }) {
      if (pathOrUri === '/music/') {
        return `<?xml version="1.0"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/music/</d:href>
            <d:propstat><d:prop><d:getetag>"root"</d:getetag></d:prop></d:propstat>
          </d:response>
          <d:response>
            <d:href>/music/test.mp3</d:href>
            <d:propstat>
              <d:prop>
                <d:getetag>"abc"</d:getetag>
                <d:getlastmodified>Sat, 05 Apr 2026 10:00:00 GMT</d:getlastmodified>
                <d:getcontentlength>321</d:getcontentlength>
              </d:prop>
            </d:propstat>
          </d:response>
          <d:response>
            <d:href>/music/deep/</d:href>
            <d:propstat><d:prop><d:getetag>"deep"</d:getetag></d:prop></d:propstat>
          </d:response>
        </d:multistatus>`
      }
      if (pathOrUri === '/music/deep/') {
        resolveNestedRequest()
        await nestedBlocked
        return `<?xml version="1.0"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/music/deep/</d:href>
            <d:propstat><d:prop><d:getetag>"deep"</d:getetag></d:prop></d:propstat>
          </d:response>
          <d:response>
            <d:href>/music/deep/theme.flac</d:href>
            <d:propstat>
              <d:prop>
                <d:getetag>"theme"</d:getetag>
                <d:getlastmodified>Sat, 05 Apr 2026 11:00:00 GMT</d:getlastmodified>
                <d:getcontentlength>1000</d:getcontentlength>
              </d:prop>
            </d:propstat>
          </d:response>
        </d:multistatus>`
      }
      return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" />`
    },
    async downloadFile() {},
    async readMetadata() { return null },
  })

  const streamPromise = provider.streamEnumerateSelection({
    connectionId: 'conn_1',
    providerType: 'webdav',
  }, {
    directories: [{ selectionId: 'dir_1', kind: 'directory', pathOrUri: '/music/', displayName: 'music' }],
    tracks: [],
  }, async batch => {
    batches.push(batch.map(item => item.pathOrUri))
  })

  await nestedRequested
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(batches, [['/music/test.mp3']])

  releaseNestedDirectory()
  const result = await streamPromise
  assert.deepEqual(result.items.map(item => item.pathOrUri), [
    '/music/test.mp3',
    '/music/deep/theme.flac',
  ])
})

test('createWebdavProvider enumerateSelection stays lightweight and avoids metadata downloads', async() => {
  let downloadCount = 0
  let metadataCount = 0
  const provider = createWebdavProvider({
    async request() {
      return `<?xml version="1.0"?>
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/music/albums/</d:href>
          <d:propstat><d:prop><d:getetag>"dir"</d:getetag></d:prop></d:propstat>
        </d:response>
        <d:response>
          <d:href>/music/albums/test.mp3</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"abc"</d:getetag>
              <d:getlastmodified>Sat, 05 Apr 2026 10:00:00 GMT</d:getlastmodified>
              <d:getcontentlength>321</d:getcontentlength>
            </d:prop>
          </d:propstat>
        </d:response>
      </d:multistatus>`
    },
    async downloadFile() {
      downloadCount += 1
      return null
    },
    async readMetadata() {
      metadataCount += 1
      return null
    },
  })

  const result = await provider.enumerateSelection({
    connectionId: 'conn_1',
    providerType: 'webdav',
  }, {
    directories: [{ selectionId: 'dir_1', kind: 'directory', pathOrUri: '/music/albums/', displayName: 'albums' }],
    tracks: [],
  })

  assert.deepEqual(result.items, [{
    sourceStableKey: '/music/albums/test.mp3',
    connectionId: 'conn_1',
    providerType: 'webdav',
    pathOrUri: '/music/albums/test.mp3',
    fileName: 'test.mp3',
    fileSize: 321,
    modifiedTime: Date.parse('Sat, 05 Apr 2026 10:00:00 GMT'),
    versionToken: '"abc"',
    metadataLevelReached: 0,
  }])
  assert.equal(downloadCount, 0)
  assert.equal(metadataCount, 0)
})

test('createWebdavProvider hydrateCandidate falls back to temp-file metadata when hints are incomplete', async() => {
  const calls = []
  const provider = createWebdavProvider({
    async request() {
      return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" />`
    },
    async downloadFile(connection, uri, savePath) {
      calls.push(['download', connection.connectionId, uri, savePath])
      return savePath
    },
    async readMetadata(localPath) {
      calls.push(['metadata', localPath])
      return {
        name: 'WebDAV Song',
        singer: 'WebDAV Singer',
        albumName: 'WebDAV Album',
        interval: 222,
      }
    },
    createTempFilePath(fileName) {
      calls.push(['temp', fileName])
      return `/tmp/${fileName}`
    },
    async removeTempFile(localPath) {
      calls.push(['cleanup', localPath])
    },
  })

  const result = await provider.hydrateCandidate({
    connectionId: 'conn_1',
    providerType: 'webdav',
  }, {
    sourceStableKey: '/music/test.mp3',
    pathOrUri: '/music/test.mp3',
    fileName: 'test.mp3',
    versionToken: '"abc"',
    metadataHints: {
      title: 'test',
      artist: '',
      album: '',
      durationSec: 0,
    },
  }, {
    attempt: 1,
  })

  assert.deepEqual(result, {
    candidate: {
      sourceStableKey: '/music/test.mp3',
      pathOrUri: '/music/test.mp3',
      fileName: 'test.mp3',
      versionToken: '"abc"',
      metadataHints: {
        title: 'test',
        artist: '',
        album: '',
        durationSec: 0,
      },
    },
    metadata: {
      title: 'WebDAV Song',
      artist: 'WebDAV Singer',
      album: 'WebDAV Album',
      durationSec: 222,
    },
    metadataLevelReached: 1,
  })
  assert.deepEqual(calls, [
    ['temp', 'test.mp3'],
    ['download', 'conn_1', '/music/test.mp3', '/tmp/test.mp3'],
    ['metadata', '/tmp/test.mp3'],
    ['cleanup', '/tmp/test.mp3'],
  ])
})
