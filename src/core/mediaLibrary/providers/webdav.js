const { DEFAULT_CONCURRENCY, mapWithConcurrency } = require('./mapWithConcurrency.js')
const { parseMultiStatus } = require('./webdavXml.js')
const { resolveDownloadResult } = require('../downloadResult.js')
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

function stripExtension(name = '') {
  return String(name).replace(/\.[^.]+$/, '')
}

async function emitBatches(items, onBatch, batchSize = 10) {
  if (typeof onBatch !== 'function') return
  for (let index = 0; index < items.length; index += batchSize) {
    await onBatch(items.slice(index, index + batchSize))
  }
}

function normalizeHref(pathOrUri = '') {
  const normalized = String(pathOrUri || '').split('?')[0]
  if (!normalized) return ''
  if (normalized === '/') return '/'
  return normalized.replace(/\/+$/, '')
}

function isDirectoryHref(pathOrUri = '') {
  const normalized = String(pathOrUri || '').split('?')[0]
  return !!normalized && normalized.endsWith('/')
}

function getDirectoryName(pathOrUri = '') {
  const normalized = normalizeHref(pathOrUri)
  if (!normalized || normalized === '/') return ''
  const parts = normalized.split('/')
  const name = parts.at(-1) || ''
  if (!name) return ''
  try {
    return decodeURIComponent(name)
  } catch (error) {
    return name
  }
}

function getParentPathOrUri(pathOrUri = '') {
  const normalized = normalizeHref(pathOrUri)
  if (!normalized || normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return '/'
  return `${normalized.slice(0, index)}/`
}

function toBrowserNode(item) {
  const isDirectory = isDirectoryHref(item.href)
  return {
    nodeId: `${isDirectory ? 'directory' : 'track'}__${normalizeHref(item.href)}`,
    kind: isDirectory ? 'directory' : 'track',
    name: isDirectory ? getDirectoryName(item.href) : getFileName(item.href),
    pathOrUri: item.href,
    parentPathOrUri: getParentPathOrUri(item.href),
    hasChildren: isDirectory ? true : undefined,
  }
}

async function requestPropfind(request, connection, pathOrUri, depth) {
  const xml = await request(connection, {
    method: 'PROPFIND',
    depth,
    pathOrUri,
  })
  return parseMultiStatus(xml)
}

async function resolveTrackEntry(request, connection, pathOrUri) {
  const entries = await requestPropfind(request, connection, getParentPathOrUri(pathOrUri), '1')
  const normalizedTarget = normalizeHref(pathOrUri)
  return entries.find(item => normalizeHref(item.href) === normalizedTarget) || null
}

async function streamWebdavDirectoryCandidates(request, connection, pathOrUri, onBatch, seenKeys = new Set()) {
  const entries = await requestPropfind(request, connection, pathOrUri, '1')
  const normalizedRoot = normalizeHref(pathOrUri)
  const currentFiles = []
  const nestedDirectories = []

  for (const entry of entries) {
    const normalizedEntry = normalizeHref(entry.href)
    if (!normalizedEntry || normalizedEntry === normalizedRoot) continue
    if (isDirectoryHref(entry.href)) {
      nestedDirectories.push(entry)
      continue
    }
    if (isAudioFile(getFileName(entry.href))) currentFiles.push(entry)
  }

  const currentCandidates = currentFiles
    .map(item => toCandidate(connection, item))
    .filter(candidate => {
      const key = candidate?.sourceStableKey || candidate?.pathOrUri || ''
      if (!key) return true
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })
  if (currentCandidates.length) await emitBatches(currentCandidates, onBatch)

  const items = [...currentCandidates]
  for (const directory of nestedDirectories) {
    items.push(...await streamWebdavDirectoryCandidates(
      request,
      connection,
      directory.href,
      onBatch,
      seenKeys,
    ))
  }

  return items
}

async function readRemoteMetadata({
  connection,
  item,
  fileName,
  downloadFile,
  readMetadata,
  createTempFilePath,
  removeTempFile,
}) {
  if (!downloadFile || !readMetadata || !createTempFilePath) return null

  const tempFilePath = createTempFilePath(fileName, item, connection)
  if (!tempFilePath) return null

  try {
    const downloadResult = await downloadFile(connection, item.href, tempFilePath)
    await resolveDownloadResult(downloadResult, {
      operation: 'webdav metadata download',
    })
    return await readMetadata(tempFilePath, connection, item)
  } catch {
    return null
  } finally {
    if (removeTempFile) {
      try {
        await removeTempFile(tempFilePath, connection, item)
      } catch {}
    }
  }
}

function toCandidate(connection, item) {
  const pathOrUri = normalizeHref(item.href)
  return {
    sourceStableKey: pathOrUri,
    connectionId: connection.connectionId,
    providerType: 'webdav',
    pathOrUri: item.href,
    fileName: getFileName(item.href),
    fileSize: item.fileSize ?? 0,
    modifiedTime: item.modifiedTime || 0,
    versionToken: buildWebdavVersionToken(item),
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

async function hydrateCandidateMetadata(connection, candidate, attempt, helpers = {}) {
  const hintedMetadata = normalizeHydratedMetadata(candidate, null)
  if (hasReadyMetadata(hintedMetadata)) {
    return {
      candidate,
      metadata: hintedMetadata,
      metadataLevelReached: Math.max(Number(attempt) || 0, candidate?.metadataLevelReached || 0, 1),
    }
  }

  const metadata = await readRemoteMetadata({
    connection,
    item: { href: candidate?.pathOrUri },
    fileName: candidate?.fileName || getFileName(candidate?.pathOrUri),
    ...helpers,
  })

  return {
    candidate,
    metadata: normalizeHydratedMetadata(candidate, metadata),
    metadataLevelReached: Math.max(Number(attempt) || 0, metadata ? 1 : 0),
  }
}

async function buildWebdavScanResult(connection, entries = [], metadataHelpers = {}, metadataConcurrency = DEFAULT_CONCURRENCY) {
  const lastSeenAt = Date.now()
  let skipped = 0
  let failed = 0
  const items = (await mapWithConcurrency(entries, metadataConcurrency, async item => {
    const pathOrUri = item.href
    const fileName = getFileName(pathOrUri)
    if (!fileName || !isAudioFile(fileName)) {
      skipped += 1
      return null
    }
    const metadata = await readRemoteMetadata({
      connection,
      item,
      fileName,
      ...metadataHelpers,
    })
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
      title: metadata?.name || stripExtension(fileName),
      artist: metadata?.singer || '',
      album: metadata?.albumName || '',
      durationSec: metadata?.interval || 0,
      fileSize: item.fileSize ?? 0,
      modifiedTime: item.modifiedTime || 0,
      versionToken,
      lastSeenAt,
      scanStatus,
    }
  })).filter(Boolean)
  const success = items.length - failed
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

function createWebdavProvider({
  request,
  downloadFile,
  readMetadata,
  createTempFilePath,
  removeTempFile,
  metadataConcurrency = DEFAULT_CONCURRENCY,
}) {
  return {
    type: 'webdav',
    async browseConnection(connection, pathOrUri = connection.rootPathOrUri) {
      const entries = await requestPropfind(request, connection, pathOrUri, '1')
      const normalizedRoot = normalizeHref(pathOrUri)
      return entries
        .filter(item => normalizeHref(item.href) !== normalizedRoot)
        .filter(item => isDirectoryHref(item.href) || isAudioFile(getFileName(item.href)))
        .map(toBrowserNode)
    },
    async streamEnumerateSelection(connection, selection = {}, onBatch) {
      const items = []
      const seenKeys = new Set()
      for (const directory of selection.directories || []) {
        items.push(...await streamWebdavDirectoryCandidates(
          request,
          connection,
          directory.pathOrUri,
          onBatch,
          seenKeys,
        ))
      }
      for (const track of selection.tracks || []) {
        const entry = await resolveTrackEntry(request, connection, track.pathOrUri)
        if (!entry || isDirectoryHref(entry.href) || !isAudioFile(getFileName(entry.href))) continue
        const candidate = toCandidate(connection, entry)
        const key = candidate?.sourceStableKey || candidate?.pathOrUri || ''
        if (key && seenKeys.has(key)) continue
        if (key) seenKeys.add(key)
        items.push(candidate)
        await emitBatches([candidate], onBatch)
      }
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
      return hydrateCandidateMetadata(connection, candidate, attempt, {
        downloadFile,
        readMetadata,
        createTempFilePath,
        removeTempFile,
      })
    },
    async scanSelection(connection, selection = {}) {
      const entries = []
      for (const directory of selection.directories || []) {
        entries.push(...await requestPropfind(request, connection, directory.pathOrUri, 'infinity'))
      }
      for (const track of selection.tracks || []) {
        const entry = await resolveTrackEntry(request, connection, track.pathOrUri)
        if (entry) entries.push(entry)
      }
      const dedupedEntries = [...new Map(entries.map(item => [normalizeHref(item.href), item])).values()]
      return buildWebdavScanResult(connection, dedupedEntries, {
        downloadFile,
        readMetadata,
        createTempFilePath,
        removeTempFile,
      }, metadataConcurrency)
    },
    async scanConnection(connection) {
      const entries = await requestPropfind(request, connection, connection.rootPathOrUri, 'infinity')
      return buildWebdavScanResult(connection, entries, {
        downloadFile,
        readMetadata,
        createTempFilePath,
        removeTempFile,
      }, metadataConcurrency)
    },
    async downloadToCache(connection, sourceItem, savePath) {
      return downloadFile(connection, sourceItem.pathOrUri, savePath)
    },
  }
}

module.exports = {
  createWebdavProvider,
}
