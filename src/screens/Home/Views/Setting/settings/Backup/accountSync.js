const VALID_SYNC_STATUS = new Set(['idle', 'success', 'failed'])

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
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

  return `/${segments.join('/')}`
}

function normalizeSelection(selection = {}) {
  const input = isObject(selection) ? selection : {}
  return {
    selectionId: input.selectionId,
    kind: input.kind,
    pathOrUri: input.pathOrUri,
    displayName: input.displayName,
  }
}

function normalizeConnection(connection = {}) {
  const input = isObject(connection) ? connection : {}
  const credentialRef = typeof input.credentialRef === 'string' ? input.credentialRef.trim() : ''

  return {
    connectionId: input.connectionId,
    providerType: input.providerType,
    displayName: input.displayName,
    rootPathOrUri: input.rootPathOrUri,
    credentialRef: credentialRef || null,
  }
}

function normalizeImportRule(rule = {}) {
  const input = isObject(rule) ? rule : {}

  return {
    ruleId: input.ruleId,
    connectionId: input.connectionId,
    name: input.name,
    mode: input.mode,
    directories: Array.isArray(input.directories) ? input.directories.filter(isObject).map(normalizeSelection) : [],
    tracks: Array.isArray(input.tracks) ? input.tracks.filter(isObject).map(normalizeSelection) : [],
  }
}

function createEmptyAccountSyncProfile() {
  return {
    displayName: '',
    serverUrl: '',
    username: '',
    password: '',
    remoteDir: '/',
  }
}

function normalizeAccountSyncProfile(profile = {}) {
  const nextProfile = createEmptyAccountSyncProfile()
  const inputProfile = isObject(profile) ? profile : {}

  nextProfile.displayName = typeof inputProfile.displayName === 'string' ? inputProfile.displayName.trim() : ''
  nextProfile.serverUrl = normalizeServerUrl(inputProfile.serverUrl)
  nextProfile.username = typeof inputProfile.username === 'string' ? inputProfile.username.trim() : ''
  nextProfile.password = typeof inputProfile.password === 'string' ? inputProfile.password.trim() : ''
  nextProfile.remoteDir = normalizeRemoteDir(inputProfile.remoteDir)

  return nextProfile
}

function createAccountSyncValidationKey(profile = {}) {
  const nextProfile = normalizeAccountSyncProfile(profile)
  return JSON.stringify({
    serverUrl: nextProfile.serverUrl,
    username: nextProfile.username,
    password: nextProfile.password,
    remoteDir: nextProfile.remoteDir,
  })
}

function createEmptyAccountSyncState() {
  return {
    version: 1,
    profile: createEmptyAccountSyncProfile(),
    validationKey: null,
    lastValidatedAt: null,
    lastUploadAt: null,
    lastUploadStatus: 'idle',
    lastUploadMessage: '',
  }
}

function normalizeTimestamp(value) {
  return Number.isFinite(value) ? value : null
}

function normalizeAccountSyncState(state = {}) {
  const inputState = isObject(state) ? state : {}
  const nextState = createEmptyAccountSyncState()

  nextState.version = 1
  nextState.profile = normalizeAccountSyncProfile(inputState.profile)
  nextState.validationKey =
    typeof inputState.validationKey === 'string' || inputState.validationKey === null
      ? inputState.validationKey
      : null
  nextState.lastValidatedAt = normalizeTimestamp(inputState.lastValidatedAt)
  nextState.lastUploadAt = normalizeTimestamp(inputState.lastUploadAt)
  nextState.lastUploadStatus = VALID_SYNC_STATUS.has(inputState.lastUploadStatus) ? inputState.lastUploadStatus : 'idle'
  nextState.lastUploadMessage = typeof inputState.lastUploadMessage === 'string' ? inputState.lastUploadMessage.trim() : ''

  return nextState
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone)
  if (!isObject(value)) return value

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deepClone(entry)]))
}

async function buildCredentials(connections = [], repository) {
  if (typeof repository?.getCredential !== 'function') return {}

  const credentialRefs = [...new Set(connections.map(item => item.credentialRef).filter(Boolean))]
  const credentialEntries = await Promise.all(credentialRefs.map(async credentialRef => {
    const credential = await repository.getCredential(credentialRef)
    if (!credential) return null
    return [credentialRef, deepClone(credential)]
  }))

  return toRecord(credentialEntries)
}

async function buildAccountSyncPayload(payload = {}) {
  const inputPayload = isObject(payload) ? payload : {}
  const {
    appVersion = '',
    exportedAt = Date.now(),
    setting,
    settings = {},
    repository,
  } = inputPayload

  const hasSettingInput = Object.prototype.hasOwnProperty.call(inputPayload, 'setting')
  const rawSettings = hasSettingInput ? setting : settings

  const [rawConnections, rawImportRules] = await Promise.all([
    typeof repository?.getConnections === 'function' ? repository.getConnections() : [],
    typeof repository?.getImportRules === 'function' ? repository.getImportRules() : [],
  ])

  const connections = Array.isArray(rawConnections)
    ? rawConnections.filter(isObject).map(normalizeConnection)
    : []
  const importRules = Array.isArray(rawImportRules)
    ? rawImportRules.filter(isObject).map(normalizeImportRule)
    : []
  const credentials = await buildCredentials(connections, repository)

  return {
    type: 'accountSyncPlain_v1',
    appVersion,
    exportedAt,
    settings: isObject(rawSettings) ? deepClone(rawSettings) : {},
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
