const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { buildWebdavHeaders, buildWebdavUrl } = require('../../src/core/mediaLibrary/webdav.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('buildWebdavHeaders falls back to btoa when Buffer is unavailable', () => {
  const originalBuffer = global.Buffer
  const originalBtoa = global.btoa
  const inputs = []

  try {
    global.Buffer = undefined
    global.btoa = value => {
      inputs.push(value)
      return 'dXNlcjpwYXNz'
    }

    assert.deepEqual(buildWebdavHeaders({
      username: 'user',
      password: 'pass',
    }), {
      Authorization: 'Basic dXNlcjpwYXNz',
    })
  } finally {
    global.Buffer = originalBuffer
    global.btoa = originalBtoa
  }

  assert.deepEqual(inputs, ['user:pass'])
})

test('buildWebdavUrl resolves relative and absolute child paths against the configured root', () => {
  assert.equal(
    buildWebdavUrl('http://example.com/dav/root', 'Albums/'),
    'http://example.com/dav/root/Albums/',
  )
  assert.equal(
    buildWebdavUrl('http://example.com/dav/root', '/dav/root/Albums/track.mp3'),
    'http://example.com/dav/root/Albums/track.mp3',
  )
})

test('buildWebdavUrl still resolves absolute child paths when URL constructor is unavailable', () => {
  const originalUrl = global.URL

  try {
    global.URL = undefined

    assert.equal(
      buildWebdavUrl('http://192.168.2.190:5244/dav/tb', '/dav/tb/Music'),
      'http://192.168.2.190:5244/dav/tb/Music',
    )
  } finally {
    global.URL = originalUrl
  }
})

test('runtime registry sends PROPFIND without request body and wraps fetch failures with context', () => {
  const file = readFile('src/core/mediaLibrary/runtimeRegistry.js')

  assert.doesNotMatch(file, /body:\s*method === 'PROPFIND'/)
  assert.match(file, /webdav request .* failed/i)
})

test('runtime registry no longer stubs smb and webdav remote metadata reads as null', () => {
  const file = readFile('src/core/mediaLibrary/runtimeRegistry.js')

  assert.doesNotMatch(file, /const smbProvider = createSmbProvider\([\s\S]+?async readMetadata\(\)\s*\{\s*return null\s*\}/)
  assert.doesNotMatch(file, /const webdavProvider = createWebdavProvider\([\s\S]+?async downloadFile\(\)\s*\{\s*return null\s*\}/)
  assert.match(file, /temporaryDirectoryPath/)
  assert.match(file, /downloadFile/)
  assert.match(file, /readMetadata/)
})

test('runtime registry 默认开启 WebDAV 同步补元数据并保持扫描轻量', () => {
  const file = readFile('src/core/mediaLibrary/runtimeRegistry.js')

  // 中文注释：Node 侧无法直接执行 React Native 的 utils 依赖，因此这里锁定运行时装配配置，
  // 避免 WebDAV provider 在真实同步链路里继续禁用远端 metadata hydrate，同时守住 scan 轻量策略。
  assert.match(file, /const webdavProvider = createWebdavProvider\([\s\S]+?hydrateMetadataOnSync:\s*true,/)
  assert.match(file, /const webdavProvider = createWebdavProvider\([\s\S]+?hydrateMetadataOnScan:\s*false,/)
  assert.doesNotMatch(file, /const webdavProvider = createWebdavProvider\([\s\S]+?hydrateMetadataOnSync:\s*false,/)
})
