function hashString(input = '') {
  const text = String(input)
  let hashA = 5381
  let hashB = 52711

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    hashA = (((hashA << 5) + hashA) ^ code) >>> 0
    hashB = (((hashB << 5) + hashB) ^ (code + index)) >>> 0
  }

  return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`
}

function normalizeExtension(ext = 'mp3') {
  const normalized = String(ext || 'mp3')
    .replace(/^\.+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

  return normalized || 'mp3'
}

function buildMediaLibraryCacheFilePath(baseDir, sourceItemId, ext = 'mp3') {
  const normalizedBaseDir = String(baseDir || '').replace(/[\\/]+$/, '')
  return `${normalizedBaseDir}/media_${hashString(sourceItemId)}.${normalizeExtension(ext)}`
}

module.exports = {
  buildMediaLibraryCacheFilePath,
}
