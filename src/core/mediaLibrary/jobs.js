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
  const activeJobs = items.filter(item => item.status === 'queued' || item.status === 'running')
  const finishedJobs = items
    .filter(item => item.status !== 'queued' && item.status !== 'running')
    .sort((left, right) => (left.finishedAt || 0) - (right.finishedAt || 0))

  return [...finishedJobs.slice(-limit), ...activeJobs]
}

function createMediaImportJobQueue({
  repository,
  runImportRuleJob,
  runDeleteRuleJob,
  onImportRuleJobFailed,
  onDeleteRuleJobFailed,
  now = () => Date.now(),
  finishedJobLimit = 20,
}) {
  let processingPromise = null
  let jobsMutationLock = Promise.resolve()

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

  async function claimNextQueuedJob() {
    return await withJobsMutation(async() => {
      const jobs = await getJobs()
      const job = jobs.find(item => item.status === 'queued')
      if (!job) return null

      const nextJob = {
        ...job,
        status: 'running',
        startedAt: now(),
        summary: 'running',
        error: '',
        attempt: (job.attempt || 0) + 1,
      }
      await saveJobs(updateJob(jobs, job.jobId, nextJob))
      return nextJob
    })
  }

  async function patchJobState(jobId, patch) {
    await withJobsMutation(async() => {
      const jobs = await getJobs()
      await saveJobs(updateJob(jobs, jobId, patch))
    })
  }

  async function processQueuedJobs() {
    while (true) {
      const job = await claimNextQueuedJob()
      if (!job) return

      try {
        if (job.type === 'import_rule_sync') {
          await runImportRuleJob?.(job)
        } else if (job.type === 'delete_rule_rebuild') {
          await runDeleteRuleJob?.(job)
        } else {
          throw new Error(`unknown media import job type: ${job.type}`)
        }

        await patchJobState(job.jobId, {
          status: 'success',
          finishedAt: now(),
          summary: 'success',
        })
      } catch (error) {
        const errorMessage = String(error?.message || error || 'job failed')
        if (job.type === 'import_rule_sync') await onImportRuleJobFailed?.(job, error)
        if (job.type === 'delete_rule_rebuild') await onDeleteRuleJobFailed?.(job, error)

        await patchJobState(job.jobId, {
          status: 'failed',
          finishedAt: now(),
          summary: errorMessage,
          error: errorMessage,
        })
      }
    }
  }

  async function requeueRunningJobs() {
    await withJobsMutation(async() => {
      const jobs = await getJobs()
      if (!jobs.some(item => item.status === 'running')) return
      await saveJobs(jobs.map(item => {
        if (item.status !== 'running') return item
        return {
          ...item,
          status: 'queued',
          summary: 'queued',
          startedAt: null,
        }
      }))
    })
  }

  async function ensureProcessing() {
    if (processingPromise) return processingPromise
    processingPromise = (async() => {
      await requeueRunningJobs()
      await processQueuedJobs()
    })().finally(() => {
      processingPromise = null
      getJobs().then(items => {
        if (!items.some(item => item.status === 'queued')) return
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
  }) {
    const job = await withJobsMutation(async() => {
      const nextJobs = (await getJobs()).filter(item => {
        return !(item.type === 'import_rule_sync' && item.ruleId === ruleId && item.status === 'queued')
      })
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
        payload,
      }
      await saveJobs([...nextJobs, nextJob])
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
