const { DEFAULT_CONCURRENCY, mapWithConcurrency } = require('./mapWithConcurrency.js')
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

async function emitBatches(items, onBatch, batchSize = 10) {
  if (typeof onBatch !== 'function') return
  for (let index = 0; index < items.length; index += batchSize) {
    await onBatch(items.slice(index, index + batchSize))
  }
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

function toCandidate(connection, file) {
  return {
    sourceStableKey: file.path,
    connectionId: connection.connectionId,
    providerType: 'smb',
    pathOrUri: file.path,
    fileName: file.name,
    fileSize: file.size || 0,
    modifiedTime: file.modifiedTime || 0,
    versionToken: buildSmbVersionToken({
      modifiedTime: file.modifiedTime || 0,
      fileSize: file.size || 0,
      pathOrUri: file.path,
    }),
    metadataLevelReached: 0,
  }
}

function normalizeHydratedMetadata(candidate, metadata) {
  const hints = candidate?.metadataHints || {}
  return {
    title: metadata?.name || hints.title || stripExtension(candidate?.fileName || ''),
    artist: metadata?.singer || hints.artist || '',
    album: metadata?.albumName || hints.album || '',
    durationSec: metadata?.interval || hints.durationSec || 0,
  }
}

function hasReadyMetadata(metadata = {}) {
  return Boolean(metadata?.title && metadata?.artist && Number(metadata?.durationSec) > 0)
}

async function hydrateCandidateMetadata(connection, candidate, attempt, readMetadata) {
  const hintedMetadata = normalizeHydratedMetadata(candidate, null)
  if (hasReadyMetadata(hintedMetadata)) {
    return {
      candidate,
      metadata: hintedMetadata,
      scanStatus: 'success',
      metadataLevelReached: Math.max(Number(attempt) || 0, candidate?.metadataLevelReached || 0, 1),
    }
  }

  const metadata = await readMetadata(candidate?.pathOrUri, connection, candidate)
  return {
    candidate,
    metadata: normalizeHydratedMetadata(candidate, metadata),
    scanStatus: metadata ? 'success' : 'failed',
    metadataLevelReached: Math.max(Number(attempt) || 0, metadata ? 1 : 0),
  }
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

async function resolveSmbFile(listDirectory, connection, pathOrUri) {
  const entries = await listDirectory(connection, getParentPath(pathOrUri))
  return entries.find(entry => !entry.isDirectory && entry.path === pathOrUri) || null
}

async function buildSmbScanItems(files, connection, readMetadata, skipped = 0, metadataConcurrency = DEFAULT_CONCURRENCY) {
  const lastSeenAt = Date.now()
  const items = await mapWithConcurrency(files, metadataConcurrency, async file => {
    let metadata = null
    let scanStatus = 'success'
    let scanError = null
    try {
      metadata = await readMetadata(file.path, connection, file)
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
      modifiedTime: file.modifiedTime || 0,
      versionToken: buildSmbVersionToken({
        modifiedTime: file.modifiedTime || 0,
        fileSize: file.size || 0,
        pathOrUri: file.path,
      }),
      lastSeenAt,
      scanStatus,
      scanError: scanError ? String(scanError?.message || scanError) : undefined,
    }
  })
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

function createSmbProvider({ listDirectory, readMetadata, downloadFile, metadataConcurrency = DEFAULT_CONCURRENCY }) {
  return {
    type: 'smb',
    async browseConnection(connection, pathOrUri = connection.rootPathOrUri) {
      const entries = await listDirectory(connection, pathOrUri)
      return entries
        .filter(entry => entry.isDirectory || isAudioFile(entry.name))
        .map(toBrowserNode)
    },
    async streamEnumerateSelection(connection, selection = {}, onBatch) {
      const files = []

      for (const directory of selection.directories || []) {
        const nested = await collectSmbFiles(listDirectory, directory.pathOrUri, connection)
        files.push(...nested.files)
      }

      for (const track of selection.tracks || []) {
        const entry = await resolveSmbFile(listDirectory, connection, track.pathOrUri)
        if (entry && isAudioFile(entry.name)) files.push(entry)
      }

      const dedupedFiles = [...new Map(files.map(file => [file.path, file])).values()]
      const items = dedupedFiles.map(file => toCandidate(connection, file))
      await emitBatches(items, onBatch)
      return { complete: true, items }
    },
    async enumerateSelection(connection, selection = {}) {
      const streamed = []
      await this.streamEnumerateSelection(connection, selection, async batch => {
        streamed.push(...batch)
      })
      return { complete: true, items: streamed }
    },
    async hydrateCandidate(connection, candidate, { attempt = 1 } = {}) {
      return hydrateCandidateMetadata(connection, candidate, attempt, readMetadata)
    },
    async scanSelection(connection, selection = {}) {
      const files = []
      let skipped = 0

      for (const directory of selection.directories || []) {
        const nested = await collectSmbFiles(listDirectory, directory.pathOrUri, connection)
        files.push(...nested.files)
        skipped += nested.skipped
      }

      for (const track of selection.tracks || []) {
        const entry = await resolveSmbFile(listDirectory, connection, track.pathOrUri)
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
      return buildSmbScanItems(dedupedFiles, connection, readMetadata, skipped, metadataConcurrency)
    },
    async scanConnection(connection) {
      const { files, skipped } = await collectSmbFiles(listDirectory, connection.rootPathOrUri, connection)
      return buildSmbScanItems(files, connection, readMetadata, skipped, metadataConcurrency)
    },
    async downloadToCache(connection, sourceItem, savePath) {
      return downloadFile(connection, sourceItem.pathOrUri, savePath)
    },
  }
}

module.exports = {
  createSmbProvider,
}
