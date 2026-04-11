const test = require('node:test')
const assert = require('node:assert/strict')

const { createMediaLibraryRepository } = require('../../src/core/mediaLibrary/repository.js')

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

test('repository persists import rules and snapshots separately from connections', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveImportRules([{
    ruleId: 'rule_1',
    connectionId: 'conn_1',
    name: 'Albums',
    mode: 'per_directory',
    directories: [{
      selectionId: 'dir_1',
      kind: 'directory',
      pathOrUri: '/Albums',
      displayName: 'Albums',
    }],
    tracks: [],
  }])
  await repo.saveImportSnapshot('rule_1', {
    ruleId: 'rule_1',
    scannedAt: 100,
    items: [{
      sourceItemId: 'item_1',
      connectionId: 'conn_1',
      providerType: 'local',
      sourceUniqueKey: '/Albums/song.mp3',
      pathOrUri: '/Albums/song.mp3',
      versionToken: 'v1',
    }],
  })

  const rules = await repo.getImportRules()
  const snapshot = await repo.getImportSnapshot('rule_1')
  const connections = await repo.getConnections()

  assert.equal(rules[0].ruleId, 'rule_1')
  assert.equal(snapshot.items[0].sourceItemId, 'item_1')
  assert.deepEqual(connections, [])
})

test('removeImportSnapshots deletes stored rule snapshots without touching rules', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveImportRules([{
    ruleId: 'rule_1',
    connectionId: 'conn_1',
    name: 'Albums',
    mode: 'merged',
    directories: [],
    tracks: [],
  }])
  await repo.saveImportSnapshot('rule_1', {
    ruleId: 'rule_1',
    scannedAt: 100,
    items: [],
  })

  await repo.removeImportSnapshots(['rule_1'])

  assert.equal(await repo.getImportSnapshot('rule_1'), null)
  assert.equal((await repo.getImportRules()).length, 1)
})

test('repository persists import jobs separately from rules', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveImportRules([{
    ruleId: 'rule_1',
    connectionId: 'conn_1',
    name: 'Albums',
    mode: 'merged',
    directories: [],
    tracks: [],
  }])
  await repo.saveImportJobs([{
    jobId: 'job_1',
    type: 'import_rule_sync',
    connectionId: 'conn_1',
    ruleId: 'rule_1',
    status: 'queued',
    attempt: 0,
    createdAt: 123,
    payload: {
      previousRule: {
        ruleId: 'rule_prev',
      },
    },
  }])

  const jobs = await repo.getImportJobs()

  assert.deepEqual(jobs, [{
    jobId: 'job_1',
    type: 'import_rule_sync',
    connectionId: 'conn_1',
    ruleId: 'rule_1',
    status: 'queued',
    attempt: 0,
    createdAt: 123,
    startedAt: null,
    finishedAt: null,
    summary: '',
    error: '',
    runtimeOwnerId: null,
    heartbeatAt: null,
    pauseRequestedAt: null,
    resumeAfterJobId: null,
    payload: {
      previousRule: {
        ruleId: 'rule_prev',
      },
    },
  }])
  assert.equal((await repo.getImportRules()).length, 1)
})
