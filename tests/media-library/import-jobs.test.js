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
