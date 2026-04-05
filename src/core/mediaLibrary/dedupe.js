const { normalizeText } = require('./normalize.js')

function shouldMergeSongs(left, right, toleranceSec = 2) {
  return normalizeText(left.title) === normalizeText(right.title) &&
    normalizeText(left.artist) === normalizeText(right.artist) &&
    Math.abs((left.durationSec || 0) - (right.durationSec || 0)) <= toleranceSec
}

function createAggregateSongId(item) {
  return [
    normalizeText(item.title || item.fileName || 'unknown'),
    normalizeText(item.artist || ''),
    Math.round(item.durationSec || 0),
  ].join('__')
}

function buildAggregateSongs(sourceItems) {
  const aggregates = []

  for (const item of sourceItems) {
    const existing = aggregates.find(song => shouldMergeSongs(song, item))
    if (existing) {
      existing.sourceCount += 1
      existing.sourceItemIds.push(item.sourceItemId)
      if (item.providerType === 'local' && existing.preferredSource !== 'local') {
        existing.preferredSource = 'local'
        existing.preferredSourceItemId = item.sourceItemId
      }
      continue
    }

    aggregates.push({
      aggregateSongId: createAggregateSongId(item),
      title: item.title || item.fileName || '',
      artist: item.artist || '',
      durationSec: item.durationSec || 0,
      canonicalTitle: item.title || item.fileName || '',
      canonicalArtist: item.artist || '',
      canonicalAlbum: item.album || '',
      canonicalDurationSec: item.durationSec || 0,
      preferredSource: item.providerType,
      preferredSourceItemId: item.sourceItemId,
      sourceCount: 1,
      sourceItemIds: [item.sourceItemId],
    })
  }

  return aggregates
}

module.exports = {
  shouldMergeSongs,
  buildAggregateSongs,
}
