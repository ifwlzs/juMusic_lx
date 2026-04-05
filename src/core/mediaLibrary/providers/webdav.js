const { parseMultiStatus } = require('./webdavXml.js')
const { buildWebdavVersionToken } = require('../versionToken.js')

const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'm4a', 'aac', 'ogg', 'wav'])

function isAudioFile(fileName = '') {
  const parts = String(fileName).split('.')
  if (parts.length < 2) return false
  const ext = parts.pop()?.toLowerCase() || ''
  return AUDIO_EXTENSIONS.has(ext)
}

function getFileName(pathOrUri = '') {
  const normalized = String(pathOrUri).split('?')[0]
  if (!normalized || normalized.endsWith('/')) return ''
  const parts = normalized.split('/')
  const fileName = parts.at(-1) || ''
  if (!fileName) return ''
  try {
    return decodeURIComponent(fileName)
  } catch (error) {
    return fileName
  }
}

function createWebdavProvider({ request, downloadFile }) {
  return {
    type: 'webdav',
    async scanConnection(connection) {
      const xml = await request(connection, { method: 'PROPFIND', depth: 'infinity' })
      const lastSeenAt = Date.now()
      let skipped = 0
      let failed = 0
      const items = parseMultiStatus(xml).map(item => {
        const pathOrUri = item.href
        const fileName = getFileName(pathOrUri)
        if (!fileName || !isAudioFile(fileName)) {
          skipped += 1
          return null
        }
        const versionToken = buildWebdavVersionToken(item)
        const scanStatus = versionToken ? 'success' : 'failed'
        if (scanStatus === 'failed') failed += 1
        return {
          sourceItemId: `${connection.connectionId}__${pathOrUri}`,
          connectionId: connection.connectionId,
          providerType: 'webdav',
          sourceUniqueKey: pathOrUri,
          pathOrUri,
          fileName,
          fileSize: item.fileSize ?? 0,
          versionToken,
          lastSeenAt,
          scanStatus,
        }
      }).filter(Boolean)
      const success = items.length - failed
      return {
        items,
        summary: {
          success,
          failed,
          skipped,
        },
      }
    },
    async downloadToCache(connection, sourceItem, savePath) {
      return downloadFile(connection, sourceItem.pathOrUri, savePath)
    },
  }
}

module.exports = {
  createWebdavProvider,
}
