function isCacheUsable(cacheEntry, sourceItem) {
  return Boolean(cacheEntry) && cacheEntry.versionToken === sourceItem.versionToken
}

async function invalidateCache(cacheEntry, unlinkFile, repository) {
  if (!cacheEntry) return
  await unlinkFile(cacheEntry.localFilePath).catch(() => null)
  await repository.removeCaches([cacheEntry.cacheId])
}

async function upsertCacheEntry(repository, cacheEntry, { origin = 'play', now = () => Date.now() } = {}) {
  const prevCaches = await repository.getCaches()
  const nextCaches = prevCaches.filter(item => item.sourceItemId !== cacheEntry.sourceItemId)
  const timestamp = now()
  nextCaches.push({
    ...cacheEntry,
    cacheOrigin: origin,
    ...(origin === 'prefetch' ? { prefetchState: 'ready' } : {}),
    createdAt: cacheEntry.createdAt ?? timestamp,
    lastAccessAt: timestamp,
  })
  await repository.saveCaches(nextCaches)
  return cacheEntry
}

module.exports = {
  isCacheUsable,
  invalidateCache,
  upsertCacheEntry,
}
