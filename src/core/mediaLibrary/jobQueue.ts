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
import { deleteImportRule, updateImportRule } from './importSync'
import { createMediaImportJobQueue } from './jobs.js'
import { createMediaLibraryListApi } from './listApi'
import { getMediaLibraryRuntimeRegistry } from './runtimeRegistry'
import { mediaLibraryRepository } from './storage'

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

let queue: ReturnType<typeof createMediaImportJobQueue> | null = null

const getQueue = () => {
  if (queue) return queue

  queue = createMediaImportJobQueue({
    repository: mediaLibraryRepository,
    async runImportRuleJob(job: LX.MediaLibrary.ImportJob) {
      const [rules, connections] = await Promise.all([
        mediaLibraryRepository.getImportRules() as Promise<LX.MediaLibrary.ImportRule[]>,
        mediaLibraryRepository.getConnections() as Promise<LX.MediaLibrary.SourceConnection[]>,
      ])
      const rule = rules.find(item => item.ruleId === job.ruleId)
      const connection = connections.find(item => item.connectionId === job.connectionId)
      if (!rule || !connection) return

      await setRuleStatus(rule.ruleId, 'running', 'running')
      await setConnectionStatus(connection.connectionId, 'running', 'running')
      const result = await updateImportRule({
        connection,
        rule,
        previousRule: job.payload?.previousRule ?? null,
        repository: mediaLibraryRepository,
        registry: getMediaLibraryRuntimeRegistry(),
        listApi,
      })
      const summary = result?.scanResult?.summary
        ? `success: ${result.scanResult.summary.success ?? 0}, failed: ${result.scanResult.summary.failed ?? 0}, skipped: ${result.scanResult.summary.skipped ?? 0}`
        : 'success'
      await setRuleStatus(rule.ruleId, result.isComplete ? 'success' : 'failed', summary, Date.now())
      await setConnectionStatus(connection.connectionId, result.isComplete ? 'success' : 'failed', summary, Date.now())
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
    async onDeleteRuleJobFailed(job: LX.MediaLibrary.ImportJob, error: Error) {
      if (!job.ruleId) return
      await setRuleStatus(job.ruleId, 'failed', `delete failed: ${String(error?.message || error || 'job failed')}`)
    },
  })

  return queue
}

export const startMediaLibraryJobQueue = () => {
  void getQueue().ensureProcessing()
}

export const enqueueImportRuleSyncJob = async({
  connectionId,
  ruleId,
  previousRule = null,
}: {
  connectionId: string
  ruleId: string
  previousRule?: LX.MediaLibrary.ImportRule | null
}) => {
  await setRuleStatus(ruleId, 'running', 'queued')
  await setConnectionStatus(connectionId, 'running', 'queued')
  return getQueue().enqueueImportRuleJob({
    connectionId,
    ruleId,
    payload: {
      previousRule,
    },
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
