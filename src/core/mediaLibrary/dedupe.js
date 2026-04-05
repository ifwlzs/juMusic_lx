const { normalizeText } = require('./normalize.js')

function shouldMergeSongs(left, right, toleranceSec = 2) {
  const leftTitle = normalizeText(left.title)
  const rightTitle = normalizeText(right.title)
  const leftArtist = normalizeText(left.artist)
  const rightArtist = normalizeText(right.artist)

  if (!leftTitle || !rightTitle || !leftArtist || !rightArtist) {
    return false
  }

  return leftTitle === rightTitle &&
    leftArtist === rightArtist &&
    Math.abs((left.durationSec || 0) - (right.durationSec || 0)) <= toleranceSec
}

function createAggregateSongId(item) {
  return [
    normalizeText(item.title || item.fileName || 'unknown'),
    normalizeText(item.artist || ''),
    Math.round(item.durationSec || 0),
  ].join('__')
}

function defineDurationRange(aggregate, durationSec) {
  Object.defineProperty(aggregate, '_durationMinSec', {
    value: durationSec,
    writable: true,
    enumerable: false,
  })
  Object.defineProperty(aggregate, '_durationMaxSec', {
    value: durationSec,
    writable: true,
    enumerable: false,
  })
}

function updateAggregateDuration(aggregate, durationSec) {
  aggregate._durationMinSec = Math.min(aggregate._durationMinSec, durationSec)
  aggregate._durationMaxSec = Math.max(aggregate._durationMaxSec, durationSec)
  aggregate.durationSec = (aggregate._durationMinSec + aggregate._durationMaxSec) / 2
  aggregate.canonicalDurationSec = Math.round(aggregate.durationSec)
  aggregate.aggregateSongId = createAggregateSongId(aggregate)
}

function buildAggregateSongs(sourceItems) {
  const aggregates = []

  for (const item of sourceItems) {
    const existing = aggregates.find(song => shouldMergeSongs(song, item))
    if (existing) {
      updateAggregateDuration(existing, item.durationSec || 0)
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

    defineDurationRange(aggregates[aggregates.length - 1], item.durationSec || 0)
  }

  return aggregates
}

module.exports = {
  shouldMergeSongs,
  buildAggregateSongs,
}
