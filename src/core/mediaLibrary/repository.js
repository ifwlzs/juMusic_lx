const { sanitizeCredential } = require('./credentials.js')

function createKeyBuilder(prefix = '@media_library__') {
  return {
    connections: () => `${prefix}connections`,
    credentials: credentialRef => `${prefix}credential__${credentialRef}`,
    importRules: () => `${prefix}import_rules`,
    importJobs: () => `${prefix}import_jobs`,
    importSnapshot: ruleId => `${prefix}import_snapshot__${ruleId}`,
    syncRuns: () => `${prefix}sync_runs`,
    syncCandidates: runId => `${prefix}sync_candidates__${runId}`,
    syncSnapshot: ruleId => `${prefix}sync_snapshot__${ruleId}`,
    sourceItems: connectionId => `${prefix}source_items__${connectionId}`,
    aggregateSongs: () => `${prefix}aggregate_songs`,
    caches: () => `${prefix}caches`,
    playStats: () => `${prefix}play_stats`,
    playHistory: () => `${prefix}play_history`,
    yearSummary: year => `${prefix}year_summary__${year}`,
    yearTimeStats: year => `${prefix}year_time_stats__${year}`,
    yearEntityStats: year => `${prefix}year_entity_stats__${year}`,
    lifetimeEntityIndex: () => `${prefix}lifetime_entity_index`,
  }
}

function sanitizeSelection(selection = {}) {
  return {
    selectionId: selection.selectionId,
    kind: selection.kind,
    pathOrUri: selection.pathOrUri,
    displayName: selection.displayName,
  }
}

function sanitizeImportRule(rule = {}) {
  return {
    ruleId: rule.ruleId,
    connectionId: rule.connectionId,
    name: rule.name,
    mode: rule.mode,
    directories: Array.isArray(rule.directories) ? rule.directories.map(sanitizeSelection) : [],
    tracks: Array.isArray(rule.tracks) ? rule.tracks.map(sanitizeSelection) : [],
    generatedListIds: Array.isArray(rule.generatedListIds) ? [...rule.generatedListIds] : [],
    lastSyncAt: rule.lastSyncAt ?? null,
    lastSyncStatus: rule.lastSyncStatus,
    lastSyncSummary: rule.lastSyncSummary,
  }
}

function sanitizeImportSnapshotSelectionStat(stat = {}) {
  return {
    selectionKey: stat.selectionKey,
    kind: stat.kind,
    pathOrUri: stat.pathOrUri ?? '',
    itemCount: Number(stat.itemCount) || 0,
    latestModifiedTime: Number(stat.latestModifiedTime) || 0,
    capturedAt: Number(stat.capturedAt) || 0,
  }
}

function sanitizeImportJob(job = {}) {
  return {
    jobId: job.jobId,
    type: job.type,
    connectionId: job.connectionId,
    ruleId: job.ruleId ?? null,
    status: job.status,
    attempt: job.attempt ?? 0,
    createdAt: job.createdAt ?? null,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    summary: job.summary ?? '',
    error: job.error ?? '',
    runtimeOwnerId: job.runtimeOwnerId ?? null,
    heartbeatAt: job.heartbeatAt ?? null,
    pauseRequestedAt: job.pauseRequestedAt ?? null,
    resumeAfterJobId: job.resumeAfterJobId ?? null,
    payload: job.payload
      ? {
          ...job.payload,
          previousRule: job.payload.previousRule ?? null,
          syncMode: job.payload.syncMode ?? 'incremental',
        }
      : null,
  }
}

function sanitizeSyncRun(run = {}) {
  return {
    runId: run.runId,
    providerType: run.providerType,
    connectionId: run.connectionId,
    ruleId: run.ruleId ?? null,
    triggerSource: run.triggerSource,
    phase: run.phase,
    status: run.status,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    discoveredCount: run.discoveredCount ?? 0,
    readyCount: run.readyCount ?? 0,
    degradedCount: run.degradedCount ?? 0,
    committedCount: run.committedCount ?? 0,
    failedCount: run.failedCount ?? 0,
  }
}

function sanitizeSyncCandidateMetadata(metadata = null) {
  if (!metadata || typeof metadata !== 'object') return null
  return {
    title: metadata.title ?? '',
    artist: metadata.artist ?? '',
    album: metadata.album ?? '',
    durationSec: Number(metadata.durationSec) > 0 ? Number(metadata.durationSec) : 0,
    mimeType: metadata.mimeType ?? '',
  }
}

function sanitizeSyncCandidate(candidate = {}) {
  const sanitized = {
    sourceStableKey: candidate.sourceStableKey,
    pathOrUri: candidate.pathOrUri ?? '',
    fileName: candidate.fileName ?? '',
    versionToken: candidate.versionToken ?? '',
    hydrateState: candidate.hydrateState ?? 'discovered',
    metadataLevelReached: candidate.metadataLevelReached ?? 0,
    attempts: candidate.attempts ?? 0,
    lastError: candidate.lastError ?? '',
    metadata: sanitizeSyncCandidateMetadata(candidate.metadata),
  }
  if (Number.isFinite(candidate.fileSize)) {
    sanitized.fileSize = candidate.fileSize
  }
  if (candidate.modifiedTime !== undefined) {
    sanitized.modifiedTime = candidate.modifiedTime ?? null
  }
  return sanitized
}

function sanitizeSyncSnapshotItem(item = {}) {
  return {
    sourceStableKey: item.sourceStableKey,
    versionToken: item.versionToken ?? '',
    pathOrUri: item.pathOrUri ?? '',
  }
}

function sanitizeSyncSnapshot(snapshot = {}) {
  return {
    ruleId: snapshot.ruleId,
    capturedAt: snapshot.capturedAt ?? null,
    items: Array.isArray(snapshot.items) ? snapshot.items.map(sanitizeSyncSnapshotItem) : [],
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

function sanitizePlayStat(stat = {}) {
  return {
    aggregateSongId: stat.aggregateSongId,
    lastSourceItemId: stat.lastSourceItemId,
    playCount: Number(stat.playCount) || 0,
    playDurationTotalSec: Number(stat.playDurationTotalSec) || 0,
    lastPlayedAt: Number(stat.lastPlayedAt) || 0,
  }
}

function sanitizePlayHistory(entry = {}) {
  return {
    aggregateSongId: entry.aggregateSongId,
    sourceItemId: entry.sourceItemId,
    startedAt: Number(entry.startedAt) || 0,
    endedAt: Number(entry.endedAt) || 0,
    listenedSec: Number(entry.listenedSec) || 0,
    durationSec: Number(entry.durationSec) || 0,
    countedPlay: entry.countedPlay === true,
    completionRate: Number(entry.completionRate) || 0,
    endReason: entry.endReason || 'unknown',
    entrySource: entry.entrySource || 'unknown',
    seekCount: Number(entry.seekCount) || 0,
    seekForwardSec: Number(entry.seekForwardSec) || 0,
    seekBackwardSec: Number(entry.seekBackwardSec) || 0,
    startYear: Number(entry.startYear) || 0,
    startMonth: Number(entry.startMonth) || 0,
    startDay: Number(entry.startDay) || 0,
    startDateKey: typeof entry.startDateKey === 'string' ? entry.startDateKey : '',
    startWeekday: Number(entry.startWeekday) || 0,
    startHour: Number(entry.startHour) || 0,
    startSeason: entry.startSeason || 'winter',
    startTimeBucket: entry.startTimeBucket || 'late_night',
    nightOwningDateKey: typeof entry.nightOwningDateKey === 'string' ? entry.nightOwningDateKey : '',
    nightSortMinute: Number(entry.nightSortMinute) || 0,
    titleSnapshot: entry.titleSnapshot || '',
    artistSnapshot: entry.artistSnapshot || '',
    albumSnapshot: entry.albumSnapshot || '',
    providerTypeSnapshot: entry.providerTypeSnapshot || '',
    fileNameSnapshot: entry.fileNameSnapshot || '',
    remotePathSnapshot: entry.remotePathSnapshot || '',
    listIdSnapshot: entry.listIdSnapshot ?? null,
    listTypeSnapshot: entry.listTypeSnapshot || 'unknown',
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
    async getImportRules() {
      return await storage.get(keys.importRules()) || []
    },
    async saveImportRules(items) {
      await storage.set(keys.importRules(), items.map(sanitizeImportRule))
    },
    async getImportJobs() {
      return await storage.get(keys.importJobs()) || []
    },
    async saveImportJobs(items) {
      await storage.set(keys.importJobs(), items.map(sanitizeImportJob))
    },
    async getSyncRuns() {
      return await storage.get(keys.syncRuns()) || []
    },
    async saveSyncRuns(items) {
      await storage.set(keys.syncRuns(), items.map(sanitizeSyncRun))
    },
    async getSyncCandidates(runId) {
      if (!runId) return []
      return await storage.get(keys.syncCandidates(runId)) || []
    },
    async saveSyncCandidates(runId, items) {
      if (!runId) throw new Error('runId is required')
      await storage.set(keys.syncCandidates(runId), items.map(sanitizeSyncCandidate))
    },
    async removeSyncCandidates(runId) {
      if (!runId) return
      await storage.remove(keys.syncCandidates(runId))
    },
    async getSyncSnapshot(ruleId) {
      if (!ruleId) return null
      return await storage.get(keys.syncSnapshot(ruleId)) || null
    },
    async saveSyncSnapshot(ruleId, snapshot) {
      if (!ruleId) throw new Error('ruleId is required')
      await storage.set(keys.syncSnapshot(ruleId), snapshot ? sanitizeSyncSnapshot(snapshot) : null)
    },
    async removeSyncSnapshots(ruleIds = []) {
      await Promise.all(ruleIds.filter(Boolean).map(ruleId => storage.remove(keys.syncSnapshot(ruleId))))
    },
    async getImportSnapshot(ruleId) {
      if (!ruleId) return null
      return await storage.get(keys.importSnapshot(ruleId)) || null
    },
    async saveImportSnapshot(ruleId, snapshot) {
      if (!ruleId) throw new Error('ruleId is required')
      await storage.set(keys.importSnapshot(ruleId), snapshot ? {
        ruleId,
        scannedAt: snapshot.scannedAt ?? null,
        items: Array.isArray(snapshot.items) ? [...snapshot.items] : [],
        ...(snapshot.isComplete === false ? { isComplete: false } : {}),
        lastIncrementalSyncAt: snapshot.lastIncrementalSyncAt ?? null,
        lastFullValidationAt: snapshot.lastFullValidationAt ?? null,
        pendingFullValidation: snapshot.pendingFullValidation === true,
        selectionStats: Array.isArray(snapshot.selectionStats)
          ? snapshot.selectionStats.map(sanitizeImportSnapshotSelectionStat)
          : [],
      } : null)
    },
    async removeImportSnapshots(ruleIds = []) {
      await Promise.all(ruleIds.filter(Boolean).map(ruleId => storage.remove(keys.importSnapshot(ruleId))))
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
    async removeSourceItems(connectionIds = []) {
      await Promise.all(connectionIds.filter(Boolean).map(connectionId => storage.remove(keys.sourceItems(connectionId))))
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
        prevStats.push(sanitizePlayStat(nextStat))
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
      await storage.set(keys.playStats(), Array.isArray(items) ? items.map(sanitizePlayStat) : [])
    },
    async getPlayHistory() {
      return await storage.get(keys.playHistory()) || []
    },
    async appendPlayHistory(entry) {
      const prevHistory = await storage.get(keys.playHistory()) || []
      prevHistory.push(sanitizePlayHistory(entry))
      await storage.set(keys.playHistory(), prevHistory)
      return prevHistory
    },
    async savePlayHistory(items) {
      await storage.set(keys.playHistory(), Array.isArray(items) ? items.map(sanitizePlayHistory) : [])
    },
    async getYearSummary(year) {
      if (!year) return null
      return await storage.get(keys.yearSummary(year)) || null
    },
    async saveYearSummary(year, summary) {
      if (!year) throw new Error('year is required')
      await storage.set(keys.yearSummary(year), summary || null)
    },
    async getYearTimeStats(year) {
      if (!year) return null
      return await storage.get(keys.yearTimeStats(year)) || null
    },
    async saveYearTimeStats(year, stats) {
      if (!year) throw new Error('year is required')
      await storage.set(keys.yearTimeStats(year), stats || null)
    },
    async getYearEntityStats(year) {
      if (!year) return null
      return await storage.get(keys.yearEntityStats(year)) || null
    },
    async saveYearEntityStats(year, stats) {
      if (!year) throw new Error('year is required')
      await storage.set(keys.yearEntityStats(year), stats || null)
    },
    async getLifetimeEntityIndex() {
      return await storage.get(keys.lifetimeEntityIndex()) || null
    },
    async saveLifetimeEntityIndex(index) {
      await storage.set(keys.lifetimeEntityIndex(), index || null)
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
