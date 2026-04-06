const { DEFAULT_CONCURRENCY, mapWithConcurrency } = require('./mapWithConcurrency.js')

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

function normalizePathOrUri(pathOrUri = '') {
  const value = String(pathOrUri || '').trim()
  if (!value) return ''
  if (value === '/') return '/'
  return value.replace(/\/+$/, '')
}

function getFileName(pathOrUri = '') {
  const normalized = normalizePathOrUri(pathOrUri)
  if (!normalized || normalized === '/') return ''
  const parts = normalized.split('/')
  return parts.at(-1) || ''
}

function getParentPath(pathOrUri = '') {
  const normalized = normalizePathOrUri(pathOrUri)
  if (!normalized || normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return '/'
  return normalized.slice(0, index)
}

function decodeGraphPath(value = '') {
  const trimmed = String(value || '')
  if (!trimmed.startsWith('/drive/root:')) return '/'
  const relativePath = trimmed.slice('/drive/root:'.length)
  return normalizePathOrUri(relativePath || '/')
}

function encodePathSegment(name = '') {
  return String(name || '')
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function buildPathOrUri(item = {}) {
  const parentPath = decodeGraphPath(item.parentReference?.path)
  const nextPath = parentPath === '/'
    ? `/${item.name || ''}`
    : `${parentPath}/${item.name || ''}`
  return normalizePathOrUri(nextPath)
}

function toBrowserNode(item) {
  const pathOrUri = buildPathOrUri(item)
  const isDirectory = Boolean(item.folder)
  return {
    nodeId: `${isDirectory ? 'directory' : 'track'}__${pathOrUri}`,
    kind: isDirectory ? 'directory' : 'track',
    name: item.name || getFileName(pathOrUri),
    pathOrUri,
    parentPathOrUri: getParentPath(pathOrUri),
    hasChildren: isDirectory ? true : undefined,
  }
}

async function collectPagedChildren(listChildren, connection, pathOrUri) {
  const items = []
  let nextLink = null
  do {
    const page = await listChildren(connection, pathOrUri, nextLink)
    items.push(...(page?.items || []))
    nextLink = page?.nextLink || null
  } while (nextLink)
  return items
}

async function readRemoteMetadata({
  connection,
  item,
  pathOrUri,
  downloadFile,
  readMetadata,
  createTempFilePath,
  removeTempFile,
}) {
  if (!downloadFile || !readMetadata || !createTempFilePath) return null
  const fileName = item?.name || getFileName(pathOrUri)
  const tempFilePath = createTempFilePath(fileName, item, connection)
  if (!tempFilePath) return null

  try {
    const downloadResult = await downloadFile(connection, pathOrUri, tempFilePath, item)
    if (downloadResult?.promise) await downloadResult.promise
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

function buildVersionToken(item, pathOrUri) {
  if (item?.eTag) return item.eTag
  return `${Date.parse(item?.lastModifiedDateTime || 0) || 0}__${item?.size || 0}__${pathOrUri || ''}`
}

async function toSourceItem(connection, item, helpers = {}) {
  const pathOrUri = buildPathOrUri(item)
  const fileName = item?.name || getFileName(pathOrUri)
  const metadata = await readRemoteMetadata({
    connection,
    item,
    pathOrUri,
    ...helpers,
  })
  const modifiedTime = item?.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) || 0 : 0
  return {
    sourceItemId: `${connection.connectionId}__${pathOrUri}`,
    connectionId: connection.connectionId,
    providerType: 'onedrive',
    sourceUniqueKey: pathOrUri,
    pathOrUri,
    fileName,
    title: metadata?.name || stripExtension(fileName),
    artist: metadata?.singer || '',
    album: metadata?.albumName || '',
    durationSec: metadata?.interval || 0,
    fileSize: item?.size || 0,
    modifiedTime,
    versionToken: buildVersionToken(item, pathOrUri),
    lastSeenAt: Date.now(),
    scanStatus: 'success',
  }
}

async function collectDirectoryTracks(listChildren, connection, pathOrUri) {
  const entries = await collectPagedChildren(listChildren, connection, pathOrUri)
  const tracks = []
  const nestedDirectories = []
  for (const entry of entries) {
    if (entry?.folder) {
      nestedDirectories.push(entry)
      continue
    }
    if (isAudioFile(entry?.name)) tracks.push(entry)
  }
  for (const entry of nestedDirectories) {
    tracks.push(...await collectDirectoryTracks(listChildren, connection, buildPathOrUri(entry)))
  }
  return tracks
}

function dedupeItems(items = []) {
  return [...new Map(items.map(item => [buildPathOrUri(item), item])).values()]
}

function createOneDriveProvider({
  listChildren,
  getItemByPath,
  downloadFile,
  readMetadata,
  createTempFilePath,
  removeTempFile,
  metadataConcurrency = DEFAULT_CONCURRENCY,
}) {
  return {
    type: 'onedrive',
    async browseConnection(connection, pathOrUri = connection.rootPathOrUri) {
      const entries = await collectPagedChildren(listChildren, connection, pathOrUri)
      return entries
        .filter(item => item?.folder || isAudioFile(item?.name))
        .map(toBrowserNode)
    },
    async scanSelection(connection, selection = {}) {
      const entries = []

      for (const directory of selection.directories || []) {
        entries.push(...await collectDirectoryTracks(listChildren, connection, directory.pathOrUri))
      }

      for (const track of selection.tracks || []) {
        const entry = await getItemByPath(connection, track.pathOrUri)
        if (entry?.file && isAudioFile(entry.name)) entries.push(entry)
      }

      const items = await mapWithConcurrency(dedupeItems(entries), metadataConcurrency, item => {
        return toSourceItem(connection, item, {
          downloadFile,
          readMetadata,
          createTempFilePath,
          removeTempFile,
        })
      })

      return {
        complete: true,
        items,
        summary: {
          success: items.length,
          failed: 0,
          skipped: 0,
        },
      }
    },
    async downloadToCache(connection, sourceItem, savePath) {
      return downloadFile(connection, sourceItem.pathOrUri, savePath)
    },
  }
}

module.exports = {
  createOneDriveProvider,
}
