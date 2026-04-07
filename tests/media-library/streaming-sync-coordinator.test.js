const test = require('node:test')
const assert = require('node:assert/strict')

const { runRemoteStreamingSync } = require('../../src/core/mediaLibrary/streamingSync.js')

function createConnection() {
  return {
    connectionId: 'conn_1',
    providerType: 'onedrive',
    displayName: 'OneDrive',
    rootPathOrUri: '/',
  }
}

function createRule() {
  return {
    ruleId: 'rule_1',
    connectionId: 'conn_1',
    name: 'Albums',
    mode: 'merged',
    directories: [{
      selectionId: 'dir_1',
      kind: 'directory',
      pathOrUri: '/Albums',
      displayName: 'Albums',
    }],
    tracks: [],
  }
}

function createSourceItem({
  sourceItemId,
  pathOrUri,
  title,
  versionToken,
} = {}) {
  const resolvedPath = pathOrUri || `/${sourceItemId}.mp3`
  const fileName = resolvedPath.split('/').at(-1) || `${sourceItemId}.mp3`
  return {
    sourceItemId,
    connectionId: 'conn_1',
    providerType: 'onedrive',
    sourceUniqueKey: resolvedPath,
    pathOrUri: resolvedPath,
    fileName,
    title: title || fileName.replace(/\.[^.]+$/, ''),
    artist: 'artist',
    album: 'album',
    durationSec: 180,
    versionToken: versionToken || `v_${sourceItemId}`,
  }
}

function createCandidate(index) {
  return {
    sourceStableKey: `/Albums/song_${index}.mp3`,
    connectionId: 'conn_1',
    providerType: 'onedrive',
    pathOrUri: `/Albums/song_${index}.mp3`,
    fileName: `song_${index}.mp3`,
    fileSize: 100 + index,
    modifiedTime: 1700000000000 + index,
    versionToken: `v_song_${index}`,
    metadataLevelReached: 0,
  }
}

test('runRemoteStreamingSync keeps old list entries until final reconcile and commits new songs in batches', async() => {
  const connection = createConnection()
  const rule = createRule()
  const events = []
  const saved = {
    snapshot: null,
    sourceItems: null,
    aggregateSongs: null,
    syncRuns: null,
    syncCandidates: null,
    syncSnapshot: null,
  }
  const previousSnapshot = {
    ruleId: 'rule_1',
    scannedAt: 1,
    items: [
      createSourceItem({
        sourceItemId: 'missing_song_id',
        pathOrUri: '/Albums/missing.mp3',
        title: 'missing',
        versionToken: 'old',
      }),
    ],
  }

  const result = await runRemoteStreamingSync({
    connection,
    rule,
    repository: {
      async getImportSnapshot() {
        return previousSnapshot
      },
      async saveImportSnapshot(ruleId, snapshot) {
        saved.snapshot = { ruleId, snapshot }
      },
      async getImportRules() {
        return [rule]
      },
      async saveImportRules(items) {
        saved.rules = items
      },
      async getConnections() {
        return [connection]
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return saved.sourceItems?.items || []
      },
      async saveAggregateSongs(items) {
        saved.aggregateSongs = items
      },
      async getSyncRuns() {
        return []
      },
      async saveSyncRuns(items) {
        saved.syncRuns = items
      },
      async saveSyncCandidates(runId, items) {
        saved.syncCandidates = { runId, items }
      },
      async saveSyncSnapshot(ruleId, snapshot) {
        saved.syncSnapshot = { ruleId, snapshot }
      },
    },
    registry: {
      get() {
        return {
          async enumerateSelection() {
            return {
              complete: true,
              items: Array.from({ length: 12 }, (_, index) => createCandidate(index + 1)),
            }
          },
          async hydrateCandidate(_connection, candidate, { attempt }) {
            return {
              candidate,
              metadata: {
                title: candidate.fileName.replace(/\.[^.]+$/, ''),
                artist: `artist_${attempt}`,
                album: 'album',
                durationSec: 180,
              },
              metadataLevelReached: attempt,
            }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists(generatedLists) {
        const accountAll = generatedLists.find(item => item.listInfo.mediaSource.kind === 'account_all')
        events.push(['reconcile', accountAll?.list.map(item => item.id) || []])
      },
      async removeMissingSongs(ids) {
        events.push(['removeMissingSongs', ids])
      },
    },
    now: (() => {
      let value = 1000
      return () => ++value
    })(),
  })

  assert.equal(events[0][0], 'reconcile')
  assert.ok(events[0][1].includes('missing_song_id'))
  assert.equal(events[0][1].length, 11)
  assert.deepEqual(events.at(-1), ['removeMissingSongs', ['missing_song_id']])

  const lastReconcile = events.filter(event => event[0] === 'reconcile').at(-1)
  assert.equal(lastReconcile[1].includes('missing_song_id'), false)
  assert.equal(lastReconcile[1].length, 12)

  assert.deepEqual(result.removedIds, ['missing_song_id'])
  assert.equal(result.nextItems.length, 12)
  assert.equal(saved.snapshot.ruleId, 'rule_1')
  assert.equal(saved.snapshot.snapshot.items.length, 12)
  assert.equal(saved.sourceItems.connectionId, 'conn_1')
  assert.equal(saved.sourceItems.items.length, 12)
  assert.ok(Array.isArray(saved.aggregateSongs))
  assert.equal(saved.syncRuns.at(-1).status, 'success')
  assert.equal(saved.syncCandidates.items.length, 12)
  assert.equal(saved.syncSnapshot.ruleId, 'rule_1')
  assert.equal(saved.syncSnapshot.snapshot.items.length, 12)
})
