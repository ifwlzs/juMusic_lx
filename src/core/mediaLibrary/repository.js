const { sanitizeCredential } = require('./credentials.js')

function createKeyBuilder(prefix = '@media_library__') {
  return {
    connections: () => `${prefix}connections`,
    credentials: credentialRef => `${prefix}credential__${credentialRef}`,
    sourceItems: connectionId => `${prefix}source_items__${connectionId}`,
    aggregateSongs: () => `${prefix}aggregate_songs`,
    caches: () => `${prefix}caches`,
    playStats: () => `${prefix}play_stats`,
  }
}

function sanitizeConnection(connection) {
  return {
    connectionId: connection.connectionId,
    providerType: connection.providerType,
    displayName: connection.displayName,
    rootPathOrUri: connection.rootPathOrUri,
    credentialRef: connection.credentialRef ?? null,
    lastScanAt: connection.lastScanAt ?? null,
    lastScanStatus: connection.lastScanStatus,
    lastScanSummary: connection.lastScanSummary,
    listProjectionEnabled: connection.listProjectionEnabled,
  }
}

function createMediaLibraryRepository(storage, keys = createKeyBuilder()) {
  return {
    async getConnections() {
      return await storage.get(keys.connections()) || []
    },
    async saveConnections(items) {
      await storage.set(keys.connections(), items.map(sanitizeConnection))
    },
    async getCredential(credentialRef) {
      if (!credentialRef) return null
      return await storage.get(keys.credentials(credentialRef)) || null
    },
    async saveCredential(credentialRef, credential) {
      if (!credentialRef) throw new Error('credentialRef is required')
      await storage.set(keys.credentials(credentialRef), sanitizeCredential(credential))
    },
    async removeCredential(credentialRef) {
      if (!credentialRef) return
      await storage.remove(keys.credentials(credentialRef))
    },
    async getSourceItems(connectionId) {
      return await storage.get(keys.sourceItems(connectionId)) || []
    },
    async getAllSourceItems(connectionIds = []) {
      const sourceLists = await Promise.all(connectionIds.map(connectionId => storage.get(keys.sourceItems(connectionId))))
      return sourceLists.flatMap(items => items || [])
    },
    async saveSourceItems(connectionId, items) {
      await storage.set(keys.sourceItems(connectionId), items)
    },
    async getAggregateSongs() {
      return await storage.get(keys.aggregateSongs()) || []
    },
    async saveAggregateSongs(items) {
      await storage.set(keys.aggregateSongs(), items)
    },
    async getCaches() {
      return await storage.get(keys.caches()) || []
    },
    async findCacheBySourceItemId(sourceItemId) {
      const caches = await storage.get(keys.caches()) || []
      return caches.find(item => item.sourceItemId === sourceItemId) || null
    },
    async saveCaches(items) {
      await storage.set(keys.caches(), items)
    },
    async removeCaches(cacheIds) {
      const prevCaches = await storage.get(keys.caches()) || []
      await storage.set(keys.caches(), prevCaches.filter(item => !cacheIds.includes(item.cacheId)))
    },
    async getPlayStats() {
      return await storage.get(keys.playStats()) || []
    },
    async mergePlayStat(nextStat) {
      const prevStats = await storage.get(keys.playStats()) || []
      const index = prevStats.findIndex(item => item.aggregateSongId === nextStat.aggregateSongId)
      if (index < 0) {
        prevStats.push(nextStat)
      } else {
        prevStats[index] = {
          ...prevStats[index],
          lastSourceItemId: nextStat.lastSourceItemId,
          lastPlayedAt: nextStat.lastPlayedAt,
          playCount: (prevStats[index].playCount || 0) + (nextStat.playCount || 0),
          playDurationTotalSec: (prevStats[index].playDurationTotalSec || 0) + (nextStat.playDurationTotalSec || 0),
        }
      }
      await storage.set(keys.playStats(), prevStats)
      return prevStats
    },
    async savePlayStats(items) {
      await storage.set(keys.playStats(), items)
    },
    async reconcileScannedItems(connectionId, nextItems) {
      const prevItems = await storage.get(keys.sourceItems(connectionId)) || []
      const prevCaches = await storage.get(keys.caches()) || []
      const prevMap = new Map(prevItems.map(item => [item.sourceItemId, item]))
      const invalidatedCaches = []

      for (const item of nextItems) {
        const prev = prevMap.get(item.sourceItemId)
        if (prev && prev.versionToken !== item.versionToken) {
          invalidatedCaches.push(...prevCaches.filter(cache => cache.sourceItemId === item.sourceItemId))
        }
      }

      if (invalidatedCaches.length) {
        const invalidatedCacheIds = new Set(invalidatedCaches.map(item => item.cacheId))
        await storage.set(keys.caches(), prevCaches.filter(item => !invalidatedCacheIds.has(item.cacheId)))
      }
      await storage.set(keys.sourceItems(connectionId), nextItems)
      return { invalidatedCaches }
    },
  }
}

module.exports = {
  createKeyBuilder,
  createMediaLibraryRepository,
}
