const { buildSmbVersionToken } = require('../versionToken.js')

const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'm4a', 'aac', 'ogg', 'wav'])

function isAudioFile(fileName = '') {
  const parts = String(fileName).split('.')
  if (parts.length < 2) return false
  const ext = parts.pop()?.toLowerCase() || ''
  return AUDIO_EXTENSIONS.has(ext)
}

function stripExtension(name = '') {
  return String(name).replace(/\.[^.]+$/, '')
}

async function collectSmbFiles(listDirectory, rootPathOrUri, connection) {
  const files = []
  let skipped = 0
  const entries = await listDirectory(connection, rootPathOrUri)
  for (const entry of entries) {
    if (entry.isDirectory) {
      const nested = await collectSmbFiles(listDirectory, entry.path, connection)
      files.push(...nested.files)
      skipped += nested.skipped
      continue
    }
    if (isAudioFile(entry.name)) {
      files.push(entry)
    } else {
      skipped += 1
    }
  }
  return { files, skipped }
}

function createSmbProvider({ listDirectory, readMetadata, downloadFile }) {
  return {
    type: 'smb',
    async scanConnection(connection) {
      const { files, skipped } = await collectSmbFiles(listDirectory, connection.rootPathOrUri, connection)
      const lastSeenAt = Date.now()
      const items = await Promise.all(files.map(async(file) => {
        let metadata = null
        let scanStatus = 'success'
        let scanError = null
        try {
          metadata = await readMetadata(file.path)
          if (!metadata) {
            scanStatus = 'failed'
            scanError = new Error('metadata empty')
          }
        } catch (error) {
          metadata = null
          scanStatus = 'failed'
          scanError = error
        }

        return {
          sourceItemId: `${connection.connectionId}__${file.path}`,
          connectionId: connection.connectionId,
          providerType: 'smb',
          sourceUniqueKey: file.path,
          pathOrUri: file.path,
          fileName: file.name,
          title: metadata?.name || stripExtension(file.name),
          artist: metadata?.singer || '',
          album: metadata?.albumName || '',
          durationSec: metadata?.interval || 0,
          fileSize: file.size || 0,
          versionToken: buildSmbVersionToken({
            modifiedTime: file.modifiedTime || 0,
            fileSize: file.size || 0,
            pathOrUri: file.path,
          }),
          lastSeenAt,
          scanStatus,
          scanError: scanError ? String(scanError?.message || scanError) : undefined,
        }
      }))
      const success = items.filter(item => item.scanStatus !== 'failed').length
      const failed = items.length - success
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
  createSmbProvider,
}
