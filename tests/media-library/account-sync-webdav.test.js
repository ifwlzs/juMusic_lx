const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  buildAccountSyncRemoteFilePath,
  ensureAccountSyncRemoteDir,
  validateAccountSyncProfile,
  uploadAccountSyncEnvelope,
} = require('../../src/screens/Home/Views/Setting/settings/Backup/accountSyncWebdav.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('buildAccountSyncRemoteFilePath builds fixed latest path for root and sub dirs', () => {
  assert.equal(
    buildAccountSyncRemoteFilePath('/Apps/juMusicSync'),
    '/Apps/juMusicSync/jumusic-sync/account-sync.latest.json',
  )
  assert.equal(
    buildAccountSyncRemoteFilePath('/'),
    '/jumusic-sync/account-sync.latest.json',
  )
})

test('validateAccountSyncProfile uses PROPFIND sequence and returns willCreateRemoteDir flags', async() => {
  const existCalls = []
  const existResult = await validateAccountSyncProfile({
    remoteDir: '/Apps/juMusicSync',
  }, {
    async requestWebdav(input) {
      existCalls.push(`${input.method} ${input.path}`)
      return { status: 207 }
    },
  })
  assert.deepEqual(existCalls, ['PROPFIND /Apps/juMusicSync'])
  assert.deepEqual(existResult, { willCreateRemoteDir: false })

  const createCalls = []
  const createResult = await validateAccountSyncProfile({
    remoteDir: '/Apps/juMusicSync',
  }, {
    async requestWebdav(input) {
      createCalls.push(`${input.method} ${input.path}`)
      if (createCalls.length === 1) return { status: 404 }
      return { status: 207 }
    },
  })
  assert.deepEqual(createCalls, [
    'PROPFIND /Apps/juMusicSync',
    'PROPFIND /Apps',
  ])
  assert.deepEqual(createResult, { willCreateRemoteDir: true })
})

test('validateAccountSyncProfile maps unreachable errors', async() => {
  await assert.rejects(
    validateAccountSyncProfile({ remoteDir: '/Apps/juMusicSync' }, {
      async requestWebdav() {
        return { status: 500 }
      },
    }),
    /account_sync_remote_dir_unreachable/,
  )

  await assert.rejects(
    validateAccountSyncProfile({ remoteDir: '/Apps/juMusicSync' }, {
      async requestWebdav(input) {
        if (input.path === '/Apps/juMusicSync') return { status: 404 }
        return { status: 500 }
      },
    }),
    /account_sync_remote_dir_parent_unreachable/,
  )
})

test('uploadAccountSyncEnvelope runs ensure then PUT with fixed latest file path', async() => {
  const calls = []
  const profile = {
    serverUrl: 'https://example.com/webdav/',
    username: 'demo',
    password: 'secret',
    remoteDir: '/Apps/juMusicSync',
  }

  await uploadAccountSyncEnvelope(profile, '{"x":1}', {
    async requestWebdav(input) {
      calls.push(`${input.method} ${input.path}`)
      switch (`${input.method} ${input.path}`) {
        case 'PROPFIND /Apps':
          return { status: 404 }
        case 'MKCOL /Apps':
          return { status: 201 }
        case 'PROPFIND /Apps/juMusicSync':
          return { status: 404 }
        case 'MKCOL /Apps/juMusicSync':
          return { status: 201 }
        case 'PROPFIND /Apps/juMusicSync/jumusic-sync':
          return { status: 404 }
        case 'MKCOL /Apps/juMusicSync/jumusic-sync':
          return { status: 201 }
        case 'PUT /Apps/juMusicSync/jumusic-sync/account-sync.latest.json':
          return { status: 201 }
        default:
          throw new Error(`unexpected_call:${input.method} ${input.path}`)
      }
    },
  })

  assert.deepEqual(calls, [
    'PROPFIND /Apps',
    'MKCOL /Apps',
    'PROPFIND /Apps/juMusicSync',
    'MKCOL /Apps/juMusicSync',
    'PROPFIND /Apps/juMusicSync/jumusic-sync',
    'MKCOL /Apps/juMusicSync/jumusic-sync',
    'PUT /Apps/juMusicSync/jumusic-sync/account-sync.latest.json',
  ])
})

test('ensureAccountSyncRemoteDir maps non-404 PROPFIND and invalid MKCOL status to create_failed', async() => {
  await assert.rejects(
    ensureAccountSyncRemoteDir({ remoteDir: '/Apps/juMusicSync' }, {
      async requestWebdav(input) {
        if (input.method === 'PROPFIND' && input.path === '/Apps') return { status: 500 }
        return { status: 207 }
      },
    }),
    /account_sync_remote_dir_create_failed/,
  )

  await assert.rejects(
    ensureAccountSyncRemoteDir({ remoteDir: '/Apps/juMusicSync' }, {
      async requestWebdav(input) {
        if (input.method === 'PROPFIND') return { status: 404 }
        if (input.method === 'MKCOL') return { status: 409 }
        return { status: 500 }
      },
    }),
    /account_sync_remote_dir_create_failed/,
  )
})

test('uploadAccountSyncEnvelope maps PUT non-success status to account_sync_upload_failed', async() => {
  await assert.rejects(
    uploadAccountSyncEnvelope({ remoteDir: '/Apps/juMusicSync' }, '{"x":1}', {
      async requestWebdav(input) {
        if (input.method === 'PROPFIND') return { status: 207 }
        if (input.method === 'PUT') return { status: 500 }
        return { status: 201 }
      },
    }),
    /account_sync_upload_failed/,
  )
})

test('actions.ts exposes account sync handlers and upload pipeline contracts', () => {
  const actionsFile = readFile('src/screens/Home/Views/Setting/settings/Backup/actions.ts')
  assert.match(actionsFile, /loadAccountSyncState/)
  assert.match(actionsFile, /saveAccountSyncState/)
  assert.match(actionsFile, /getAccountSyncErrorMessage/)
  assert.match(actionsFile, /handleValidateAccountSyncProfile/)
  assert.match(actionsFile, /handleUploadAccountSync/)
  assert.match(actionsFile, /storageDataPrefix\.accountSync/)
  assert.match(actionsFile, /buildAccountSyncPayload\(/)
  assert.match(actionsFile, /createAccountSyncEncryptedEnvelope\(/)
  assert.match(actionsFile, /uploadAccountSyncEnvelope\(/)
  assert.match(actionsFile, /setting_backup_account_sync_upload_tip_running/)
  assert.match(actionsFile, /setting_backup_account_sync_validate_success_new_dir/)
})
