const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  createKeyBuilder,
  createMediaLibraryRepository,
} = require('../../src/core/mediaLibrary/repository.js')
const {
  resolveConnectionCredential,
} = require('../../src/core/mediaLibrary/credentials.js')
const {
  seedMediaLibraryConnections,
} = require('../../src/core/mediaLibrary/devSeed.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

const createMemoryStorage = () => {
  const map = new Map()
  return {
    async get(key) { return map.has(key) ? map.get(key) : null },
    async set(key, value) { map.set(key, value) },
    async remove(key) { map.delete(key) },
  }
}

test('createKeyBuilder 生成稳定的 credential key', () => {
  const keys = createKeyBuilder('@media_library__')
  assert.equal(keys.credentials('cred_1'), '@media_library__credential__cred_1')
})

test('repository 按 credentialRef 独立读写凭据正文', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveCredential('cred_1', {
    username: 'alice',
    password: 'secret',
    ignored: 'nope',
  })

  assert.deepEqual(await repo.getCredential('cred_1'), {
    username: 'alice',
    password: 'secret',
  })

  await repo.removeCredential('cred_1')
  assert.equal(await repo.getCredential('cred_1'), null)
})

test('resolveConnectionCredential 通过 credentialRef 解析正文', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveCredential('cred_webdav', {
    username: 'admin',
    password: 'pw',
  })

  assert.deepEqual(await resolveConnectionCredential({
    connectionId: 'conn_webdav',
    credentialRef: 'cred_webdav',
  }, repo), {
    username: 'admin',
    password: 'pw',
  })

  assert.equal(await resolveConnectionCredential({
    connectionId: 'conn_none',
    credentialRef: null,
  }, repo), null)
})

test('seedMediaLibraryConnections 分离保存 connection 和 credential 正文', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await seedMediaLibraryConnections(repo, [{
    connection: {
      connectionId: 'conn_webdav_tb_music',
      providerType: 'webdav',
      displayName: 'TB Music',
      rootPathOrUri: 'http://192.168.2.190:5244/dav/tb/Music',
      credentialRef: 'cred_webdav_tb_music',
      lastScanStatus: 'idle',
    },
    credential: {
      username: 'admin',
      password: 'wlzs.39@qq.com',
    },
  }])

  const connections = await repo.getConnections()
  assert.equal(connections.length, 1)
  assert.equal(connections[0].credentialRef, 'cred_webdav_tb_music')
  assert.equal('credentials' in connections[0], false)
  assert.deepEqual(await repo.getCredential('cred_webdav_tb_music'), {
    username: 'admin',
    password: 'wlzs.39@qq.com',
  })
})

test('media library dev seed 挂到 init 且提供 adb push helper script', () => {
  const initFile = readFile('src/core/init/index.ts')

  assert.match(initFile, /initMediaLibrary/)
  assert.equal(fs.existsSync(path.resolve(__dirname, '../../scripts/media-library/push-dev-seed.ps1')), true)
})
