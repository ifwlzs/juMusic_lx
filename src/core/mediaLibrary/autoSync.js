const { DEFAULT_STALE_HEARTBEAT_MS, isActiveImportRuleSyncJob } = require('./jobs.js')

const AUTO_SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000

function shouldStartAutoSync(target = {}, now = Date.now()) {
  const lastSyncFinishedAt = target.lastSyncFinishedAt ?? null
  if (!lastSyncFinishedAt) return true
  return now - lastSyncFinishedAt >= AUTO_SYNC_COOLDOWN_MS
}

function resolveLastSuccessfulSyncAt(rule = {}, connection = {}) {
  if (rule?.lastSyncStatus === 'success' && rule?.lastSyncAt) return rule.lastSyncAt
  if (connection?.lastScanStatus === 'success' && connection?.lastScanAt) return connection.lastScanAt
  return null
}

async function runEligibleMediaLibraryAutoSync({
  repository,
  enqueueImportRuleSyncJob,
  now = () => Date.now(),
  staleHeartbeatMs = DEFAULT_STALE_HEARTBEAT_MS,
} = {}) {
  if (!repository || typeof enqueueImportRuleSyncJob !== 'function') return []

  const [connections, rules, importJobs] = await Promise.all([
    typeof repository.getConnections === 'function' ? repository.getConnections() : [],
    typeof repository.getImportRules === 'function' ? repository.getImportRules() : [],
    typeof repository.getImportJobs === 'function' ? repository.getImportJobs() : [],
  ])
  const connectionMap = new Map((connections || []).map(connection => [connection.connectionId, connection]))
  const currentTime = now()
  const activeRuleIds = new Set((importJobs || [])
    .filter(job => isActiveImportRuleSyncJob(job, currentTime, staleHeartbeatMs))
    .map(job => job.ruleId)
    .filter(Boolean))
  const enqueued = []

  for (const rule of rules || []) {
    const connection = connectionMap.get(rule.connectionId)
    if (!connection || connection.providerType === 'local') continue

    const lastSyncFinishedAt = resolveLastSuccessfulSyncAt(rule, connection)
    if (!shouldStartAutoSync({ lastSyncFinishedAt }, currentTime)) continue
    if (activeRuleIds.has(rule.ruleId)) continue

    enqueued.push(await enqueueImportRuleSyncJob({
      connectionId: rule.connectionId,
      ruleId: rule.ruleId,
      triggerSource: 'auto',
    }))
  }

  return enqueued
}

module.exports = {
  AUTO_SYNC_COOLDOWN_MS,
  runEligibleMediaLibraryAutoSync,
  shouldStartAutoSync,
}
