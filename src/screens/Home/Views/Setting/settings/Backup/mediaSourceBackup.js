function toRecord(entries = []) {
  return Object.fromEntries(entries.filter(Boolean))
}

async function createMediaSourceBackupPayload(repository) {
  const connections = await repository.getConnections() || []
  const importRules = await repository.getImportRules() || []
  const aggregateSongs = await repository.getAggregateSongs() || []
  const playStats = await repository.getPlayStats() || []
  const playHistory = await repository.getPlayHistory() || []

  const credentials = toRecord(await Promise.all(connections.map(async connection => {
    if (!connection?.credentialRef) return null
    const credential = await repository.getCredential(connection.credentialRef)
    if (!credential) return null
    return [connection.credentialRef, credential]
  })))

  const importSnapshots = toRecord(await Promise.all(importRules.map(async rule => {
    if (!rule?.ruleId) return null
    const snapshot = await repository.getImportSnapshot(rule.ruleId)
    return snapshot ? [rule.ruleId, snapshot] : null
  })))
  const syncSnapshots = toRecord(await Promise.all(importRules.map(async rule => {
    if (!rule?.ruleId || typeof repository.getSyncSnapshot !== 'function') return null
    const snapshot = await repository.getSyncSnapshot(rule.ruleId)
    return snapshot ? [rule.ruleId, snapshot] : null
  })))

  const sourceItems = toRecord(await Promise.all(connections.map(async connection => {
    if (!connection?.connectionId) return null
    return [connection.connectionId, await repository.getSourceItems(connection.connectionId) || []]
  })))

  return {
    version: 1,
    connections,
    credentials,
    importRules,
    importSnapshots,
    syncSnapshots,
    sourceItems,
    aggregateSongs,
    playStats,
    playHistory,
  }
}

async function restoreMediaSourceBackupPayload(repository, payload = {}) {
  const connections = Array.isArray(payload.connections) ? payload.connections : []
  const importRules = Array.isArray(payload.importRules) ? payload.importRules : []
  const credentials = payload.credentials && typeof payload.credentials === 'object' ? payload.credentials : {}
  const importSnapshots = payload.importSnapshots && typeof payload.importSnapshots === 'object' ? payload.importSnapshots : {}
  const syncSnapshots = payload.syncSnapshots && typeof payload.syncSnapshots === 'object' ? payload.syncSnapshots : {}
  const sourceItems = payload.sourceItems && typeof payload.sourceItems === 'object' ? payload.sourceItems : {}
  const aggregateSongs = Array.isArray(payload.aggregateSongs) ? payload.aggregateSongs : []
  const playStats = Array.isArray(payload.playStats) ? payload.playStats : []
  const playHistory = Array.isArray(payload.playHistory) ? payload.playHistory : []

  const previousConnections = await repository.getConnections() || []
  const previousRules = await repository.getImportRules() || []

  const nextConnectionIds = new Set(connections.map(connection => connection.connectionId).filter(Boolean))
  const nextCredentialRefs = new Set(connections.map(connection => connection.credentialRef).filter(Boolean))
  const nextRuleIds = new Set(importRules.map(rule => rule.ruleId).filter(Boolean))

  const removedConnectionIds = previousConnections
    .map(connection => connection.connectionId)
    .filter(connectionId => connectionId && !nextConnectionIds.has(connectionId))
  const removedRuleIds = previousRules
    .map(rule => rule.ruleId)
    .filter(ruleId => ruleId && !nextRuleIds.has(ruleId))

  await Promise.all(previousConnections.map(async connection => {
    if (!connection?.credentialRef || nextCredentialRefs.has(connection.credentialRef)) return
    await repository.removeCredential(connection.credentialRef)
  }))

  await repository.removeImportSnapshots(removedRuleIds)
  if (typeof repository.removeSyncSnapshots === 'function') {
    await repository.removeSyncSnapshots(removedRuleIds)
  } else if (typeof repository.saveSyncSnapshot === 'function') {
    await Promise.all(removedRuleIds.map(ruleId => repository.saveSyncSnapshot(ruleId, null)))
  }
  if (typeof repository.removeSourceItems === 'function') {
    await repository.removeSourceItems(removedConnectionIds)
  } else {
    await Promise.all(removedConnectionIds.map(connectionId => repository.saveSourceItems(connectionId, [])))
  }

  for (const [credentialRef, credential] of Object.entries(credentials)) {
    await repository.saveCredential(credentialRef, credential)
  }
  await repository.saveConnections(connections)
  await repository.saveImportRules(importRules)

  for (const rule of importRules) {
    await repository.saveImportSnapshot(rule.ruleId, importSnapshots[rule.ruleId] ?? null)
    if (typeof repository.saveSyncSnapshot === 'function') {
      await repository.saveSyncSnapshot(rule.ruleId, syncSnapshots[rule.ruleId] ?? null)
    }
  }
  for (const connection of connections) {
    await repository.saveSourceItems(connection.connectionId, sourceItems[connection.connectionId] || [])
  }
  await repository.saveAggregateSongs(aggregateSongs)
  await repository.savePlayStats(playStats)
  await repository.savePlayHistory(playHistory)
}

module.exports = {
  createMediaSourceBackupPayload,
  restoreMediaSourceBackupPayload,
}
