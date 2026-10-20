function isCacheUsable(cacheEntry, sourceItem) {
  // 中文注释：播放优先用本地文件。versionToken 不同也先播缓存，避免同步后整库作废又重新下载。
  return Boolean(cacheEntry?.localFilePath)
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
