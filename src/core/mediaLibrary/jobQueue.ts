import {
  createUserList,
  getListMusics,
  getUserLists,
  overwriteListMusics,
  removeListMusics,
  removeUserList,
  updateListMusics,
  updateUserList,
  updateUserListPosition,
} from '@/core/list'
import { deleteImportRule, updateImportRule, updateMediaConnection } from './importSync'
import { runEligibleMediaLibraryAutoSync } from './autoSync'
import { createMediaImportJobQueue } from './jobs.js'
import { createMediaLibraryListApi } from './listApi'
import { getMediaLibraryRuntimeRegistry } from './runtimeRegistry'
import { createMediaLibrarySyncNotifications } from './syncNotifications'
import { mediaLibraryRepository } from './storage'
import { startBackgroundSync } from '../../utils/nativeModules/mediaLibrarySyncService.js'

const listApi = createMediaLibraryListApi({
  createUserList,
  getListMusics,
  getUserLists,
  overwriteListMusics,
  removeListMusics,
  removeUserList,
  updateListMusics,
  updateUserList,
  updateUserListPosition,
})

const replaceRule = async(ruleId: string, updater: (rule: LX.MediaLibrary.ImportRule) => LX.MediaLibrary.ImportRule) => {
  const rules = await mediaLibraryRepository.getImportRules() as LX.MediaLibrary.ImportRule[]
  const nextRules = rules.map(rule => {
    if (rule.ruleId !== ruleId) return rule
    return updater(rule)
  })
  await mediaLibraryRepository.saveImportRules(nextRules)
}

const setRuleStatus = async(ruleId: string, status: LX.MediaLibrary.ConnectionScanStatus, summary: string, syncAt?: number | null) => {
  await replaceRule(ruleId, rule => ({
    ...rule,
    lastSyncStatus: status,
    lastSyncSummary: summary,
    ...(syncAt !== undefined ? { lastSyncAt: syncAt } : {}),
  }))
}

const setConnectionRulesStatus = async(connectionId: string, status: LX.MediaLibrary.ConnectionScanStatus, summary: string, syncAt?: number | null) => {
  const rules = await mediaLibraryRepository.getImportRules() as LX.MediaLibrary.ImportRule[]
  const nextRules = rules.map(rule => {
    if (rule.connectionId !== connectionId) return rule
    return {
      ...rule,
      lastSyncStatus: status,
      lastSyncSummary: summary,
      ...(syncAt !== undefined ? { lastSyncAt: syncAt } : {}),
    }
  })
  await mediaLibraryRepository.saveImportRules(nextRules)
}

const replaceConnection = async(connectionId: string, updater: (connection: LX.MediaLibrary.SourceConnection) => LX.MediaLibrary.SourceConnection) => {
  const connections = await mediaLibraryRepository.getConnections() as LX.MediaLibrary.SourceConnection[]
  const nextConnections = connections.map(connection => {
    if (connection.connectionId !== connectionId) return connection
    return updater(connection)
  })
  await mediaLibraryRepository.saveConnections(nextConnections)
}

const setConnectionStatus = async(connectionId: string, status: LX.MediaLibrary.ConnectionScanStatus, summary: string, scanAt?: number | null) => {
  await replaceConnection(connectionId, connection => ({
    ...connection,
    lastScanStatus: status,
    lastScanSummary: summary,
    ...(scanAt !== undefined ? { lastScanAt: scanAt } : {}),
  }))
}

const buildResultSummary = (result: {
  syncStats?: {
    committedCount?: number
    removedCount?: number
    discoveredCount?: number
  } | null
  scanResult?: {
    summary?: {
      success?: number
      failed?: number
      skipped?: number
    } | null
  } | null
} | null | undefined, syncMode?: LX.MediaLibrary.SyncMode) => {
  const fallbackSummary = 'success'
  const stats = result?.syncStats
  if (stats) {
    const summary = `committed: ${stats.committedCount ?? 0}, removed: ${stats.removedCount ?? 0}, discovered: ${stats.discoveredCount ?? 0}`
    return syncMode ? `${syncMode}: ${summary}` : summary
  }

  const scanSummary = result?.scanResult?.summary
  if (scanSummary) {
    const nextSummary = `success: ${scanSummary.success ?? 0}, failed: ${scanSummary.failed ?? 0}, skipped: ${scanSummary.skipped ?? 0}`
    return syncMode ? `${syncMode}: ${nextSummary}` : nextSummary
  }

  return syncMode ? `${syncMode}: ${fallbackSummary}` : fallbackSummary
}

let queue: ReturnType<typeof createMediaImportJobQueue> | null = null
const syncNotifications = createMediaLibrarySyncNotifications()

const maybeStartBackgroundSync = async(connection?: LX.MediaLibrary.SourceConnection | null) => {
  if (!connection || connection.providerType === 'local') return false
  try {
    return await startBackgroundSync()
  } catch {
    return false
  }
}

const buildConnectionResultSummary = (results: Array<{
  syncStats?: {
    committedCount?: number
    removedCount?: number
    discoveredCount?: number
  } | null
  scanResult?: {
    summary?: {
      success?: number
      failed?: number
      skipped?: number
    } | null
  } | null
} | null | undefined> = []) => {
  if (!results.length) return 'success'

  const hasStats = results.some(result => result?.syncStats)
  if (hasStats) {
    const totals = results.reduce((sum, result) => ({
      committedCount: sum.committedCount + (result?.syncStats?.committedCount ?? 0),
      removedCount: sum.removedCount + (result?.syncStats?.removedCount ?? 0),
      discoveredCount: sum.discoveredCount + (result?.syncStats?.discoveredCount ?? 0),
    }), {
      committedCount: 0,
      removedCount: 0,
      discoveredCount: 0,
    })
    return `rules: ${results.length}, committed: ${totals.committedCount}, removed: ${totals.removedCount}, discovered: ${totals.discoveredCount}`
  }

  const totals = results.reduce((sum, result) => ({
    success: sum.success + (result?.scanResult?.summary?.success ?? 0),
    failed: sum.failed + (result?.scanResult?.summary?.failed ?? 0),
    skipped: sum.skipped + (result?.scanResult?.summary?.skipped ?? 0),
  }), {
    success: 0,
    failed: 0,
    skipped: 0,
  })
  return `rules: ${results.length}, success: ${totals.success}, failed: ${totals.failed}, skipped: ${totals.skipped}`
}

const getQueue = () => {
  if (queue) return queue

  queue = createMediaImportJobQueue({
    repository: mediaLibraryRepository,
    async runImportRuleJob(job: LX.MediaLibrary.ImportJob, jobControl) {
      const [rules, connections] = await Promise.all([
        mediaLibraryRepository.getImportRules() as Promise<LX.MediaLibrary.ImportRule[]>,
        mediaLibraryRepository.getConnections() as Promise<LX.MediaLibrary.SourceConnection[]>,
      ])
      const rule = rules.find(item => item.ruleId === job.ruleId)
      const connection = connections.find(item => item.connectionId === job.connectionId)
      if (!rule || !connection) return

      const syncMode = job.payload?.syncMode ?? 'incremental'
      await maybeStartBackgroundSync(connection)
      await setRuleStatus(rule.ruleId, 'running', 'running')
      await setConnectionStatus(connection.connectionId, 'running', 'running')
      const result = await updateImportRule({
        connection,
        rule,
        previousRule: job.payload?.previousRule ?? null,
        repository: mediaLibraryRepository,
        registry: getMediaLibraryRuntimeRegistry(),
        listApi,
        triggerSource: job.payload?.triggerSource ?? 'manual',
        notifications: syncNotifications,
        jobControl,
        syncMode,
      })
      const summary = buildResultSummary(result, syncMode)
      await setRuleStatus(rule.ruleId, result.isComplete ? 'success' : 'failed', summary, Date.now())
      await setConnectionStatus(connection.connectionId, result.isComplete ? 'success' : 'failed', summary, Date.now())
    },
    async runConnectionJob(job: LX.MediaLibrary.ImportJob, jobControl) {
      const connections = await mediaLibraryRepository.getConnections() as LX.MediaLibrary.SourceConnection[]
      const connection = connections.find(item => item.connectionId === job.connectionId)
      if (!connection) return

      const syncMode = job.payload?.syncMode ?? 'incremental'
      await maybeStartBackgroundSync(connection)
      await setConnectionStatus(connection.connectionId, 'running', 'running')
      const results = await updateMediaConnection({
        connection,
        repository: mediaLibraryRepository,
        registry: getMediaLibraryRuntimeRegistry(),
        listApi,
        triggerSource: job.payload?.triggerSource ?? 'manual',
        notifications: syncNotifications,
        jobControl,
        syncMode,
      })
      const isComplete = results.every(result => result?.isComplete !== false)
      await setConnectionStatus(connection.connectionId, isComplete ? 'success' : 'failed', buildConnectionResultSummary(results), Date.now())
    },
    async runDeleteRuleJob(job: LX.MediaLibrary.ImportJob) {
      await deleteImportRule({
        ruleId: job.ruleId!,
        repository: mediaLibraryRepository,
        listApi,
      })
    },
    async onImportRuleJobFailed(job: LX.MediaLibrary.ImportJob, error: Error) {
      if (!job.ruleId) return
      const message = String(error?.message || error || 'job failed')
      await setRuleStatus(job.ruleId, 'failed', message)
      await setConnectionStatus(job.connectionId, 'failed', message, Date.now())
    },
    async onImportRuleJobPaused(job: LX.MediaLibrary.ImportJob) {
      if (!job.ruleId) return
      await setRuleStatus(job.ruleId, 'paused', 'paused', Date.now())
      await setConnectionStatus(job.connectionId, 'paused', 'paused', Date.now())
    },
    async onConnectionJobFailed(job: LX.MediaLibrary.ImportJob, error: Error) {
      const message = String(error?.message || error || 'job failed')
      await setConnectionStatus(job.connectionId, 'failed', message, Date.now())
    },
    async onDeleteRuleJobFailed(job: LX.MediaLibrary.ImportJob, error: Error) {
      if (!job.ruleId) return
      await setRuleStatus(job.ruleId, 'failed', `delete failed: ${String(error?.message || error || 'job failed')}`)
    },
  })

  return queue
}

export const ensureMediaLibraryJobQueue = async() => getQueue().ensureProcessing()

export const startMediaLibraryJobQueue = () => {
  void ensureMediaLibraryJobQueue()
}

export const enqueueImportRuleSyncJob = async({
  connectionId,
  ruleId,
  previousRule = null,
  triggerSource = 'manual',
  conflictMode = 'continue_previous',
  syncMode = 'incremental',
}: {
  connectionId: string
  ruleId: string
  previousRule?: LX.MediaLibrary.ImportRule | null
  triggerSource?: LX.MediaLibrary.SyncTriggerSource
  conflictMode?: LX.MediaLibrary.ImportJobConflictMode
  syncMode?: LX.MediaLibrary.SyncMode
}) => {
  const connections = await mediaLibraryRepository.getConnections() as LX.MediaLibrary.SourceConnection[]
  const connection = connections.find(item => item.connectionId === connectionId)
  await maybeStartBackgroundSync(connection)
  await setRuleStatus(ruleId, 'running', 'queued')
  await setConnectionStatus(connectionId, 'running', 'queued')
  return getQueue().enqueueImportRuleJob({
    connectionId,
    ruleId,
    payload: {
      previousRule,
      triggerSource,
      syncMode,
    },
    conflictMode,
  })
}

export const enqueueConnectionSyncJob = async({
  connectionId,
  triggerSource = 'manual',
  syncMode = 'incremental',
}: {
  connectionId: string
  triggerSource?: LX.MediaLibrary.SyncTriggerSource
  syncMode?: LX.MediaLibrary.SyncMode
}) => {
  const connections = await mediaLibraryRepository.getConnections() as LX.MediaLibrary.SourceConnection[]
  const connection = connections.find(item => item.connectionId === connectionId)
  await maybeStartBackgroundSync(connection)
  const job = await getQueue().enqueueConnectionJob({
    connectionId,
    payload: {
      triggerSource,
      syncMode,
    },
  })
  if (job.status === 'queued') {
    await setConnectionRulesStatus(connectionId, 'running', 'queued')
    await setConnectionStatus(connectionId, 'running', 'queued')
  }
  return job
}

export const triggerEligibleMediaLibraryAutoSync = async(trigger: LX.MediaLibrary.AutoSyncTrigger) => {
  return runEligibleMediaLibraryAutoSync({
    repository: mediaLibraryRepository,
    enqueueImportRuleSyncJob,
    trigger,
  })
}

export const enqueueDeleteImportRuleJob = async({
  connectionId,
  ruleId,
}: {
  connectionId: string
  ruleId: string
}) => {
  await setRuleStatus(ruleId, 'running', 'deleting')
  return getQueue().enqueueDeleteRuleJob({
    connectionId,
    ruleId,
  })
}
