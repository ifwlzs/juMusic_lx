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

function compareText(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function getProviderPriority(providerType) {
  switch (providerType) {
    case 'local':
      return 0
    case 'webdav':
      return 1
    case 'smb':
      return 2
    default:
      return 99
  }
}

function compareSourceItems(left, right) {
  const titleCompare = compareText(
    normalizeText(left.title || left.fileName || 'unknown'),
    normalizeText(right.title || right.fileName || 'unknown'),
  )
  if (titleCompare) return titleCompare

  const artistCompare = compareText(
    normalizeText(left.artist || ''),
    normalizeText(right.artist || ''),
  )
  if (artistCompare) return artistCompare

  const durationCompare = (left.durationSec || 0) - (right.durationSec || 0)
  if (durationCompare) return durationCompare

  const providerCompare = compareText(left.providerType || '', right.providerType || '')
  if (providerCompare) return providerCompare

  return compareText(left.sourceItemId || '', right.sourceItemId || '')
}

function sortSourceItems(sourceItems) {
  return [...sourceItems].sort(compareSourceItems)
}

function getStableItemIdentity(item) {
  return String(item.sourceItemId || item.pathOrUri || item.fileName || '')
}

function compareRepresentativeItems(left, right) {
  const priorityCompare = getProviderPriority(left.providerType) - getProviderPriority(right.providerType)
  if (priorityCompare) return priorityCompare

  const stableIdentityCompare = compareText(getStableItemIdentity(left), getStableItemIdentity(right))
  if (stableIdentityCompare) return stableIdentityCompare

  return compareSourceItems(left, right)
}

function selectRepresentativeItem(groupItems) {
  return groupItems.reduce((bestItem, item) => {
    if (!bestItem) return item

    return compareRepresentativeItems(item, bestItem) < 0 ? item : bestItem
  }, null)
}

function buildAggregateSong(groupItems) {
  const representativeItem = selectRepresentativeItem(groupItems)

  return {
    aggregateSongId: createAggregateSongId(representativeItem),
    title: representativeItem.title || representativeItem.fileName || '',
    artist: representativeItem.artist || '',
    durationSec: representativeItem.durationSec || 0,
    canonicalTitle: representativeItem.title || representativeItem.fileName || '',
    canonicalArtist: representativeItem.artist || '',
    canonicalAlbum: representativeItem.album || '',
    canonicalDurationSec: representativeItem.durationSec || 0,
    preferredSource: representativeItem.providerType,
    preferredSourceItemId: representativeItem.sourceItemId,
    sourceCount: groupItems.length,
    sourceItemIds: groupItems.map(item => item.sourceItemId),
  }
}

function buildAggregateSongs(sourceItems) {
  const sortedItems = sortSourceItems(sourceItems)
  const groups = []

  for (const item of sortedItems) {
    const currentGroup = groups[groups.length - 1]
    if (currentGroup && shouldMergeSongs(currentGroup[0], item)) {
      currentGroup.push(item)
    } else {
      groups.push([item])
    }
  }

  return groups.map(buildAggregateSong)
}

module.exports = {
  shouldMergeSongs,
  buildAggregateSongs,
}
