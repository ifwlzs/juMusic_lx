const {
  isWithinDirectory,
  normalizeImportSelection,
  normalizePathOrUri,
  scanImportSelection,
} = require('./browse.js')
const { buildAggregateSongs } = require('./dedupe.js')
const { runRemoteStreamingSync } = require('./streamingSync.js')
const { buildGeneratedListsForConnection } = require('./systemLists.js')

function dedupeSourceItems(items = []) {
  const map = new Map()
  for (const item of items) {
    if (!item?.sourceItemId) continue
    if (!map.has(item.sourceItemId)) {
      map.set(item.sourceItemId, item)
      continue
    }
    map.set(item.sourceItemId, item)
  }
  return [...map.values()]
}

function mergeSourceItems(previousItems = [], nextItems = []) {
  const map = new Map()
  for (const item of previousItems) {
    if (!item?.sourceItemId) continue
    map.set(item.sourceItemId, item)
  }
  for (const item of nextItems) {
    if (!item?.sourceItemId) continue
    map.set(item.sourceItemId, item)
  }
  return [...map.values()]
}

function buildRemovedIds(previousItems = [], nextItems = []) {
  const nextIds = new Set(nextItems.map(item => item.sourceItemId))
  return previousItems
    .filter(item => !nextIds.has(item.sourceItemId))
    .map(item => item.sourceItemId)
}

function dedupeIds(ids = []) {
  return [...new Set(ids.filter(Boolean))]
}

function upsertRule(rules = [], nextRule) {
  let matched = false
  const nextRules = rules.map(rule => {
    if (rule.ruleId !== nextRule.ruleId) return rule
    matched = true
    return nextRule
  })
  if (!matched) nextRules.push(nextRule)
  return nextRules
}

function getConnectionRules(rules = [], currentRule, connectionId) {
  const nextRules = rules
    .filter(rule => rule.connectionId === connectionId)
    .map(rule => rule.ruleId === currentRule.ruleId ? currentRule : rule)

  if (!nextRules.some(rule => rule.ruleId === currentRule.ruleId)) nextRules.push(currentRule)
  return nextRules
}

function buildRemovedRuleLists({ connection, rule, snapshot }) {
  return buildGeneratedListsForConnection({
    connection,
    rules: [rule],
    snapshots: new Map([[rule.ruleId, snapshot || {
      ruleId: rule.ruleId,
      scannedAt: null,
      items: [],
    }]]),
  }).filter(item => item.listInfo.mediaSource.kind !== 'account_all')
}

function collectRemovedRuleListIds({ connection, rule, snapshot }) {
  return dedupeIds([
    ...(rule.generatedListIds || []),
    ...buildRemovedRuleLists({ connection, rule, snapshot }).map(item => item.listInfo.id),
  ])
}

async function buildSnapshotsForConnection({ connectionRules, currentRuleId, currentSnapshot, repository }) {
  const snapshots = new Map()
  for (const rule of connectionRules) {
    if (rule.ruleId === currentRuleId) {
      snapshots.set(rule.ruleId, currentSnapshot)
      continue
    }
    const snapshot = await repository.getImportSnapshot(rule.ruleId)
    snapshots.set(rule.ruleId, snapshot || {
      ruleId: rule.ruleId,
      scannedAt: null,
      items: [],
    })
  }
  return snapshots
}

async function loadSnapshotsForRules(rules = [], repository) {
  const snapshots = new Map()
  for (const rule of rules) {
    const snapshot = await repository.getImportSnapshot(rule.ruleId)
    snapshots.set(rule.ruleId, snapshot || {
      ruleId: rule.ruleId,
      scannedAt: null,
      items: [],
    })
  }
  return snapshots
}

function collectConnectionSourceItems(connectionRules, snapshots) {
  const items = []
  for (const rule of connectionRules) {
    items.push(...(snapshots.get(rule.ruleId)?.items || []))
  }
  return dedupeSourceItems(items)
}

async function saveUpdatedRuleState({
  repository,
  currentRule,
  currentRuleListIds,
  scanAt,
  isComplete,
}) {
  if (typeof repository.getImportRules !== 'function' || typeof repository.saveImportRules !== 'function') return

  const allRules = await repository.getImportRules()
  const nextRules = upsertRule(allRules, {
    ...currentRule,
    generatedListIds: currentRuleListIds,
    lastSyncAt: scanAt,
    lastSyncStatus: isComplete ? 'success' : 'failed',
  })
  await repository.saveImportRules(nextRules)
}

function buildSelectionPaths(items = []) {
  return [...new Set(items
    .map(item => normalizePathOrUri(item?.pathOrUri))
    .filter(Boolean))].sort()
}

function hasRuleSelectionChanged(previousRule, nextRule) {
  if (!previousRule) return false
  const previousSelection = normalizeImportSelection(previousRule)
  const nextSelection = normalizeImportSelection(nextRule)
  const previousDirectories = buildSelectionPaths(previousSelection.directories)
  const nextDirectories = buildSelectionPaths(nextSelection.directories)
  const previousTracks = buildSelectionPaths(previousSelection.tracks)
  const nextTracks = buildSelectionPaths(nextSelection.tracks)

  if (previousDirectories.length !== nextDirectories.length || previousTracks.length !== nextTracks.length) return true
  return previousDirectories.some((pathOrUri, index) => pathOrUri !== nextDirectories[index]) ||
    previousTracks.some((pathOrUri, index) => pathOrUri !== nextTracks[index])
}

function isSourceItemCoveredByRule(item, rule) {
  const selection = normalizeImportSelection(rule)
  const pathOrUri = normalizePathOrUri(item?.pathOrUri)
  if (!pathOrUri) return false
  if (selection.directories.some(directory => isWithinDirectory(pathOrUri, directory.pathOrUri))) return true
  return selection.tracks.some(track => normalizePathOrUri(track.pathOrUri) === pathOrUri)
}

function createFallbackConnection(connectionId) {
  return {
    connectionId,
    providerType: 'local',
    displayName: connectionId,
  }
}

async function recomputeAggregateSongs({
  repository,
  connections = [],
}) {
  const connectionIds = connections.map(item => item.connectionId).filter(Boolean)
  const allSourceItems = typeof repository.getAllSourceItems === 'function'
    ? await repository.getAllSourceItems(connectionIds)
    : []
  const aggregateSongs = buildAggregateSongs(allSourceItems)
  if (typeof repository.saveAggregateSongs === 'function') {
    await repository.saveAggregateSongs(aggregateSongs)
  }
  return aggregateSongs
}

async function syncImportRule({
  connection,
  rule,
  repository,
  registry,
  listApi,
  now = () => Date.now(),
  skipMissingRemoval = false,
  triggerSource = 'manual',
  notifications = null,
  jobControl = null,
}) {
  const provider = registry?.get?.(connection.providerType)
  if (
    connection.providerType !== 'local' &&
    (provider?.streamEnumerateSelection || provider?.enumerateSelection) &&
    provider?.hydrateCandidate
  ) {
    return runRemoteStreamingSync({
      connection,
      rule,
      repository,
      registry,
      listApi,
      now,
      triggerSource,
      notifications,
      jobControl,
    })
  }

  const scanAt = now()
  const previousSnapshot = await repository.getImportSnapshot(rule.ruleId) || {
    ruleId: rule.ruleId,
    scannedAt: null,
    items: [],
  }
  const scanResult = await scanImportSelection(registry, connection, rule)
  const isComplete = scanResult.complete !== false
  const nextItems = dedupeSourceItems(scanResult.items || [])
  const effectiveItems = isComplete ? nextItems : mergeSourceItems(previousSnapshot.items, nextItems)
  const effectiveSnapshot = {
    ruleId: rule.ruleId,
    scannedAt: isComplete ? scanAt : previousSnapshot.scannedAt,
    items: effectiveItems,
  }

  const allRules = typeof repository.getImportRules === 'function'
    ? await repository.getImportRules()
    : []
  const connectionRules = getConnectionRules(allRules, rule, connection.connectionId)
  const snapshots = await buildSnapshotsForConnection({
    connectionRules,
    currentRuleId: rule.ruleId,
    currentSnapshot: effectiveSnapshot,
    repository,
  })
  const generatedLists = buildGeneratedListsForConnection({
    connection,
    rules: connectionRules,
    snapshots,
  })
  const currentRuleListIds = generatedLists
    .filter(item => item.listInfo.mediaSource.ruleId === rule.ruleId)
    .map(item => item.listInfo.id)

  await saveUpdatedRuleState({
    repository,
    currentRule: rule,
    currentRuleListIds,
    scanAt,
    isComplete,
  })

  const connectionSourceItems = collectConnectionSourceItems(connectionRules, snapshots)
  await repository.saveSourceItems(connection.connectionId, connectionSourceItems)

  const connections = typeof repository.getConnections === 'function'
    ? await repository.getConnections()
    : [connection]
  const connectionIds = [...new Set([
    connection.connectionId,
    ...connections.map(item => item.connectionId).filter(Boolean),
  ])]
  const allSourceItems = typeof repository.getAllSourceItems === 'function'
    ? await repository.getAllSourceItems(connectionIds)
    : connectionSourceItems
  const aggregateSongs = buildAggregateSongs(allSourceItems)
  await repository.saveAggregateSongs(aggregateSongs)

  if (typeof listApi?.reconcileGeneratedLists === 'function') {
    await listApi.reconcileGeneratedLists(generatedLists)
  }

  const removedIds = isComplete ? buildRemovedIds(previousSnapshot.items, nextItems) : []
  if (!skipMissingRemoval && removedIds.length && typeof listApi?.removeMissingSongs === 'function') {
    await listApi.removeMissingSongs(removedIds)
  }

  if (isComplete && typeof repository.saveImportSnapshot === 'function') {
    await repository.saveImportSnapshot(rule.ruleId, {
      ruleId: rule.ruleId,
      scannedAt: scanAt,
      items: nextItems,
    })
  }

  return {
    scanResult,
    generatedLists,
    removedIds,
    connectionSourceItems,
    aggregateSongs,
    isComplete,
    previousSnapshot,
    nextItems,
  }
}

async function applyMissingSourceRemoval({
  missingSourceItemIds = [],
  listApi,
}) {
  const ids = dedupeIds(missingSourceItemIds)
  if (!ids.length || typeof listApi?.removeMissingSongs !== 'function') return []
  await listApi.removeMissingSongs(ids)
  return ids
}

async function updateImportRule({
  connection,
  rule,
  previousRule = null,
  repository,
  registry,
  listApi,
  now = () => Date.now(),
  triggerSource = 'manual',
  notifications = null,
  jobControl = null,
}) {
  const priorRule = previousRule || (
    typeof repository.getImportRules === 'function'
      ? (await repository.getImportRules()).find(item => item.ruleId === rule.ruleId) || null
      : null
  )
  const previousSnapshot = await repository.getImportSnapshot(rule.ruleId) || {
    ruleId: rule.ruleId,
    scannedAt: null,
    items: [],
  }
  const selectionChanged = hasRuleSelectionChanged(priorRule, rule)
  const result = await syncImportRule({
    connection,
    rule,
    repository,
    registry,
    listApi,
    now,
    skipMissingRemoval: selectionChanged,
    triggerSource,
    notifications,
    jobControl,
  })

  if (!selectionChanged || !result.isComplete) return result

  const nextItemIds = new Set(result.nextItems.map(item => item.sourceItemId))
  const coveredSourceIds = new Set(result.connectionSourceItems.map(item => item.sourceItemId))
  const removedItems = previousSnapshot.items.filter(item => !nextItemIds.has(item.sourceItemId))
  const missingSourceIds = dedupeIds(removedItems
    .filter(item => isSourceItemCoveredByRule(item, rule) && !coveredSourceIds.has(item.sourceItemId))
    .map(item => item.sourceItemId))
  const scopeRemovedIds = dedupeIds(removedItems
    .filter(item => !isSourceItemCoveredByRule(item, rule) && !coveredSourceIds.has(item.sourceItemId))
    .map(item => item.sourceItemId))

  await applyMissingSourceRemoval({
    missingSourceItemIds: missingSourceIds,
    listApi,
  })

  if (scopeRemovedIds.length && typeof listApi?.markRuleRemoved === 'function') {
    await listApi.markRuleRemoved(scopeRemovedIds)
  }

  return {
    ...result,
    missingSourceIds,
    scopeRemovedIds,
  }
}

async function updateMediaConnection({
  connection,
  repository,
  registry,
  listApi,
  now = () => Date.now(),
}) {
  const allRules = typeof repository.getImportRules === 'function'
    ? await repository.getImportRules()
    : []
  const connectionRules = allRules.filter(rule => rule.connectionId === connection.connectionId)
  const results = []

  for (const rule of connectionRules) {
    results.push(await updateImportRule({
      connection,
      rule,
      repository,
      registry,
      listApi,
      now,
    }))
  }

  if (!connectionRules.length && typeof listApi?.reconcileGeneratedLists === 'function') {
    await listApi.reconcileGeneratedLists(buildGeneratedListsForConnection({
      connection,
      rules: [],
      snapshots: new Map(),
    }))
  }

  if (typeof repository.getConnections === 'function' && typeof repository.saveConnections === 'function') {
    const nextConnections = (await repository.getConnections()).map(item => {
      if (item.connectionId !== connection.connectionId) return item
      return {
        ...item,
        lastScanAt: now(),
        lastScanStatus: results.every(result => result.scanResult.complete !== false) ? 'success' : 'failed',
      }
    })
    await repository.saveConnections(nextConnections)
  }

  return results
}

async function deleteImportRule({
  ruleId,
  repository,
  listApi,
}) {
  const allRules = typeof repository.getImportRules === 'function'
    ? await repository.getImportRules()
    : []
  const targetRule = allRules.find(rule => rule.ruleId === ruleId)
  if (!targetRule) {
    return {
      generatedLists: [],
      removedSourceItemIds: [],
      connectionSourceItems: [],
      aggregateSongs: [],
    }
  }

  const nextRules = allRules.filter(rule => rule.ruleId !== ruleId)
  const connections = typeof repository.getConnections === 'function'
    ? await repository.getConnections()
    : [createFallbackConnection(targetRule.connectionId)]
  const connection = connections.find(item => item.connectionId === targetRule.connectionId) ||
    createFallbackConnection(targetRule.connectionId)
  const connectionRules = nextRules.filter(rule => rule.connectionId === targetRule.connectionId)
  const snapshots = await loadSnapshotsForRules(connectionRules, repository)
  const removedSnapshot = await repository.getImportSnapshot(ruleId) || {
    ruleId,
    scannedAt: null,
    items: [],
  }
  const connectionSourceItems = collectConnectionSourceItems(connectionRules, snapshots)
  const coveredSourceIds = new Set(connectionSourceItems.map(item => item.sourceItemId))
  const removedSourceItemIds = dedupeIds(removedSnapshot.items
    .filter(item => !coveredSourceIds.has(item.sourceItemId))
    .map(item => item.sourceItemId))
  const removedRuleListIds = collectRemovedRuleListIds({
    connection,
    rule: targetRule,
    snapshot: removedSnapshot,
  })
  const generatedLists = buildGeneratedListsForConnection({
    connection,
    rules: connectionRules,
    snapshots,
  })

  if (removedRuleListIds.length && typeof listApi?.removeGeneratedLists === 'function') {
    await listApi.removeGeneratedLists(removedRuleListIds)
  }

  if (typeof repository.saveImportRules === 'function') {
    await repository.saveImportRules(nextRules)
  }
  if (typeof repository.removeImportSnapshots === 'function') {
    await repository.removeImportSnapshots([ruleId])
  }
  if (typeof repository.saveSourceItems === 'function') {
    await repository.saveSourceItems(targetRule.connectionId, connectionSourceItems)
  }
  const aggregateSongs = await recomputeAggregateSongs({ repository, connections })

  if (typeof listApi?.reconcileGeneratedLists === 'function') {
    await listApi.reconcileGeneratedLists(generatedLists)
  }
  if (removedSourceItemIds.length && typeof listApi?.markRuleRemoved === 'function') {
    await listApi.markRuleRemoved(removedSourceItemIds)
  }

  return {
    generatedLists,
    removedSourceItemIds,
    connectionSourceItems,
    aggregateSongs,
  }
}

async function deleteMediaConnection({
  connectionId,
  repository,
  listApi,
}) {
  const connections = typeof repository.getConnections === 'function'
    ? await repository.getConnections()
    : []
  const connection = connections.find(item => item.connectionId === connectionId) ||
    createFallbackConnection(connectionId)
  const allRules = typeof repository.getImportRules === 'function'
    ? await repository.getImportRules()
    : []
  const removedRules = allRules.filter(rule => rule.connectionId === connectionId)
  const nextRules = allRules.filter(rule => rule.connectionId !== connectionId)
  const nextConnections = connections.filter(item => item.connectionId !== connectionId)
  const snapshots = await loadSnapshotsForRules(removedRules, repository)
  const removedSourceItemIds = dedupeIds(collectConnectionSourceItems(removedRules, snapshots).map(item => item.sourceItemId))
  const generatedLists = buildGeneratedListsForConnection({
    connection,
    rules: removedRules,
    snapshots,
  })
  const generatedListIds = dedupeIds([
    ...generatedLists.map(item => item.listInfo.id),
    ...removedRules.flatMap(rule => rule.generatedListIds || []),
  ])

  if (generatedListIds.length && typeof listApi?.removeGeneratedLists === 'function') {
    await listApi.removeGeneratedLists(generatedListIds)
  }
  if (removedSourceItemIds.length && typeof listApi?.markConnectionRemoved === 'function') {
    await listApi.markConnectionRemoved(removedSourceItemIds)
  }

  if (typeof repository.saveConnections === 'function') {
    await repository.saveConnections(nextConnections)
  }
  if (typeof repository.saveImportRules === 'function') {
    await repository.saveImportRules(nextRules)
  }
  if (typeof repository.removeImportSnapshots === 'function') {
    await repository.removeImportSnapshots(removedRules.map(rule => rule.ruleId))
  }
  if (typeof repository.saveSourceItems === 'function') {
    await repository.saveSourceItems(connectionId, [])
  }
  if (connection.credentialRef && typeof repository.removeCredential === 'function') {
    await repository.removeCredential(connection.credentialRef)
  }
  const aggregateSongs = await recomputeAggregateSongs({ repository, connections: nextConnections })

  return {
    generatedListIds,
    removedSourceItemIds,
    aggregateSongs,
  }
}

module.exports = {
  applyMissingSourceRemoval,
  deleteImportRule,
  deleteMediaConnection,
  syncImportRule,
  updateImportRule,
  updateMediaConnection,
}
