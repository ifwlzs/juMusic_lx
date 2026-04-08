const { normalizeImportSelection } = require('./browse.js')
const { createReadyBatchCommitter } = require('./batchCommitter.js')
const { buildAggregateSongs } = require('./dedupe.js')
const { classifyHydrationResult } = require('./hydrationPolicy.js')
const { buildGeneratedListsForConnection } = require('./systemLists.js')

function dedupeSourceItems(items = []) {
  const map = new Map()
  for (const item of items) {
    if (!item?.sourceItemId) continue
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

function buildSourceItemResumeKey(item = {}) {
  return item.sourceUniqueKey || item.pathOrUri || ''
}

function buildCandidateResumeKey(candidate = {}) {
  return candidate.sourceStableKey || candidate.pathOrUri || ''
}

function buildSourceItemLookup(items = []) {
  const map = new Map()
  for (const item of items) {
    const key = buildSourceItemResumeKey(item)
    if (!key) continue
    map.set(key, item)
  }
  return map
}

function toSyncCandidateMetadata(item = {}) {
  return {
    title: item.title || '',
    artist: item.artist || '',
    album: item.album || '',
    durationSec: item.durationSec || 0,
  }
}

function isReusableCommittedItem(sourceItem, candidate) {
  const candidateKey = buildCandidateResumeKey(candidate)
  if (!sourceItem || !candidateKey) return false
  if (buildSourceItemResumeKey(sourceItem) !== candidateKey) return false
  return String(sourceItem.versionToken || '') === String(candidate.versionToken || '')
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

function buildSourceItemFromCandidate({
  connection,
  candidate,
  classification,
  scanAt,
}) {
  return {
    sourceItemId: `${connection.connectionId}__${candidate.pathOrUri}`,
    connectionId: connection.connectionId,
    providerType: connection.providerType,
    sourceUniqueKey: candidate.sourceStableKey || candidate.pathOrUri,
    pathOrUri: candidate.pathOrUri,
    fileName: candidate.fileName || '',
    title: classification.title || '',
    artist: classification.artist || '',
    album: classification.album || '',
    durationSec: classification.durationSec || 0,
    fileSize: candidate.fileSize || 0,
    modifiedTime: candidate.modifiedTime || 0,
    versionToken: candidate.versionToken || '',
    lastSeenAt: scanAt,
    scanStatus: classification.state === 'degraded' ? 'degraded' : 'success',
  }
}

async function upsertSyncRun(repository, runPatch) {
  if (typeof repository.getSyncRuns !== 'function' || typeof repository.saveSyncRuns !== 'function') return
  const currentRuns = await repository.getSyncRuns()
  let matched = false
  const nextRuns = currentRuns.map(item => {
    if (item.runId !== runPatch.runId) return item
    matched = true
    return {
      ...item,
      ...runPatch,
    }
  })
  if (!matched) nextRuns.push(runPatch)
  await repository.saveSyncRuns(nextRuns)
}

function toSyncSnapshot(ruleId, items = [], capturedAt) {
  return {
    ruleId,
    capturedAt,
    items: items.map(item => ({
      sourceStableKey: item.sourceUniqueKey,
      versionToken: item.versionToken,
      pathOrUri: item.pathOrUri,
    })),
  }
}

function createMediaImportJobPausedError() {
  const error = new Error('media import job paused')
  error.code = 'MEDIA_IMPORT_JOB_PAUSED'
  return error
}

async function runRemoteStreamingSync({
  connection,
  rule,
  repository,
  registry,
  listApi,
  notifications = null,
  now = () => Date.now(),
  triggerSource = 'manual',
  maxHydrateAttempts = 3,
  batchCommitterOptions = null,
  jobControl = null,
}) {
  const provider = registry.get(connection.providerType)
  if ((!provider?.streamEnumerateSelection && !provider?.enumerateSelection) || !provider?.hydrateCandidate) {
    throw new Error(`Provider ${connection.providerType} does not support streaming sync`)
  }

  const scanAt = now()
  const runId = `sync__${connection.connectionId}__${rule.ruleId}__${scanAt}`
  const previousSnapshot = await repository.getImportSnapshot(rule.ruleId) || {
    ruleId: rule.ruleId,
    scannedAt: null,
    items: [],
  }
  const previousItemsByKey = buildSourceItemLookup(previousSnapshot.items)
  let enumerateResult = {
    complete: true,
    items: [],
  }
  let discoveredCandidates = []
  const committedItems = []
  const candidateStates = new Map()
  let generatedLists = []
  let connectionSourceItems = []
  let aggregateSongs = []
  let committer = null
  let readyCount = 0
  let degradedCount = 0
  let failedCount = 0

  const persistCheckpoint = async(currentCommittedItems = committedItems) => {
    const checkpointItems = mergeSourceItems(previousSnapshot.items, dedupeSourceItems(currentCommittedItems))
    await recomputeVisibleState(checkpointItems, { persistFinalState: false })
    if (typeof repository.saveImportSnapshot === 'function') {
      await repository.saveImportSnapshot(rule.ruleId, {
        ruleId: rule.ruleId,
        scannedAt: previousSnapshot.scannedAt ?? null,
        items: checkpointItems,
        isComplete: false,
      })
    }
    return checkpointItems
  }

  const assertJobCanContinue = async() => {
    await jobControl?.heartbeat?.()
    if (await jobControl?.isPauseRequested?.()) throw createMediaImportJobPausedError()
  }

  const persistSyncWorkspace = async(phase = 'hydrate') => {
    await upsertSyncRun(repository, {
      runId,
      providerType: connection.providerType,
      connectionId: connection.connectionId,
      ruleId: rule.ruleId,
      triggerSource,
      phase,
      status: 'running',
      startedAt: scanAt,
      finishedAt: null,
      discoveredCount: discoveredCandidates.length,
      readyCount,
      degradedCount,
      committedCount: committedItems.length,
      failedCount,
    })

    if (typeof repository.saveSyncCandidates === 'function') {
      await repository.saveSyncCandidates(runId, [...candidateStates.values()])
    }
  }

  const recomputeVisibleState = async(currentItems, { persistFinalState = false } = {}) => {
    const currentSnapshot = {
      ruleId: rule.ruleId,
      scannedAt: persistFinalState ? scanAt : previousSnapshot.scannedAt,
      items: currentItems,
    }
    const allRules = typeof repository.getImportRules === 'function'
      ? await repository.getImportRules()
      : []
    const connectionRules = getConnectionRules(allRules, rule, connection.connectionId)
    const snapshots = await buildSnapshotsForConnection({
      connectionRules,
      currentRuleId: rule.ruleId,
      currentSnapshot,
      repository,
    })

    generatedLists = buildGeneratedListsForConnection({
      connection,
      rules: connectionRules,
      snapshots,
    })

    const currentRuleListIds = generatedLists
      .filter(item => item.listInfo.mediaSource.ruleId === rule.ruleId)
      .map(item => item.listInfo.id)

    if (persistFinalState) {
      await saveUpdatedRuleState({
        repository,
        currentRule: rule,
        currentRuleListIds,
        scanAt,
        isComplete: enumerateResult.complete !== false,
      })
    }

    connectionSourceItems = collectConnectionSourceItems(connectionRules, snapshots)
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
    aggregateSongs = buildAggregateSongs(allSourceItems)
    await repository.saveAggregateSongs(aggregateSongs)

    if (typeof listApi?.reconcileGeneratedLists === 'function') {
      await listApi.reconcileGeneratedLists(generatedLists)
    }
  }

  try {
    await assertJobCanContinue()
    await persistSyncWorkspace('enumerate')
    await notifications?.showSyncProgress({
      connectionName: connection.displayName,
      phase: 'enumerate',
      committedCount: 0,
      totalCount: 0,
    })

    committer = createReadyBatchCommitter({
      ...batchCommitterOptions,
      onFlush: async(batch) => {
        committedItems.push(...batch)
        await notifications?.showSyncProgress({
          connectionName: connection.displayName,
          phase: 'commit',
          committedCount: committedItems.length,
          totalCount: discoveredCandidates.length,
        })
        await persistCheckpoint(committedItems)
        await persistSyncWorkspace('hydrate')
      },
    })

    const processCandidateBatch = async(batch = [], { flushAfterBatch = false } = {}) => {
      if (!batch.length) return

      await notifications?.showSyncProgress({
        connectionName: connection.displayName,
        phase: 'hydrate',
        committedCount: committedItems.length,
        totalCount: discoveredCandidates.length + batch.length,
      })

      for (const candidate of batch) {
        const candidateKey = buildCandidateResumeKey(candidate)
        if (!candidateKey || candidateStates.has(candidateKey)) continue

        discoveredCandidates.push(candidate)
        const reusableItem = previousItemsByKey.get(candidateKey)
        const isReusable = isReusableCommittedItem(reusableItem, candidate)
        if (isReusable) {
          if (reusableItem.scanStatus === 'degraded') degradedCount += 1
          else readyCount += 1
        }
        candidateStates.set(candidateKey, {
          ...candidate,
          sourceStableKey: candidateKey,
          hydrateState: isReusable ? 'committed' : 'discovered',
          attempts: 0,
          lastError: '',
          metadataLevelReached: isReusable
            ? Math.max(candidate.metadataLevelReached || 0, 1)
            : (candidate.metadataLevelReached || 0),
          metadata: isReusable ? toSyncCandidateMetadata(reusableItem) : null,
        })

        await assertJobCanContinue()
        if (isReusable) {
          await committer.push({
            ...reusableItem,
            lastSeenAt: scanAt,
          })
          continue
        }

        let classification = { state: 'hydrating' }
        let lastError = ''
        let lastMetadata = null
        let metadataLevelReached = candidate.metadataLevelReached || 0

        for (let attempt = 1; attempt <= maxHydrateAttempts; attempt += 1) {
          await assertJobCanContinue()
          try {
            const hydrated = await provider.hydrateCandidate(connection, candidate, { attempt })
            lastMetadata = hydrated?.metadata || null
            metadataLevelReached = hydrated?.metadataLevelReached ?? metadataLevelReached
          } catch (error) {
            lastMetadata = null
            lastError = String(error?.message || error || 'hydrate failed')
          }

          classification = classifyHydrationResult({
            attempts: attempt,
            metadata: lastMetadata || {},
            fallbackTitle: candidate.fileName,
          })

          candidateStates.set(candidateKey, {
            ...candidate,
            sourceStableKey: candidateKey,
            hydrateState: classification.state,
            attempts: attempt,
            lastError,
            metadataLevelReached,
            metadata: lastMetadata,
          })

          if (classification.state !== 'hydrating') break
        }

        if (classification.state === 'ready') readyCount += 1
        if (classification.state === 'degraded') degradedCount += 1
        if (lastError) failedCount += 1

        if (classification.state === 'ready' || classification.state === 'degraded') {
          const sourceItem = buildSourceItemFromCandidate({
            connection,
            candidate: {
              ...candidate,
              sourceStableKey: candidateKey,
            },
            classification,
            scanAt,
          })
          candidateStates.set(candidateKey, {
            ...candidateStates.get(candidateKey),
            hydrateState: 'committed',
          })
          await committer.push(sourceItem)
        }
      }

      await persistSyncWorkspace('hydrate')
      if (flushAfterBatch) await committer.flush()
    }

    if (typeof provider.streamEnumerateSelection === 'function') {
      enumerateResult = await provider.streamEnumerateSelection(
        connection,
        normalizeImportSelection(rule),
        async batch => processCandidateBatch(batch, { flushAfterBatch: true })
      )
      const remainingCandidates = (enumerateResult.items || [])
        .filter(candidate => !candidateStates.has(buildCandidateResumeKey(candidate)))
      await processCandidateBatch(remainingCandidates)
    } else {
      enumerateResult = await provider.enumerateSelection(connection, normalizeImportSelection(rule))
      await processCandidateBatch(enumerateResult.items || [])
    }

    await notifications?.showSyncProgress({
      connectionName: connection.displayName,
      phase: 'hydrate',
      committedCount: committedItems.length,
      totalCount: discoveredCandidates.length,
    })

    await committer.flush()
    await assertJobCanContinue()

    const nextItems = dedupeSourceItems(committedItems)
    const removedIds = enumerateResult.complete === false ? [] : buildRemovedIds(previousSnapshot.items, nextItems)
    await recomputeVisibleState(enumerateResult.complete === false ? mergeSourceItems(previousSnapshot.items, nextItems) : nextItems, {
      persistFinalState: true,
    })

    if (removedIds.length && typeof listApi?.removeMissingSongs === 'function') {
      await notifications?.showSyncProgress({
        connectionName: connection.displayName,
        phase: 'reconcile_delete',
        committedCount: nextItems.length,
        totalCount: discoveredCandidates.length,
      })
      await listApi.removeMissingSongs(removedIds)
    }

    if (enumerateResult.complete !== false && typeof repository.saveImportSnapshot === 'function') {
      await repository.saveImportSnapshot(rule.ruleId, {
        ruleId: rule.ruleId,
        scannedAt: scanAt,
        items: nextItems,
        isComplete: true,
      })
    }
    if (typeof repository.saveSyncCandidates === 'function') {
      await repository.saveSyncCandidates(runId, [...candidateStates.values()])
    }
    if (typeof repository.saveSyncSnapshot === 'function') {
      await repository.saveSyncSnapshot(rule.ruleId, toSyncSnapshot(rule.ruleId, nextItems, scanAt))
    }
    await upsertSyncRun(repository, {
      runId,
      providerType: connection.providerType,
      connectionId: connection.connectionId,
      ruleId: rule.ruleId,
      triggerSource,
      phase: 'reconcile_delete',
      status: enumerateResult.complete === false ? 'failed' : 'success',
      startedAt: scanAt,
      finishedAt: now(),
      discoveredCount: discoveredCandidates.length,
      readyCount,
      degradedCount,
      committedCount: nextItems.length,
      failedCount,
    })

    await notifications?.showSyncFinished({
      connectionName: connection.displayName,
      committedCount: nextItems.length,
      totalCount: discoveredCandidates.length,
    })

    return {
      scanResult: {
        complete: enumerateResult.complete !== false,
        items: nextItems,
        summary: {
          success: nextItems.length,
          failed: 0,
          skipped: 0,
        },
      },
      generatedLists,
      removedIds,
      connectionSourceItems,
      aggregateSongs,
      isComplete: enumerateResult.complete !== false,
      previousSnapshot,
      nextItems,
    }
  } catch (error) {
    if (committer) {
      try {
        await committer.flush()
      } catch {}
    }
    if (error?.code === 'MEDIA_IMPORT_JOB_PAUSED') {
      await upsertSyncRun(repository, {
        runId,
        providerType: connection.providerType,
        connectionId: connection.connectionId,
        ruleId: rule.ruleId,
        triggerSource,
        phase: 'hydrate',
        status: 'paused',
        startedAt: scanAt,
        finishedAt: now(),
        discoveredCount: candidateStates.size,
        readyCount,
        degradedCount,
        committedCount: committedItems.length,
        failedCount,
      })
      throw error
    }

    await upsertSyncRun(repository, {
      runId,
      providerType: connection.providerType,
      connectionId: connection.connectionId,
      ruleId: rule.ruleId,
      triggerSource,
      phase: 'reconcile_delete',
      status: 'failed',
      startedAt: scanAt,
      finishedAt: now(),
      discoveredCount: candidateStates.size,
      readyCount,
      degradedCount,
      committedCount: committedItems.length,
      failedCount: failedCount || 1,
    })
    await notifications?.showSyncFailed({
      connectionName: connection.displayName,
      errorMessage: String(error?.message || error || '同步失败'),
    })
    throw error
  }
}

module.exports = {
  createMediaImportJobPausedError,
  runRemoteStreamingSync,
}
