function normalizePathOrUri(pathOrUri = '') {
  const value = String(pathOrUri || '').trim()
  if (!value) return ''
  if (value === '/') return '/'
  return value.replace(/\/+$/, '')
}

function isWithinDirectory(pathOrUri = '', directoryPathOrUri = '') {
  const normalizedPath = normalizePathOrUri(pathOrUri)
  const normalizedDirectory = normalizePathOrUri(directoryPathOrUri)
  if (!normalizedPath || !normalizedDirectory) return false
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`)
}

function dedupeSelections(items = []) {
  const map = new Map()
  for (const item of items) {
    if (!item?.pathOrUri) continue
    const normalizedPathOrUri = normalizePathOrUri(item.pathOrUri)
    if (!normalizedPathOrUri || map.has(normalizedPathOrUri)) continue
    map.set(normalizedPathOrUri, {
      ...item,
      pathOrUri: normalizedPathOrUri,
    })
  }
  return [...map.values()]
}

function normalizeImportSelection(selection = {}) {
  const directories = dedupeSelections(selection.directories || [])
  const tracks = dedupeSelections(selection.tracks || []).filter(track => {
    return !directories.some(directory => isWithinDirectory(track.pathOrUri, directory.pathOrUri))
  })

  return {
    directories,
    tracks,
  }
}

async function browseConnection(registry, connection, pathOrUri = connection.rootPathOrUri) {
  const provider = registry.get(connection.providerType)
  if (!provider?.browseConnection) throw new Error(`Provider ${connection.providerType} does not support browseConnection`)
  return provider.browseConnection(connection, pathOrUri)
}

async function scanImportSelection(registry, connection, selection) {
  const provider = registry.get(connection.providerType)
  if (!provider?.scanSelection) throw new Error(`Provider ${connection.providerType} does not support scanSelection`)
  return provider.scanSelection(connection, normalizeImportSelection(selection))
}

module.exports = {
  normalizePathOrUri,
  isWithinDirectory,
  normalizeImportSelection,
  browseConnection,
  scanImportSelection,
}
