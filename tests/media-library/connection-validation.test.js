const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createConnectionDraftValidationKey,
  validateConnectionDraft,
} = require('../../src/core/mediaLibrary/connectionValidation.js')

test('connection validation key ignores display name but tracks real connection params', () => {
  const baseDraft = {
    providerType: 'webdav',
    displayName: 'NAS Music',
    rootPathOrUri: 'http://192.168.2.190:5244/dav/tb/Music',
    credentials: {
      username: 'admin',
      password: 'secret',
    },
  }

  assert.equal(
    createConnectionDraftValidationKey(baseDraft),
    createConnectionDraftValidationKey({
      ...baseDraft,
      displayName: 'Another Label',
    }),
  )
  assert.notEqual(
    createConnectionDraftValidationKey(baseDraft),
    createConnectionDraftValidationKey({
      ...baseDraft,
      credentials: {
        username: 'admin',
        password: 'other-secret',
      },
    }),
  )
  assert.notEqual(
    createConnectionDraftValidationKey(baseDraft),
    createConnectionDraftValidationKey({
      ...baseDraft,
      rootPathOrUri: 'http://192.168.2.190:5244/dav/tb/Other',
    }),
  )

  const oneDriveDraft = {
    providerType: 'onedrive',
    displayName: 'OneDrive',
    rootPathOrUri: '/',
    credentials: {
      accountId: 'account_1',
      username: 'user@tenant.com',
      authority: 'https://login.microsoftonline.com/common',
    },
  }

  assert.notEqual(
    createConnectionDraftValidationKey(oneDriveDraft),
    createConnectionDraftValidationKey({
      ...oneDriveDraft,
      credentials: {
        ...oneDriveDraft.credentials,
        accountId: 'account_2',
      },
    }),
  )
})

test('validateConnectionDraft browses the draft root with temporary credentials', async() => {
  const calls = []

  await validateConnectionDraft({
    providerType: 'webdav',
    displayName: 'TB Music',
    rootPathOrUri: 'http://192.168.2.190:5244/dav/tb/Music',
    credentials: {
      username: 'admin',
      password: 'secret',
    },
  }, {
    createRegistry(repository) {
      return {
        get(providerType) {
          assert.equal(providerType, 'webdav')
          return {
            async browseConnection(connection, pathOrUri) {
              calls.push({
                connection,
                pathOrUri,
                credential: await repository.getCredential(connection.credentialRef),
              })
              return []
            },
          }
        },
      }
    },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].connection.providerType, 'webdav')
  assert.equal(calls[0].pathOrUri, 'http://192.168.2.190:5244/dav/tb/Music')
  assert.deepEqual(calls[0].credential, {
    username: 'admin',
    password: 'secret',
  })
})

test('validateConnectionDraft supports onedrive account binding credentials', async() => {
  const calls = []

  await validateConnectionDraft({
    providerType: 'onedrive',
    displayName: 'OneDrive Business',
    rootPathOrUri: '/',
    credentials: {
      accountId: 'account_1',
      username: 'user@example.com',
      authority: 'https://login.microsoftonline.com/common',
    },
  }, {
    createRegistry(repository) {
      return {
        get(providerType) {
          assert.equal(providerType, 'onedrive')
          return {
            async browseConnection(connection, pathOrUri) {
              calls.push({
                connection,
                pathOrUri,
                credential: await repository.getCredential(connection.credentialRef),
              })
              return []
            },
          }
        },
      }
    },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].connection.providerType, 'onedrive')
  assert.equal(calls[0].pathOrUri, '/')
  assert.deepEqual(calls[0].credential, {
    accountId: 'account_1',
    username: 'user@example.com',
    authority: 'https://login.microsoftonline.com/common',
  })
})
