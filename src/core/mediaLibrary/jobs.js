function updateJob(items = [], jobId, patch) {
  return items.map(item => {
    if (item.jobId !== jobId) return item
    return {
      ...item,
      ...patch,
    }
  })
}

function trimFinishedJobs(items = [], limit = 20) {
  const activeJobs = items.filter(item => ['queued', 'running', 'paused'].includes(item.status))
  const finishedJobs = items
    .filter(item => !['queued', 'running', 'paused'].includes(item.status))
    .sort((left, right) => (left.finishedAt || 0) - (right.finishedAt || 0))

  return [...finishedJobs.slice(-limit), ...activeJobs]
}

function isJobStale(job, now, staleHeartbeatMs) {
  if (job?.status !== 'running') return false
  if (!job?.heartbeatAt) return true
  return now - job.heartbeatAt > staleHeartbeatMs
}

function createDefaultRuntimeOwnerId(now) {
  return `media_runtime__${now()}__${Math.random().toString(36).slice(2)}`
}

function createMediaImportJobQueue({
  repository,
  runImportRuleJob,
  runDeleteRuleJob,
  onImportRuleJobFailed,
  onImportRuleJobPaused,
  onDeleteRuleJobFailed,
  now = () => Date.now(),
  finishedJobLimit = 20,
  runtimeOwnerId = createDefaultRuntimeOwnerId(now),
  staleHeartbeatMs = 15_000,
  heartbeatIntervalMs = 3_000,
}) {
  let processingPromise = null
  let jobsMutationLock = Promise.resolve()
  let blockedRetryTimer = null

  async function saveJobs(items) {
    if (typeof repository.saveImportJobs !== 'function') return
    await repository.saveImportJobs(trimFinishedJobs(items, finishedJobLimit))
  }

  async function getJobs() {
    if (typeof repository.getImportJobs !== 'function') return []
    return await repository.getImportJobs()
  }

  async function withJobsMutation(run) {
    const previousLock = jobsMutationLock
    let releaseLock
    jobsMutationLock = new Promise(resolve => {
      releaseLock = resolve
    })
    await previousLock
    try {
      return await run()
    } finally {
      releaseLock()
    }
  }

  async function startBlockedRetry() {
    if (blockedRetryTimer) return
    blockedRetryTimer = setTimeout(() => {
      blockedRetryTimer = null
      ensureProcessing().catch(() => null)
    }, Math.min(Math.max(Math.trunc(staleHeartbeatMs / 2), 500), 5_000))
    blockedRetryTimer.unref?.()
  }

  async function resumePausedJobs(completedJobId) {
    if (!completedJobId) return
    await withJobsMutation(async() => {
      const jobs = await getJobs()
      const pausedJobs = jobs.filter(item => item.status === 'paused' && item.resumeAfterJobId === completedJobId)
      if (!pausedJobs.length) return
      const pausedIds = new Set(pausedJobs.map(item => item.jobId))
      const resumedJobs = pausedJobs.map(item => ({
        ...item,
        status: 'queued',
        summary: 'queued',
        startedAt: null,
        finishedAt: null,
        pauseRequestedAt: null,
        resumeAfterJobId: null,
        runtimeOwnerId: null,
        heartbeatAt: null,
      }))
      const remainingJobs = jobs.filter(item => !pausedIds.has(item.jobId))
      await saveJobs([...resumedJobs, ...remainingJobs])
    })
  }

  async function claimNextQueuedJob() {
    return await withJobsMutation(async() => {
      const jobs = await getJobs()
      const blockingRunningJob = jobs.find(item => {
        return item.status === 'running' &&
          item.runtimeOwnerId &&
          item.runtimeOwnerId !== runtimeOwnerId &&
          !isJobStale(item, now(), staleHeartbeatMs)
      })
      if (blockingRunningJob) return { blocked: true, job: null }

      const job = jobs.find(item => item.status === 'queued')
      if (!job) return { blocked: false, job: null }

      const nextJob = {
        ...job,
        status: 'running',
        startedAt: now(),
        summary: 'running',
        error: '',
        attempt: (job.attempt || 0) + 1,
        runtimeOwnerId,
        heartbeatAt: now(),
        pauseRequestedAt: null,
      }
      await saveJobs(updateJob(jobs, job.jobId, nextJob))
      return { blocked: false, job: nextJob }
    })
  }

  async function patchJobState(jobId, patch) {
    await withJobsMutation(async() => {
      const jobs = await getJobs()
      await saveJobs(updateJob(jobs, jobId, patch))
    })
  }

  async function isPauseRequested(jobId) {
    const jobs = await getJobs()
    const job = jobs.find(item => item.jobId === jobId)
    return Boolean(job?.pauseRequestedAt)
  }

  function startHeartbeat(jobId) {
    const interval = setInterval(() => {
      patchJobState(jobId, {
        heartbeatAt: now(),
      }).catch(() => null)
    }, heartbeatIntervalMs)
    interval.unref?.()
    return () => {
      clearInterval(interval)
    }
  }

  async function processQueuedJobs() {
    while (true) {
      const { blocked, job } = await claimNextQueuedJob()
      if (blocked) return { blocked: true }
      if (!job) return { blocked: false }

      const stopHeartbeat = startHeartbeat(job.jobId)

      try {
        if (job.type === 'import_rule_sync') {
          await runImportRuleJob?.(job, {
            isPauseRequested: async() => await isPauseRequested(job.jobId),
            heartbeat: async() => await patchJobState(job.jobId, { heartbeatAt: now() }),
          })
        } else if (job.type === 'delete_rule_rebuild') {
          await runDeleteRuleJob?.(job)
        } else {
          throw new Error(`unknown media import job type: ${job.type}`)
        }

        const pauseRequested = await isPauseRequested(job.jobId)
        if (pauseRequested) {
          await onImportRuleJobPaused?.(job)
          await patchJobState(job.jobId, {
            status: 'paused',
            finishedAt: now(),
            summary: 'paused',
            runtimeOwnerId: null,
            heartbeatAt: null,
          })
          continue
        }

        await patchJobState(job.jobId, {
          status: 'success',
          finishedAt: now(),
          summary: 'success',
          runtimeOwnerId,
          heartbeatAt: now(),
          pauseRequestedAt: null,
        })
        await resumePausedJobs(job.jobId)
      } catch (error) {
        if (error?.code === 'MEDIA_IMPORT_JOB_PAUSED') {
          await onImportRuleJobPaused?.(job)
          await patchJobState(job.jobId, {
            status: 'paused',
            finishedAt: now(),
            summary: 'paused',
            error: '',
            runtimeOwnerId: null,
            heartbeatAt: null,
          })
          continue
        }

        const errorMessage = String(error?.message || error || 'job failed')
        if (job.type === 'import_rule_sync') await onImportRuleJobFailed?.(job, error)
        if (job.type === 'delete_rule_rebuild') await onDeleteRuleJobFailed?.(job, error)

        await patchJobState(job.jobId, {
          status: 'failed',
          finishedAt: now(),
          summary: errorMessage,
          error: errorMessage,
          runtimeOwnerId,
          heartbeatAt: now(),
        })
        await resumePausedJobs(job.jobId)
      } finally {
        stopHeartbeat()
      }
    }
  }

  async function requeueRunningJobs() {
    await withJobsMutation(async() => {
      const jobs = await getJobs()
      if (!jobs.some(item => item.status === 'running')) return
      await saveJobs(jobs.map(item => {
        if (item.status !== 'running') return item
        if (!isJobStale(item, now(), staleHeartbeatMs)) return item
        return {
          ...item,
          status: 'queued',
          summary: 'queued',
          startedAt: null,
          runtimeOwnerId: null,
          heartbeatAt: null,
          pauseRequestedAt: null,
        }
      }))
    })
  }

  async function ensureProcessing() {
    if (processingPromise) return processingPromise
    processingPromise = (async() => {
      await requeueRunningJobs()
      return await processQueuedJobs()
    })().finally(() => {
      processingPromise = null
      getJobs().then(async items => {
        if (!items.some(item => item.status === 'queued')) return
        const blockedByForeignRunning = items.some(item => {
          return item.status === 'running' &&
            item.runtimeOwnerId &&
            item.runtimeOwnerId !== runtimeOwnerId &&
            !isJobStale(item, now(), staleHeartbeatMs)
        })
        if (blockedByForeignRunning) {
          await startBlockedRetry()
          return
        }
        return ensureProcessing()
      }).catch(() => null)
    })
    return processingPromise
  }

  async function enqueueImportRuleJob({
    jobId = `media_job__${now()}`,
    connectionId,
    ruleId,
    payload = null,
    conflictMode = 'continue_previous',
  }) {
    const job = await withJobsMutation(async() => {
      let nextJobs = (await getJobs()).filter(item => {
        return !(item.type === 'import_rule_sync' && item.ruleId === ruleId && item.status === 'queued')
      })
      const activeRunningJob = nextJobs.find(item => {
        return item.type === 'import_rule_sync' &&
          item.status === 'running' &&
          !isJobStale(item, now(), staleHeartbeatMs)
      })
      if (activeRunningJob && conflictMode === 'current_first') {
        nextJobs = nextJobs.map(item => {
          if (item.jobId !== activeRunningJob.jobId) return item
          return {
            ...item,
            pauseRequestedAt: now(),
            resumeAfterJobId: jobId,
            summary: 'pause_requested',
          }
        })
      }
      const nextJob = {
        jobId,
        type: 'import_rule_sync',
        connectionId,
        ruleId,
        status: 'queued',
        attempt: 0,
        createdAt: now(),
        startedAt: null,
        finishedAt: null,
        summary: 'queued',
        error: '',
        runtimeOwnerId: null,
        heartbeatAt: null,
        pauseRequestedAt: null,
        resumeAfterJobId: null,
        payload,
      }
      await saveJobs(activeRunningJob && conflictMode === 'current_first'
        ? [nextJob, ...nextJobs]
        : [...nextJobs, nextJob])
      return nextJob
    })
    ensureProcessing().catch(() => null)
    return job
  }

  async function enqueueDeleteRuleJob({
    jobId = `media_job__${now()}`,
    connectionId,
    ruleId,
    payload = null,
  }) {
    const job = await withJobsMutation(async() => {
      const nextJobs = (await getJobs()).filter(item => !(item.ruleId === ruleId && item.status === 'queued'))
      const nextJob = {
        jobId,
        type: 'delete_rule_rebuild',
        connectionId,
        ruleId,
        status: 'queued',
        attempt: 0,
        createdAt: now(),
        startedAt: null,
        finishedAt: null,
        summary: 'queued',
        error: '',
        runtimeOwnerId: null,
        heartbeatAt: null,
        pauseRequestedAt: null,
        resumeAfterJobId: null,
        payload,
      }
      await saveJobs([...nextJobs, nextJob])
      return nextJob
    })
    ensureProcessing().catch(() => null)
    return job
  }

  return {
    ensureProcessing,
    enqueueDeleteRuleJob,
    enqueueImportRuleJob,
    getJobs,
  }
}

module.exports = {
  createMediaImportJobQueue,
}
