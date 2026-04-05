function formatInterval(durationSec = 0) {
  const minute = Math.floor(durationSec / 60).toString().padStart(2, '0')
  const second = Math.floor(durationSec % 60).toString().padStart(2, '0')
  return `${minute}:${second}`
}

function getFileExtension(fileName = '') {
  const parts = String(fileName).split('.')
  if (parts.length < 2) return 'mp3'
  return parts.pop() || 'mp3'
}

function buildAggregateListSummary(aggregateSongs = []) {
  return {
    id: 'source_list__aggregate',
    connectionId: '__aggregate__',
    name: '总曲库',
    providerType: 'aggregate',
    count: aggregateSongs.length,
    lastScanStatus: 'success',
  }
}

function buildSourceListSummaries(connections = [], sourceItems = []) {
  return connections.map(connection => ({
    id: `source_list__${connection.connectionId}`,
    connectionId: connection.connectionId,
    name: connection.displayName,
    providerType: connection.providerType,
    count: sourceItems.filter(item => item.connectionId === connection.connectionId).length,
    lastScanStatus: connection.lastScanStatus || 'idle',
  }))
}

function isAggregateSong(item) {
  return Boolean(item && (item.preferredSourceItemId || item.canonicalTitle || item.canonicalArtist))
}

function toMediaLibraryMusicInfo(item) {
  const aggregate = isAggregateSong(item)
  const source = aggregate ? (item.preferredSource || 'local') : item.providerType
  const songId = aggregate ? item.aggregateSongId : item.sourceItemId
  const sourceItemId = aggregate ? item.preferredSourceItemId : item.sourceItemId
  const remotePathOrUri = item.pathOrUri || ''

  return {
    id: String(songId),
    name: aggregate ? item.canonicalTitle : (item.title || item.fileName || ''),
    singer: aggregate ? item.canonicalArtist : (item.artist || ''),
    source,
    interval: formatInterval(aggregate ? item.canonicalDurationSec : item.durationSec),
    meta: {
      songId: String(songId),
      albumName: aggregate ? (item.canonicalAlbum || '') : (item.album || ''),
      filePath: source === 'local' ? remotePathOrUri : undefined,
      ext: getFileExtension(item.fileName || ''),
      mediaLibrary: {
        connectionId: item.connectionId || '',
        sourceItemId: sourceItemId || '',
        aggregateSongId: aggregate ? item.aggregateSongId : (item.aggregateSongId || item.sourceItemId),
        providerType: source,
        remotePathOrUri,
        versionToken: item.versionToken || '',
        preferredSourceItemId: item.preferredSourceItemId,
      },
    },
  }
}

module.exports = {
  buildAggregateListSummary,
  buildSourceListSummaries,
  toMediaLibraryMusicInfo,
}
