function isCacheUsable(cacheEntry, sourceItem) {
  return Boolean(cacheEntry) && cacheEntry.versionToken === sourceItem.versionToken
}

async function invalidateCache(cacheEntry, unlinkFile, repository) {
  if (!cacheEntry) return
  await unlinkFile(cacheEntry.localFilePath).catch(() => null)
  await repository.removeCaches([cacheEntry.cacheId])
}

async function upsertCacheEntry(repository, cacheEntry) {
  const prevCaches = await repository.getCaches()
  const nextCaches = prevCaches.filter(item => item.sourceItemId !== cacheEntry.sourceItemId)
  nextCaches.push(cacheEntry)
  await repository.saveCaches(nextCaches)
  return cacheEntry
}

module.exports = {
  isCacheUsable,
  invalidateCache,
  upsertCacheEntry,
}
