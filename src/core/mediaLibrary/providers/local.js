const { buildLocalVersionToken } = require('../versionToken.js')

const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'm4a', 'aac', 'ogg', 'wav'])

function isAudioFile(fileName = '') {
  const parts = String(fileName).split('.')
  if (parts.length < 2) return false
  const ext = parts.pop()?.toLowerCase() || ''
  return AUDIO_EXTENSIONS.has(ext)
}

async function walkLocalTree(readDir, rootPath) {
  const result = await collectLocalFiles(readDir, rootPath)
  return result.files
}

function stripExtension(name = '') {
  return String(name).replace(/\.[^.]+$/, '')
}

async function collectLocalFiles(readDir, rootPath) {
  const files = []
  let skipped = 0
  const entries = await readDir(rootPath)
  for (const entry of entries) {
    if (entry.isDirectory) {
      const nested = await collectLocalFiles(readDir, entry.path)
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

function createLocalProvider({ readDir, readMetadata }) {
  return {
    type: 'local',
    async scanConnection(connection) {
      const { files, skipped } = await collectLocalFiles(readDir, connection.rootPathOrUri)
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
        const title = metadata?.name || stripExtension(file.name)
        const artist = metadata?.singer || ''
        const album = metadata?.albumName || ''
        const durationSec = metadata?.interval || 0
        return {
          sourceItemId: `${connection.connectionId}__${file.path}`,
          connectionId: connection.connectionId,
          providerType: 'local',
          sourceUniqueKey: file.path,
          pathOrUri: file.path,
          fileName: file.name,
          title,
          artist,
          album,
          durationSec,
          fileSize: file.size || 0,
          versionToken: buildLocalVersionToken({
            pathOrUri: file.path,
            fileSize: file.size,
            modifiedTime: file.lastModified || 0,
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
  }
}

module.exports = {
  isAudioFile,
  walkLocalTree,
  createLocalProvider,
}
