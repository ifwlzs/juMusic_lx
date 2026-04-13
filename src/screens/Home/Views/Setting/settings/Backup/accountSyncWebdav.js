function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRemoteDir(remoteDir = '/') {
  let normalized = typeof remoteDir === 'string' ? remoteDir.trim() : '/'
  if (!normalized) return '/'

  normalized = normalized.replace(/\\/g, '/').replace(/\/+/g, '/')
  if (!normalized.startsWith('/')) normalized = `/${normalized}`
  if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1)
  return normalized || '/'
}

function getParentPath(path) {
  if (path === '/') return '/'
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.length ? `/${parts.join('/')}` : '/'
}

function joinWebdavUrl(serverUrl, targetPath) {
  const normalizedPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`
  const normalizedServerUrl = String(serverUrl || '').trim()
  if (!normalizedServerUrl) return normalizedPath

  try {
    const base = normalizedServerUrl.endsWith('/') ? normalizedServerUrl : `${normalizedServerUrl}/`
    const relativePath = normalizedPath.replace(/^\/+/, '')
    return new URL(relativePath, base).toString()
  } catch {
    return `${normalizedServerUrl.replace(/\/+$/, '')}${normalizedPath}`
  }
}

function encodeBasicAuth(value, deps = {}) {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(value, 'utf8').toString('base64')
  }
  if (typeof deps.btoa === 'function') return deps.btoa(value)
  if (typeof globalThis?.btoa === 'function') return globalThis.btoa(value)
  throw new Error('account_sync_base64_unavailable')
}

function buildWebdavAuthHeader(profile = {}, deps = {}) {
  const username = typeof profile.username === 'string' ? profile.username.trim() : ''
  if (!username) return {}
  const password = typeof profile.password === 'string' ? profile.password : ''
  return {
    Authorization: `Basic ${encodeBasicAuth(`${username}:${password}`, deps)}`,
  }
}

async function requestWebdav(input = {}, deps = {}) {
  const { profile = {}, method = 'PROPFIND', path = '/', headers = {}, body } = input
  const fetchFn = deps.fetch || globalThis.fetch
  if (typeof fetchFn !== 'function') throw new Error('account_sync_remote_dir_unreachable')

  const response = await fetchFn(joinWebdavUrl(profile.serverUrl, path), {
    method,
    headers: {
      ...buildWebdavAuthHeader(profile, deps),
      ...(method === 'PROPFIND' && !headers.Depth ? { Depth: '0' } : {}),
      ...headers,
    },
    body,
  })

  const text = typeof response?.text === 'function' ? await response.text() : ''
  return {
    ok: response?.ok === true,
    status: Number(response?.status) || 0,
    text,
  }
}

function buildAccountSyncRemoteFilePath(remoteDir = '/') {
  const normalized = normalizeRemoteDir(remoteDir)
  const prefix = normalized === '/' ? '' : normalized
  return `${prefix}/jumusic-sync/account-sync.latest.json`
}

async function callWebdav(profile, deps, input) {
  const request = typeof deps.requestWebdav === 'function'
    ? deps.requestWebdav
    : (requestInput) => requestWebdav(requestInput, deps)
  return await request({
    profile,
    ...input,
  })
}

function isSuccessStatus(status) {
  return status >= 200 && status < 300
}

async function validateAccountSyncProfile(profile = {}, deps = {}) {
  const normalizedProfile = isObject(profile) ? profile : {}
  const remoteDir = normalizeRemoteDir(normalizedProfile.remoteDir)

  try {
    const dirResponse = await callWebdav(normalizedProfile, deps, {
      method: 'PROPFIND',
      path: remoteDir,
      headers: { Depth: '0' },
    })
    if (isSuccessStatus(dirResponse.status)) return { willCreateRemoteDir: false }
    if (dirResponse.status !== 404) throw new Error('account_sync_remote_dir_unreachable')

    const parentPath = getParentPath(remoteDir)
    try {
      const parentResponse = await callWebdav(normalizedProfile, deps, {
        method: 'PROPFIND',
        path: parentPath,
        headers: { Depth: '0' },
      })
      if (isSuccessStatus(parentResponse.status)) return { willCreateRemoteDir: true }
      throw new Error('account_sync_remote_dir_parent_unreachable')
    } catch (error) {
      if (error?.message === 'account_sync_remote_dir_parent_unreachable') throw error
      throw new Error('account_sync_remote_dir_parent_unreachable')
    }
  } catch (error) {
    if (
      error?.message === 'account_sync_remote_dir_unreachable' ||
      error?.message === 'account_sync_remote_dir_parent_unreachable'
    ) throw error
    throw new Error('account_sync_remote_dir_unreachable')
  }
}

async function ensureAccountSyncRemoteDir(profile = {}, deps = {}) {
  const normalizedProfile = isObject(profile) ? profile : {}
  const remoteDir = normalizeRemoteDir(normalizedProfile.remoteDir)
  const ensureDir = remoteDir === '/'
    ? '/jumusic-sync'
    : `${remoteDir}/jumusic-sync`

  const segments = ensureDir.split('/').filter(Boolean)
  let currentPath = ''
  for (const segment of segments) {
    currentPath = `${currentPath}/${segment}`
    let propfindResponse
    try {
      propfindResponse = await callWebdav(normalizedProfile, deps, {
        method: 'PROPFIND',
        path: currentPath,
        headers: { Depth: '0' },
      })
    } catch {
      throw new Error('account_sync_remote_dir_create_failed')
    }

    if (isSuccessStatus(propfindResponse.status)) continue
    if (propfindResponse.status !== 404) throw new Error('account_sync_remote_dir_create_failed')

    let mkcolResponse
    try {
      mkcolResponse = await callWebdav(normalizedProfile, deps, {
        method: 'MKCOL',
        path: currentPath,
      })
    } catch {
      throw new Error('account_sync_remote_dir_create_failed')
    }
    if (isSuccessStatus(mkcolResponse.status) || mkcolResponse.status === 405) continue
    throw new Error('account_sync_remote_dir_create_failed')
  }
}

async function uploadAccountSyncEnvelope(profile = {}, envelopeText = '', deps = {}) {
  const normalizedProfile = isObject(profile) ? profile : {}
  await ensureAccountSyncRemoteDir(normalizedProfile, deps)

  const remoteFilePath = buildAccountSyncRemoteFilePath(normalizedProfile.remoteDir)
  let response
  try {
    response = await callWebdav(normalizedProfile, deps, {
      method: 'PUT',
      path: remoteFilePath,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: envelopeText,
    })
  } catch {
    throw new Error('account_sync_upload_failed')
  }

  if (![200, 201, 204].includes(response.status)) throw new Error('account_sync_upload_failed')
  return {
    remoteFilePath,
    status: response.status,
  }
}

module.exports = {
  buildAccountSyncRemoteFilePath,
  ensureAccountSyncRemoteDir,
  requestWebdav,
  uploadAccountSyncEnvelope,
  validateAccountSyncProfile,
}
