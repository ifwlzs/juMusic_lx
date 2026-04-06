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
