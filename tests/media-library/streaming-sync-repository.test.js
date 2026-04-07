const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { createKeyBuilder, createMediaLibraryRepository } = require('../../src/core/mediaLibrary/repository.js')

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

test('createKeyBuilder exposes keys for sync runs candidates and snapshots', () => {
  const keys = createKeyBuilder('@media_library__')

  assert.equal(keys.syncRuns(), '@media_library__sync_runs')
  assert.equal(keys.syncCandidates('run_1'), '@media_library__sync_candidates__run_1')
  assert.equal(keys.syncSnapshot('rule_1'), '@media_library__sync_snapshot__rule_1')
})

test('repository persists sync runs candidates and snapshots separately from import jobs', async() => {
  const repository = createMediaLibraryRepository(createMemoryStorage())

  await repository.saveSyncRuns([{
    runId: 'run_1',
    providerType: 'onedrive',
    connectionId: 'conn_1',
    ruleId: 'rule_1',
    triggerSource: 'manual',
    phase: 'enumerate',
    status: 'running',
    startedAt: 100,
    discoveredCount: 12,
  }])
  await repository.saveSyncCandidates('run_1', [{
    sourceStableKey: 'song_1',
    hydrateState: 'hydrating',
    attempts: 1,
    pathOrUri: '/Music/song_1.mp3',
  }])
  await repository.saveSyncSnapshot('rule_1', {
    ruleId: 'rule_1',
    capturedAt: 200,
    items: [{
      sourceStableKey: 'song_1',
      versionToken: 'v1',
      pathOrUri: '/Music/song_1.mp3',
    }],
  })

  assert.deepEqual(await repository.getSyncRuns(), [{
    runId: 'run_1',
    providerType: 'onedrive',
    connectionId: 'conn_1',
    ruleId: 'rule_1',
    triggerSource: 'manual',
    phase: 'enumerate',
    status: 'running',
    startedAt: 100,
    finishedAt: null,
    discoveredCount: 12,
    readyCount: 0,
    degradedCount: 0,
    committedCount: 0,
    failedCount: 0,
  }])
  assert.deepEqual(await repository.getSyncCandidates('run_1'), [{
    sourceStableKey: 'song_1',
    hydrateState: 'hydrating',
    attempts: 1,
    pathOrUri: '/Music/song_1.mp3',
    fileName: '',
    versionToken: '',
    metadataLevelReached: 0,
    lastError: '',
    metadata: null,
  }])
  assert.deepEqual(await repository.getSyncSnapshot('rule_1'), {
    ruleId: 'rule_1',
    capturedAt: 200,
    items: [{
      sourceStableKey: 'song_1',
      versionToken: 'v1',
      pathOrUri: '/Music/song_1.mp3',
    }],
  })
  assert.deepEqual(await repository.getImportJobs(), [])
})

test('mediaLibrary types cover sync workspace entities and cache metadata extensions', () => {
  const content = fs.readFileSync(path.resolve(__dirname, '../../src/types/mediaLibrary.d.ts'), 'utf8')

  assert.match(content, /interface SyncRun/)
  assert.match(content, /interface SyncCandidate/)
  assert.match(content, /interface SyncSnapshot/)
  assert.match(content, /cacheOrigin\?:/)
  assert.match(content, /prefetchState\?:/)
})
