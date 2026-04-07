const test = require('node:test')
const assert = require('node:assert/strict')

const { createMediaLibraryRepository } = require('../../src/core/mediaLibrary/repository.js')
const { createMediaImportJobQueue } = require('../../src/core/mediaLibrary/jobs.js')

const createMemoryStorage = () => {
  const map = new Map()
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null
    },
    async set(key, value) {
      map.set(key, value)
    },
    async remove(key) {
      map.delete(key)
    },
  }
}

const waitForQueueToDrain = async(queue) => {
  for (let i = 0; i < 5; i++) {
    await queue.ensureProcessing()
    const jobs = await queue.getJobs()
    if (!jobs.some(job => job.status === 'queued' || job.status === 'running')) return
  }
}

test('media import queue dedupes queued sync jobs for the same rule and runs the latest payload', async() => {
  const calls = []
  const repo = createMediaLibraryRepository(createMemoryStorage())
  const queue = createMediaImportJobQueue({
    repository: repo,
    now: (() => {
      let value = 100
      return () => ++value
    })(),
    async runImportRuleJob(job) {
      calls.push(['sync', job.ruleId, job.payload?.previousRule?.ruleId || null])
    },
  })

  await repo.saveImportJobs([{
    jobId: 'job_existing',
    type: 'import_rule_sync',
    connectionId: 'conn_1',
    ruleId: 'rule_1',
    status: 'queued',
    attempt: 0,
    createdAt: 90,
    startedAt: null,
    finishedAt: null,
    summary: 'queued',
    error: '',
    payload: {
      previousRule: {
        ruleId: 'prev_1',
      },
    },
  }])
  await queue.enqueueImportRuleJob({
    connectionId: 'conn_1',
    ruleId: 'rule_1',
    payload: {
      previousRule: {
        ruleId: 'prev_2',
      },
    },
  })

  await waitForQueueToDrain(queue)

  assert.deepEqual(calls, [
    ['sync', 'rule_1', 'prev_2'],
  ])

  const jobs = await repo.getImportJobs()
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].status, 'success')
})

test('media import queue runs delete jobs after queued sync jobs and records failures', async() => {
  const calls = []
  const failures = []
  let releaseSyncJob
  const syncJobDone = new Promise(resolve => {
    releaseSyncJob = resolve
  })
  const repo = createMediaLibraryRepository(createMemoryStorage())
  const queue = createMediaImportJobQueue({
    repository: repo,
    now: (() => {
      let value = 200
      return () => ++value
    })(),
    async runImportRuleJob(job) {
      calls.push(['sync', job.ruleId])
      await syncJobDone
    },
    async runDeleteRuleJob(job) {
      calls.push(['delete', job.ruleId])
      throw new Error('delete failed')
    },
    async onDeleteRuleJobFailed(job, error) {
      failures.push([job.ruleId, String(error.message || error)])
    },
  })

  await queue.enqueueImportRuleJob({
    connectionId: 'conn_1',
    ruleId: 'rule_1',
  })
  await queue.enqueueDeleteRuleJob({
    connectionId: 'conn_1',
    ruleId: 'rule_2',
  })
  releaseSyncJob()

  await waitForQueueToDrain(queue)

  assert.deepEqual(calls, [
    ['sync', 'rule_1'],
    ['delete', 'rule_2'],
  ])
  assert.deepEqual(failures, [
    ['rule_2', 'delete failed'],
  ])

  const jobs = await repo.getImportJobs()
  assert.deepEqual(jobs.map(job => [job.ruleId, job.status]), [
    ['rule_1', 'success'],
    ['rule_2', 'failed'],
  ])
})

test('media import queue keeps fresh foreign running jobs and only recovers stale owners', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())
  const queue = createMediaImportJobQueue({
    repository: repo,
    runtimeOwnerId: 'runtime_local',
    staleHeartbeatMs: 50,
    now: () => 1_000,
    async runImportRuleJob() {},
  })

  await repo.saveImportJobs([
    {
      jobId: 'job_fresh_running',
      type: 'import_rule_sync',
      connectionId: 'conn_1',
      ruleId: 'rule_fresh',
      status: 'running',
      attempt: 1,
      createdAt: 900,
      startedAt: 950,
      heartbeatAt: 990,
      runtimeOwnerId: 'runtime_foreign',
      summary: 'running',
      error: '',
      payload: null,
    },
    {
      jobId: 'job_stale_running',
      type: 'import_rule_sync',
      connectionId: 'conn_1',
      ruleId: 'rule_stale',
      status: 'running',
      attempt: 1,
      createdAt: 900,
      startedAt: 910,
      heartbeatAt: 920,
      runtimeOwnerId: 'runtime_crashed',
      summary: 'running',
      error: '',
      payload: null,
    },
  ])

  await waitForQueueToDrain(queue)

  const jobs = await repo.getImportJobs()
  const freshJob = jobs.find(job => job.jobId === 'job_fresh_running')
  const staleJob = jobs.find(job => job.jobId === 'job_stale_running')

  assert.equal(freshJob.status, 'running')
  assert.equal(freshJob.runtimeOwnerId, 'runtime_foreign')
  assert.ok((freshJob.heartbeatAt || 0) >= 990)
  assert.equal(staleJob.status, 'queued')
  assert.equal(staleJob.runtimeOwnerId, null)
})

test('media import queue current_first marks the active job for pause and prepends the new job', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())
  const queue = createMediaImportJobQueue({
    repository: repo,
    runtimeOwnerId: 'runtime_local',
    staleHeartbeatMs: 50,
    now: () => 1_000,
    async runImportRuleJob() {},
  })

  await repo.saveImportJobs([
    {
      jobId: 'job_running',
      type: 'import_rule_sync',
      connectionId: 'conn_1',
      ruleId: 'rule_running',
      status: 'running',
      attempt: 1,
      createdAt: 900,
      startedAt: 950,
      heartbeatAt: 990,
      runtimeOwnerId: 'runtime_foreign',
      summary: 'running',
      error: '',
      payload: null,
    },
    {
      jobId: 'job_existing_queued',
      type: 'import_rule_sync',
      connectionId: 'conn_1',
      ruleId: 'rule_existing',
      status: 'queued',
      attempt: 0,
      createdAt: 980,
      startedAt: null,
      finishedAt: null,
      summary: 'queued',
      error: '',
      payload: null,
    },
  ])

  await queue.enqueueImportRuleJob({
    jobId: 'job_priority',
    connectionId: 'conn_1',
    ruleId: 'rule_priority',
    conflictMode: 'current_first',
  })

  const jobs = await repo.getImportJobs()

  assert.deepEqual(jobs.map(job => job.jobId), [
    'job_priority',
    'job_running',
    'job_existing_queued',
  ])
  const runningJob = jobs.find(job => job.jobId === 'job_running')
  assert.equal(runningJob.pauseRequestedAt, 1_000)
  assert.equal(runningJob.status, 'running')
  assert.equal(jobs[0].status, 'queued')
})

test('media import queue pauses the active job for current_first and resumes it after the priority job', async() => {
  const calls = []
  const repo = createMediaLibraryRepository(createMemoryStorage())
  let releaseRunningJob
  const runningJobStarted = new Promise(resolve => {
    releaseRunningJob = resolve
  })
  let allowRunningJobToFinish
  const runningJobCanFinish = new Promise(resolve => {
    allowRunningJobToFinish = resolve
  })

  const queue = createMediaImportJobQueue({
    repository: repo,
    runtimeOwnerId: 'runtime_local',
    staleHeartbeatMs: 50,
    now: (() => {
      let value = 1_000
      return () => ++value
    })(),
    async runImportRuleJob(job, control) {
      calls.push(job.ruleId)
      if (job.ruleId === 'rule_running' && calls.filter(id => id === 'rule_running').length === 1) {
        releaseRunningJob()
        await runningJobCanFinish
        assert.equal(await control.isPauseRequested(), true)
        const pauseError = new Error('job paused')
        pauseError.code = 'MEDIA_IMPORT_JOB_PAUSED'
        throw pauseError
      }
    },
  })

  await queue.enqueueImportRuleJob({
    jobId: 'job_running',
    connectionId: 'conn_1',
    ruleId: 'rule_running',
  })

  await runningJobStarted

  await queue.enqueueImportRuleJob({
    jobId: 'job_priority',
    connectionId: 'conn_1',
    ruleId: 'rule_priority',
    conflictMode: 'current_first',
  })

  allowRunningJobToFinish()
  await waitForQueueToDrain(queue)

  assert.deepEqual(calls, [
    'rule_running',
    'rule_priority',
    'rule_running',
  ])

  const jobs = await repo.getImportJobs()
  assert.equal(jobs.find(job => job.jobId === 'job_running')?.status, 'success')
  assert.equal(jobs.find(job => job.jobId === 'job_priority')?.status, 'success')
})

test('media import queue resumes a paused job after the priority job fails', async() => {
  const calls = []
  const repo = createMediaLibraryRepository(createMemoryStorage())
  let releaseRunningJob
  const runningJobStarted = new Promise(resolve => {
    releaseRunningJob = resolve
  })
  let allowRunningJobToPause
  const runningJobCanPause = new Promise(resolve => {
    allowRunningJobToPause = resolve
  })

  const queue = createMediaImportJobQueue({
    repository: repo,
    runtimeOwnerId: 'runtime_local',
    staleHeartbeatMs: 50,
    now: (() => {
      let value = 2_000
      return () => ++value
    })(),
    async runImportRuleJob(job, control) {
      calls.push(job.ruleId)
      if (job.ruleId === 'rule_running' && calls.filter(id => id === 'rule_running').length === 1) {
        releaseRunningJob()
        await runningJobCanPause
        assert.equal(await control.isPauseRequested(), true)
        const pauseError = new Error('job paused')
        pauseError.code = 'MEDIA_IMPORT_JOB_PAUSED'
        throw pauseError
      }
      if (job.ruleId === 'rule_priority') {
        throw new Error('priority failed')
      }
    },
  })

  await queue.enqueueImportRuleJob({
    jobId: 'job_running',
    connectionId: 'conn_1',
    ruleId: 'rule_running',
  })

  await runningJobStarted

  await queue.enqueueImportRuleJob({
    jobId: 'job_priority',
    connectionId: 'conn_1',
    ruleId: 'rule_priority',
    conflictMode: 'current_first',
  })

  allowRunningJobToPause()
  await waitForQueueToDrain(queue)

  assert.deepEqual(calls, [
    'rule_running',
    'rule_priority',
    'rule_running',
  ])

  const jobs = await repo.getImportJobs()
  assert.equal(jobs.find(job => job.jobId === 'job_running')?.status, 'success')
  assert.equal(jobs.find(job => job.jobId === 'job_priority')?.status, 'failed')
})

test('media import queue current_first does not try to pause running delete jobs', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())
  const queue = createMediaImportJobQueue({
    repository: repo,
    runtimeOwnerId: 'runtime_local',
    staleHeartbeatMs: 50,
    now: () => 3_000,
    async runImportRuleJob() {},
  })

  await repo.saveImportJobs([
    {
      jobId: 'job_delete_running',
      type: 'delete_rule_rebuild',
      connectionId: 'conn_1',
      ruleId: 'rule_delete',
      status: 'running',
      attempt: 1,
      createdAt: 2_900,
      startedAt: 2_950,
      heartbeatAt: 2_990,
      runtimeOwnerId: 'runtime_foreign',
      summary: 'running',
      error: '',
      payload: null,
    },
  ])

  await queue.enqueueImportRuleJob({
    jobId: 'job_priority',
    connectionId: 'conn_1',
    ruleId: 'rule_priority',
    conflictMode: 'current_first',
  })

  const jobs = await repo.getImportJobs()
  assert.deepEqual(jobs.map(job => job.jobId), [
    'job_delete_running',
    'job_priority',
  ])
  assert.equal(jobs.find(job => job.jobId === 'job_delete_running')?.pauseRequestedAt ?? null, null)
  assert.equal(jobs.find(job => job.jobId === 'job_priority')?.status, 'queued')
})
