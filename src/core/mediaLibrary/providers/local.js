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

function getParentPath(pathOrUri = '') {
  const normalized = String(pathOrUri || '').replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return '/'
  return normalized.slice(0, index)
}

function toBrowserNode(entry) {
  return {
    nodeId: `${entry.isDirectory ? 'directory' : 'track'}__${entry.path}`,
    kind: entry.isDirectory ? 'directory' : 'track',
    name: entry.name,
    pathOrUri: entry.path,
    parentPathOrUri: getParentPath(entry.path),
    hasChildren: entry.isDirectory ? true : undefined,
  }
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

async function resolveLocalFile(readDir, pathOrUri) {
  const entries = await readDir(getParentPath(pathOrUri))
  return entries.find(entry => !entry.isDirectory && entry.path === pathOrUri) || null
}

async function buildLocalScanItems(files, connection, readMetadata, skipped = 0) {
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
    complete: true,
    items,
    summary: {
      success,
      failed,
      skipped,
    },
  }
}

function createLocalProvider({ readDir, readMetadata }) {
  return {
    type: 'local',
    async browseConnection(connection, pathOrUri = connection.rootPathOrUri) {
      const entries = await readDir(pathOrUri)
      return entries
        .filter(entry => entry.isDirectory || isAudioFile(entry.name))
        .map(toBrowserNode)
    },
    async scanSelection(connection, selection = {}) {
      const files = []
      let skipped = 0

      for (const directory of selection.directories || []) {
        const nested = await collectLocalFiles(readDir, directory.pathOrUri)
        files.push(...nested.files)
        skipped += nested.skipped
      }

      for (const track of selection.tracks || []) {
        const entry = await resolveLocalFile(readDir, track.pathOrUri)
        if (!entry) {
          skipped += 1
          continue
        }
        if (!isAudioFile(entry.name)) {
          skipped += 1
          continue
        }
        files.push(entry)
      }

      const dedupedFiles = [...new Map(files.map(file => [file.path, file])).values()]
      return buildLocalScanItems(dedupedFiles, connection, readMetadata, skipped)
    },
    async scanConnection(connection) {
      const { files, skipped } = await collectLocalFiles(readDir, connection.rootPathOrUri)
      return buildLocalScanItems(files, connection, readMetadata, skipped)
    },
  }
}

module.exports = {
  isAudioFile,
  walkLocalTree,
  createLocalProvider,
}
