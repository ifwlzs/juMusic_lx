const VALID_SYNC_STATUS = new Set(['idle', 'success', 'failed'])

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : value
}

function toRecord(entries = []) {
  return Object.fromEntries(entries.filter(Boolean))
}

function normalizeServerUrl(serverUrl = '') {
  const nextValue = typeof serverUrl === 'string' ? serverUrl.trim() : ''
  if (!nextValue) return ''
  return nextValue.endsWith('/') ? nextValue : `${nextValue}/`
}

function normalizeRemoteDir(remoteDir = '') {
  const nextValue = typeof remoteDir === 'string' ? remoteDir.trim() : ''
  if (!nextValue) return '/'

  const normalized = nextValue
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  if (!segments.length) return '/'

  return `/${segments.join('/')}/`
}

function normalizeSelection(selection = {}) {
  return {
    selectionId: selection.selectionId,
    kind: selection.kind,
    pathOrUri: selection.pathOrUri,
    displayName: selection.displayName,
  }
}

function normalizeConnection(connection = {}) {
  return {
    connectionId: connection.connectionId,
    providerType: connection.providerType,
    displayName: connection.displayName,
    rootPathOrUri: connection.rootPathOrUri,
    credentialRef: connection.credentialRef ?? null,
  }
}

function normalizeImportRule(rule = {}) {
  return {
    ruleId: rule.ruleId,
    connectionId: rule.connectionId,
    name: rule.name,
    mode: rule.mode,
    directories: Array.isArray(rule.directories) ? rule.directories.map(normalizeSelection) : [],
    tracks: Array.isArray(rule.tracks) ? rule.tracks.map(normalizeSelection) : [],
  }
}

function normalizeAccountSyncProfile(profile = {}) {
  const nextProfile = isObject(profile) ? { ...profile } : {}

  for (const [key, value] of Object.entries(nextProfile)) {
    nextProfile[key] = trimString(value)
  }

  nextProfile.serverUrl = normalizeServerUrl(nextProfile.serverUrl)
  nextProfile.remoteDir = normalizeRemoteDir(nextProfile.remoteDir)

  return nextProfile
}

function createAccountSyncValidationKey(profile = {}) {
  const nextProfile = normalizeAccountSyncProfile(profile)
  return JSON.stringify({
    serverUrl: nextProfile.serverUrl || '',
    remoteDir: nextProfile.remoteDir || '/',
    username: typeof nextProfile.username === 'string' ? nextProfile.username : '',
  })
}

function createEmptyAccountSyncState() {
  return {
    status: 'idle',
    validationKey: '',
    updatedAt: null,
    message: '',
  }
}

function normalizeAccountSyncState(state = {}) {
  const nextState = isObject(state) ? { ...state } : createEmptyAccountSyncState()
  nextState.status = VALID_SYNC_STATUS.has(nextState.status) ? nextState.status : 'idle'
  return nextState
}

async function buildCredentials(connections = [], repository) {
  if (typeof repository?.getCredential !== 'function') return {}

  const credentialRefs = [...new Set(connections.map(item => item.credentialRef).filter(Boolean))]
  const credentialEntries = await Promise.all(credentialRefs.map(async credentialRef => {
    const credential = await repository.getCredential(credentialRef)
    if (!credential) return null
    return [credentialRef, credential]
  }))

  return toRecord(credentialEntries)
}

async function buildAccountSyncPayload({
  settings = {},
  repository,
} = {}) {
  const [rawConnections, rawImportRules] = await Promise.all([
    typeof repository?.getConnections === 'function' ? repository.getConnections() : [],
    typeof repository?.getImportRules === 'function' ? repository.getImportRules() : [],
  ])

  const connections = Array.isArray(rawConnections)
    ? rawConnections.map(normalizeConnection)
    : []
  const importRules = Array.isArray(rawImportRules)
    ? rawImportRules.map(normalizeImportRule)
    : []
  const credentials = await buildCredentials(connections, repository)

  return {
    settings: isObject(settings) ? settings : {},
    mediaSource: {
      connections,
      credentials,
      importRules,
    },
  }
}

module.exports = {
  buildAccountSyncPayload,
  createAccountSyncValidationKey,
  createEmptyAccountSyncState,
  normalizeAccountSyncProfile,
  normalizeAccountSyncState,
  normalizeRemoteDir,
}
