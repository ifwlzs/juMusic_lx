const { isCacheUsable } = require('./cache.js')

async function resolvePlayableResource({ sourceItem, cacheEntry, invalidateCacheEntry, downloadToCache }) {
  if (sourceItem.providerType === 'local') {
    return { url: `file://${sourceItem.pathOrUri}`, cacheHit: false }
  }

  if (isCacheUsable(cacheEntry, sourceItem)) {
    return { url: `file://${cacheEntry.localFilePath}`, cacheHit: true }
  }

  if (cacheEntry && invalidateCacheEntry) {
    await invalidateCacheEntry(cacheEntry)
  }

  const localFilePath = await downloadToCache(sourceItem)
  return { url: `file://${localFilePath}`, cacheHit: false }
}

module.exports = {
  resolvePlayableResource,
}
