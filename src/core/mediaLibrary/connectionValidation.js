const { browseConnection } = require('./browse.js')

function trimValue(value) {
  return String(value ?? '').trim()
}

function normalizeDraftCredential(draft = {}) {
  const credentials = draft.credentials || {}
  switch (draft.providerType) {
    case 'smb':
      return {
        host: trimValue(credentials.host),
        share: trimValue(credentials.share),
        username: trimValue(credentials.username),
        password: String(credentials.password ?? ''),
      }
    case 'webdav':
      return {
        username: trimValue(credentials.username),
        password: String(credentials.password ?? ''),
      }
    case 'onedrive':
      return {
        accountId: trimValue(credentials.accountId),
        username: trimValue(credentials.username),
        authority: trimValue(credentials.authority),
      }
    case 'local':
    default:
      return {}
  }
}

function createConnectionDraftValidationKey(draft = {}) {
  return JSON.stringify({
    providerType: draft.providerType || 'local',
    rootPathOrUri: trimValue(draft.rootPathOrUri),
    credentials: normalizeDraftCredential(draft),
  })
}

function createConnectionFromDraft(draft = {}) {
  return {
    connectionId: draft.connectionId?.trim() || '__media_connection_validation__',
    providerType: draft.providerType || 'local',
    displayName: trimValue(draft.displayName) || trimValue(draft.rootPathOrUri) || '__media_connection_validation__',
    rootPathOrUri: draft.providerType === 'onedrive' ? '/' : trimValue(draft.rootPathOrUri),
    credentialRef: draft.providerType === 'local' ? null : '__media_connection_validation__',
  }
}

async function validateConnectionDraft(draft, {
  createRegistry = repository => require('./runtimeRegistry.js').createMediaLibraryRuntimeRegistry(repository),
} = {}) {
  const connection = createConnectionFromDraft(draft)
  const registry = createRegistry({
    async getCredential(credentialRef) {
      if (credentialRef !== connection.credentialRef) return null
      return draft.credentials || {}
    },
  })

  await browseConnection(registry, connection, connection.rootPathOrUri)
  return connection
}

module.exports = {
  createConnectionDraftValidationKey,
  createConnectionFromDraft,
  normalizeDraftCredential,
  validateConnectionDraft,
}
