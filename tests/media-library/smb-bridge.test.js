const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('MainApplication 注册 SMB package', () => {
  const content = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java')
  assert.match(content, /SmbPackage/)
  assert.match(content, /packages\.add\(new SmbPackage\(\)\)/)
})

test('app build.gradle 引入 SMBJ 依赖', () => {
  const content = readFile('android/app/build.gradle')
  assert.match(content, /com\.hierynomus:smbj/)
})

test('SmbModule 下载实现避免使用 minSdk 21 不兼容的 transferTo', () => {
  const content = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/smb/SmbModule.java')
  assert.doesNotMatch(content, /transferTo\s*\(/)
})

test('smb.ts 导出 SMB NativeModules 包装方法', () => {
  const content = readFile('src/utils/nativeModules/smb.ts')
  assert.match(content, /NativeModules/)
  assert.match(content, /SmbModule/)
  assert.match(content, /listSmbDirectory/)
  assert.match(content, /downloadSmbFile/)
})

test('buildSmbVersionToken 优先组合修改时间和大小并保留路径身份', () => {
  const { buildSmbVersionToken } = require('../../src/core/mediaLibrary/versionToken.js')

  assert.equal(
    buildSmbVersionToken({
      pathOrUri: '/music/qilixiang.mp3',
      fileSize: 123,
      modifiedTime: 1700000000000,
    }),
    '1700000000000__123__/music/qilixiang.mp3',
  )
})

test('createSmbProvider 递归扫描 SMB 目录并转发下载', async() => {
  const { createSmbProvider } = require('../../src/core/mediaLibrary/providers/smb.js')

  const now = 1700000000999
  const originalNow = Date.now
  Date.now = () => now

  const listCalls = []
  const downloadCalls = []
  const listDirectory = async(connection, pathOrUri) => {
    listCalls.push([connection.connectionId, pathOrUri])
    if (pathOrUri === '/music') {
      return [
        { path: '/music/a.mp3', name: 'a.mp3', isDirectory: false, size: 10, modifiedTime: 1700000000001 },
        { path: '/music/nested', name: 'nested', isDirectory: true },
        { path: '/music/cover.jpg', name: 'cover.jpg', isDirectory: false, size: 1, modifiedTime: 1700000000002 },
      ]
    }
    if (pathOrUri === '/music/nested') {
      return [
        { path: '/music/nested/b.flac', name: 'b.flac', isDirectory: false, size: 20, modifiedTime: 1700000000003 },
      ]
    }
    return []
  }
  const readMetadata = async(pathOrUri) => {
    if (pathOrUri === '/music/a.mp3') {
      return { name: '七里香', singer: '周杰伦', albumName: '七里香', interval: 300 }
    }
    throw new Error('bad metadata')
  }
  const downloadFile = async(connection, pathOrUri, savePath) => {
    downloadCalls.push([connection.connectionId, pathOrUri, savePath])
    return 'downloaded'
  }

  const provider = createSmbProvider({ listDirectory, readMetadata, downloadFile })
  const connection = { connectionId: 'conn_1', rootPathOrUri: '/music' }
  const result = await provider.scanConnection(connection)

  assert.deepEqual(listCalls, [['conn_1', '/music'], ['conn_1', '/music/nested']])
  assert.deepEqual(result.summary, { success: 1, failed: 1, skipped: 1 })
  assert.equal(result.items.length, 2)

  const successItem = result.items.find(item => item.pathOrUri === '/music/a.mp3')
  assert.equal(successItem.sourceItemId, 'conn_1__/music/a.mp3')
  assert.equal(successItem.providerType, 'smb')
  assert.equal(successItem.title, '七里香')
  assert.equal(successItem.artist, '周杰伦')
  assert.equal(successItem.album, '七里香')
  assert.equal(successItem.durationSec, 300)
  assert.equal(successItem.fileSize, 10)
  assert.equal(successItem.versionToken, '1700000000001__10__/music/a.mp3')
  assert.equal(successItem.lastSeenAt, now)
  assert.equal(successItem.scanStatus, 'success')

  const failedItem = result.items.find(item => item.pathOrUri === '/music/nested/b.flac')
  assert.equal(failedItem.scanStatus, 'failed')
  assert.match(failedItem.scanError, /bad metadata/)
  assert.equal(failedItem.versionToken, '1700000000003__20__/music/nested/b.flac')

  const downloadResult = await provider.downloadToCache(connection, successItem, '/cache/a.mp3')
  assert.equal(downloadResult, 'downloaded')
  assert.deepEqual(downloadCalls, [['conn_1', '/music/a.mp3', '/cache/a.mp3']])

  Date.now = originalNow
})
