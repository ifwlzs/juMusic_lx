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
  assert.equal(normalizeRemoteDir('  \\Music\\Albums//Pop  '), '/Music/Albums/Pop')
  assert.equal(normalizeRemoteDir(' /Apps/juMusicSync/ '), '/Apps/juMusicSync')
  assert.equal(normalizeRemoteDir('/'), '/')
  assert.equal(normalizeRemoteDir(''), '/')
})

test('normalizeAccountSyncProfile trims profile fields and normalizes serverUrl/remoteDir', () => {
  const profile = normalizeAccountSyncProfile({
    displayName: '  Home NAS ',
    serverUrl: '  https://example.com/webdav  ',
    remoteDir: ' \\backup\\juMusic//daily ',
    username: '  demo_user  ',
    password: '  secret  ',
  })

  assert.deepEqual(profile, {
    displayName: 'Home NAS',
    serverUrl: 'https://example.com/webdav/',
    remoteDir: '/backup/juMusic/daily',
    username: 'demo_user',
    password: 'secret',
  })
})

test('normalizeAccountSyncState keeps canonical structure and limits lastUploadStatus to idle/success/failed', () => {
  const normalized = normalizeAccountSyncState({
    version: 2,
    profile: {
      displayName: '  Home NAS ',
      serverUrl: ' https://example.com/webdav ',
      username: ' demo ',
      password: ' secret ',
      remoteDir: ' /Apps/juMusicSync/ ',
    },
    validationKey: 'key_1',
    lastValidatedAt: 100,
    lastUploadAt: 200,
    lastUploadStatus: 'running',
    lastUploadMessage: '  failed ',
    extraField: 'should_not_exist',
  })

  assert.deepEqual(normalized, {
    version: 1,
    profile: {
      displayName: 'Home NAS',
      serverUrl: 'https://example.com/webdav/',
      username: 'demo',
      password: 'secret',
      remoteDir: '/Apps/juMusicSync',
    },
    validationKey: 'key_1',
    lastValidatedAt: 100,
    lastUploadAt: 200,
    lastUploadStatus: 'idle',
    lastUploadMessage: 'failed',
  })
})

test('createEmptyAccountSyncState returns an idle state baseline', () => {
  assert.deepEqual(createEmptyAccountSyncState(), {
    version: 1,
    profile: {
      displayName: '',
      serverUrl: '',
      username: '',
      password: '',
      remoteDir: '/',
    },
    validationKey: null,
    lastValidatedAt: null,
    lastUploadAt: null,
    lastUploadStatus: 'idle',
    lastUploadMessage: '',
  })
})

test('createAccountSyncValidationKey is stable across equivalent profile inputs', () => {
  const keyA = createAccountSyncValidationKey({
    serverUrl: 'https://example.com/webdav',
    remoteDir: 'backup/list',
    username: ' demo ',
    password: ' secret ',
  })
  const keyB = createAccountSyncValidationKey({
    serverUrl: ' https://example.com/webdav/ ',
    remoteDir: '/backup/list/',
    username: 'demo',
    password: 'secret',
  })

  assert.equal(keyA, keyB)
  assert.equal(keyA, JSON.stringify({
    serverUrl: 'https://example.com/webdav/',
    username: 'demo',
    password: 'secret',
    remoteDir: '/backup/list',
  }))
})

test('buildAccountSyncPayload exports accountSyncPlain_v1 with appVersion/exportedAt/settings/sanitized media source', async() => {
  const credentialCalls = []
  const credentials = {
    cred_1: {
      username: 'admin',
      password: 'secret',
      meta: { region: 'cn' },
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
    appVersion: '2.9.0',
    exportedAt: 1711111111111,
    settings: {
      enable: true,
      profile: {
        serverUrl: 'https://example.com/webdav/',
      },
    },
    repository,
  })

  assert.deepEqual(Object.keys(payload).sort(), ['appVersion', 'exportedAt', 'mediaSource', 'settings', 'type'])
  assert.equal(payload.type, 'accountSyncPlain_v1')
  assert.equal(payload.appVersion, '2.9.0')
  assert.equal(payload.exportedAt, 1711111111111)
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
        meta: { region: 'cn' },
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
  assert.notEqual(payload.mediaSource.credentials.cred_1, credentials.cred_1)
  credentials.cred_1.meta.region = 'us'
  assert.equal(payload.mediaSource.credentials.cred_1.meta.region, 'cn')
})
