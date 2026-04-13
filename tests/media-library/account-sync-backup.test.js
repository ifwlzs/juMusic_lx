const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  buildAccountSyncPayload,
  createAccountSyncValidationKey,
  createEmptyAccountSyncState,
  normalizeAccountSyncProfile,
  normalizeAccountSyncState,
  normalizeRemoteDir,
} = require('../../src/screens/Home/Views/Setting/settings/Backup/accountSync.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('storageDataPrefix exposes accountSync key', () => {
  const constantFile = readFile('src/config/constant.ts')
  assert.match(constantFile, /accountSync:\s*'@account_sync'/)
})

test('normalizeRemoteDir returns normalized absolute directory form', () => {
  assert.equal(normalizeRemoteDir('  \\Music\\Albums//Pop  '), '/Music/Albums/Pop/')
  assert.equal(normalizeRemoteDir('/'), '/')
  assert.equal(normalizeRemoteDir(''), '/')
})

test('normalizeAccountSyncProfile trims string fields and normalizes serverUrl/remoteDir', () => {
  const profile = normalizeAccountSyncProfile({
    serverUrl: '  https://example.com/webdav  ',
    remoteDir: ' \\backup\\juMusic//daily ',
    username: '  demo_user  ',
    customTag: '  hello  ',
    enabled: true,
  })

  assert.equal(profile.serverUrl, 'https://example.com/webdav/')
  assert.equal(profile.remoteDir, '/backup/juMusic/daily/')
  assert.equal(profile.username, 'demo_user')
  assert.equal(profile.customTag, 'hello')
  assert.equal(profile.enabled, true)
})

test('normalizeAccountSyncState limits status to idle/success/failed', () => {
  assert.equal(normalizeAccountSyncState({ status: 'idle' }).status, 'idle')
  assert.equal(normalizeAccountSyncState({ status: 'success' }).status, 'success')
  assert.equal(normalizeAccountSyncState({ status: 'failed' }).status, 'failed')
  assert.equal(normalizeAccountSyncState({ status: 'running' }).status, 'idle')
})

test('createEmptyAccountSyncState returns an idle state baseline', () => {
  assert.deepEqual(createEmptyAccountSyncState(), {
    status: 'idle',
    validationKey: '',
    updatedAt: null,
    message: '',
  })
})

test('createAccountSyncValidationKey is stable across equivalent profile inputs', () => {
  const keyA = createAccountSyncValidationKey({
    serverUrl: 'https://example.com/webdav',
    remoteDir: 'backup/list',
    username: ' demo ',
  })
  const keyB = createAccountSyncValidationKey({
    serverUrl: ' https://example.com/webdav/ ',
    remoteDir: '/backup/list/',
    username: 'demo',
  })

  assert.equal(keyA, keyB)
})

test('buildAccountSyncPayload only exports settings and sanitized media source data', async() => {
  const credentialCalls = []
  const credentials = {
    cred_1: {
      username: 'admin',
      password: 'secret',
      ignoreMe: true,
    },
  }
  const repository = {
    async getConnections() {
      return [{
        connectionId: 'conn_1',
        providerType: 'webdav',
        displayName: 'NAS',
        rootPathOrUri: '/Music',
        credentialRef: 'cred_1',
        lastScanAt: 123,
        hidden: true,
      }, {
        connectionId: 'conn_2',
        providerType: 'local',
        displayName: 'Phone',
        rootPathOrUri: '/storage/emulated/0/Music',
        credentialRef: null,
        extra: 'x',
      }, {
        connectionId: 'conn_3',
        providerType: 'smb',
        displayName: 'SMB',
        rootPathOrUri: '/share',
        credentialRef: 'missing_ref',
      }]
    },
    async getImportRules() {
      return [{
        ruleId: 'rule_1',
        connectionId: 'conn_1',
        name: 'Albums',
        mode: 'merged',
        directories: [{
          selectionId: 'dir_1',
          kind: 'directory',
          pathOrUri: '/Albums',
          displayName: 'Albums',
          ignored: 'x',
        }],
        tracks: [{
          selectionId: 'track_1',
          kind: 'track',
          pathOrUri: '/Singles/song.mp3',
          displayName: 'song.mp3',
          ignored: 'y',
        }],
        generatedListIds: ['not_exported'],
      }]
    },
    async getCredential(credentialRef) {
      credentialCalls.push(credentialRef)
      return credentials[credentialRef] ?? null
    },
  }

  const payload = await buildAccountSyncPayload({
    settings: {
      enable: true,
      profile: {
        serverUrl: 'https://example.com/webdav/',
      },
    },
    repository,
  })

  assert.deepEqual(Object.keys(payload).sort(), ['mediaSource', 'settings'])
  assert.deepEqual(payload.settings, {
    enable: true,
    profile: {
      serverUrl: 'https://example.com/webdav/',
    },
  })
  assert.deepEqual(payload.mediaSource, {
    connections: [{
      connectionId: 'conn_1',
      providerType: 'webdav',
      displayName: 'NAS',
      rootPathOrUri: '/Music',
      credentialRef: 'cred_1',
    }, {
      connectionId: 'conn_2',
      providerType: 'local',
      displayName: 'Phone',
      rootPathOrUri: '/storage/emulated/0/Music',
      credentialRef: null,
    }, {
      connectionId: 'conn_3',
      providerType: 'smb',
      displayName: 'SMB',
      rootPathOrUri: '/share',
      credentialRef: 'missing_ref',
    }],
    credentials: {
      cred_1: {
        username: 'admin',
        password: 'secret',
        ignoreMe: true,
      },
    },
    importRules: [{
      ruleId: 'rule_1',
      connectionId: 'conn_1',
      name: 'Albums',
      mode: 'merged',
      directories: [{
        selectionId: 'dir_1',
        kind: 'directory',
        pathOrUri: '/Albums',
        displayName: 'Albums',
      }],
      tracks: [{
        selectionId: 'track_1',
        kind: 'track',
        pathOrUri: '/Singles/song.mp3',
        displayName: 'song.mp3',
      }],
    }],
  })
  assert.deepEqual(credentialCalls, ['cred_1', 'missing_ref'])
})