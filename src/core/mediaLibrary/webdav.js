function encodeBase64(value = '') {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(value).toString('base64')
  }
  if (typeof globalThis?.btoa === 'function') {
    return globalThis.btoa(value)
  }
  throw new Error('webdav basic auth encoder unavailable')
}

function joinUrl(base, path) {
  const normalizedBase = String(base || '').replace(/\/+$/, '')
  const normalizedPath = String(path || '').replace(/^\/+/, '')
  return normalizedPath ? `${normalizedBase}/${normalizedPath}` : normalizedBase
}

function buildWebdavUrl(rootPathOrUri, pathOrUri = '') {
  const targetPathOrUri = String(pathOrUri || '')
  if (/^https?:\/\//i.test(targetPathOrUri)) return targetPathOrUri

  try {
    const rootUrl = new URL(rootPathOrUri)
    if (targetPathOrUri.startsWith('/')) {
      return new URL(targetPathOrUri, `${rootUrl.protocol}//${rootUrl.host}`).toString()
    }

    const normalizedRoot = rootPathOrUri.endsWith('/') ? rootPathOrUri : `${rootPathOrUri}/`
    return new URL(targetPathOrUri, normalizedRoot).toString()
  } catch {
    const rootValue = String(rootPathOrUri || '')
    const originMatch = rootValue.match(/^(https?:\/\/[^/]+)(?:\/.*)?$/i)
    if (originMatch) {
      if (targetPathOrUri.startsWith('/')) return `${originMatch[1]}${targetPathOrUri}`
      return joinUrl(rootValue, targetPathOrUri)
    }
    return targetPathOrUri || rootPathOrUri
  }
}

function buildWebdavHeaders(credential) {
  if (!credential?.username) return {}
  const auth = encodeBase64(`${credential.username}:${credential.password ?? ''}`)
  return {
    Authorization: `Basic ${auth}`,
  }
}

module.exports = {
  buildWebdavHeaders,
  buildWebdavUrl,
}
