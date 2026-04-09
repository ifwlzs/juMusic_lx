const test = require('node:test')
const assert = require('node:assert/strict')

const { buildGeneratedListsForConnection } = require('../../src/core/mediaLibrary/systemLists.js')
const {
  syncImportRule,
  updateImportRule,
  deleteImportRule,
  deleteMediaConnection,
} = require('../../src/core/mediaLibrary/importSync.js')

function createConnection({
  connectionId = 'conn_1',
  providerType = 'local',
  displayName = 'Disk',
  credentialRef = null,
} = {}) {
  return {
    connectionId,
    providerType,
    displayName,
    rootPathOrUri: '/Music',
    credentialRef,
  }
}

function createRule({
  ruleId = 'rule_1',
  connectionId = 'conn_1',
  name = 'Albums',
  mode = 'merged',
  directories = [{
    selectionId: 'dir_1',
    kind: 'directory',
    pathOrUri: '/Albums',
    displayName: 'Albums',
  }],
  tracks = [],
} = {}) {
  return {
    ruleId,
    connectionId,
    name,
    mode,
    directories,
    tracks,
  }
}

function createSourceItem({
  sourceItemId,
  connectionId = 'conn_1',
  providerType = 'local',
  pathOrUri,
  fileName,
  title,
  artist = '',
  album = '',
  durationSec = 180,
  versionToken,
} = {}) {
  const resolvedPath = pathOrUri || `/${sourceItemId}.mp3`
  const resolvedFileName = fileName || resolvedPath.split('/').at(-1) || `${sourceItemId}.mp3`
  return {
    sourceItemId,
    connectionId,
    providerType,
    sourceUniqueKey: resolvedPath,
    pathOrUri: resolvedPath,
    fileName: resolvedFileName,
    title: title || resolvedFileName.replace(/\.[^.]+$/, ''),
    artist,
    album,
    durationSec,
    versionToken: versionToken || `v_${sourceItemId}`,
  }
}

function createCandidate({
  connectionId = 'conn_1',
  providerType = 'local',
  pathOrUri,
  fileName,
  versionToken,
  modifiedTime = 0,
} = {}) {
  const resolvedPath = pathOrUri || '/song.mp3'
  const resolvedFileName = fileName || resolvedPath.split('/').at(-1) || 'song.mp3'
  return {
    sourceStableKey: resolvedPath,
    connectionId,
    providerType,
    pathOrUri: resolvedPath,
    fileName: resolvedFileName,
    fileSize: 100,
    modifiedTime,
    versionToken: versionToken || `v_${resolvedFileName}`,
    metadataLevelReached: 0,
  }
}

test('buildGeneratedListsForConnection creates account-all and per-directory lists', () => {
  const connection = {
    connectionId: 'conn_1',
    providerType: 'local',
    displayName: 'Disk',
  }
  const rules = [{
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
    tracks: [{
      selectionId: 'track_1',
      kind: 'track',
      pathOrUri: '/Singles/loose.mp3',
      displayName: 'loose.mp3',
    }],
  }]
  const snapshots = new Map([['rule_1', {
    ruleId: 'rule_1',
    scannedAt: 100,
    items: [
      {
        sourceItemId: 'item_1',
        connectionId: 'conn_1',
        providerType: 'local',
        sourceUniqueKey: '/Albums/song.mp3',
        pathOrUri: '/Albums/song.mp3',
        fileName: 'song.mp3',
        title: 'song',
        artist: '',
        album: '',
        durationSec: 180,
        versionToken: 'v1',
      },
      {
        sourceItemId: 'item_2',
        connectionId: 'conn_1',
        providerType: 'local',
        sourceUniqueKey: '/Singles/loose.mp3',
        pathOrUri: '/Singles/loose.mp3',
        fileName: 'loose.mp3',
        title: 'loose',
        artist: '',
        album: '',
        durationSec: 181,
        versionToken: 'v2',
      },
    ],
  }]])

  const lists = buildGeneratedListsForConnection({ connection, rules, snapshots })

  assert.deepEqual(lists.map(item => item.listInfo.mediaSource.kind), [
    'account_all',
    'rule_directory',
    'rule_singles',
  ])
  assert.equal(lists[0].list.length, 2)
  assert.equal(lists[1].list.length, 1)
  assert.equal(lists[2].list.length, 1)
})

test('syncImportRule adds new songs before removing missing songs', async() => {
  const calls = []
  const saved = {
    snapshot: null,
    sourceItems: null,
    aggregateSongs: null,
  }
  const connection = {
    connectionId: 'conn_1',
    providerType: 'local',
    displayName: 'Disk',
  }
  const rule = {
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

  await syncImportRule({
    connection,
    rule,
    repository: {
      async getImportSnapshot() {
        return {
          ruleId: 'rule_1',
          scannedAt: 1,
          items: [{
            sourceItemId: 'old',
            connectionId: 'conn_1',
            providerType: 'local',
            sourceUniqueKey: '/Albums/old.mp3',
            pathOrUri: '/Albums/old.mp3',
            fileName: 'old.mp3',
            title: 'old',
            artist: '',
            album: '',
            durationSec: 180,
            versionToken: 'old',
          }],
        }
      },
      async saveImportSnapshot(ruleId, snapshot) {
        saved.snapshot = { ruleId, snapshot }
      },
      async getImportRules() {
        return [rule]
      },
      async saveImportRules() {},
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
      async removeImportSnapshots() {},
    },
    registry: {
      get() {
        return {
          async scanSelection() {
            return {
              complete: true,
              items: [{
                sourceItemId: 'new',
                connectionId: 'conn_1',
                providerType: 'local',
                sourceUniqueKey: '/Albums/new.mp3',
                pathOrUri: '/Albums/new.mp3',
                fileName: 'new.mp3',
                title: 'new',
                artist: '',
                album: '',
                durationSec: 180,
                versionToken: 'new',
              }],
            }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists(generatedLists) {
        calls.push(['reconcile', generatedLists.map(item => item.listInfo.id)])
      },
      async removeMissingSongs(ids) {
        calls.push(['remove', ids])
      },
    },
  })

  assert.deepEqual(calls, [
    ['reconcile', ['media__conn_1__account_all', 'media__conn_1__rule_1__merged']],
    ['remove', ['old']],
  ])
  assert.equal(saved.snapshot.ruleId, 'rule_1')
  assert.deepEqual(saved.sourceItems.items.map(item => item.sourceItemId), ['new'])
  assert.ok(Array.isArray(saved.aggregateSongs))
})

test('syncImportRule keeps previous songs when scan is incomplete', async() => {
  const calls = []
  const saved = {
    snapshot: null,
    sourceItems: null,
  }
  const connection = {
    connectionId: 'conn_1',
    providerType: 'local',
    displayName: 'Disk',
  }
  const rule = {
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

  await syncImportRule({
    connection,
    rule,
    repository: {
      async getImportSnapshot() {
        return {
          ruleId: 'rule_1',
          scannedAt: 1,
          items: [{
            sourceItemId: 'old',
            connectionId: 'conn_1',
            providerType: 'local',
            sourceUniqueKey: '/Albums/old.mp3',
            pathOrUri: '/Albums/old.mp3',
            fileName: 'old.mp3',
            title: 'old',
            artist: '',
            album: '',
            durationSec: 180,
            versionToken: 'old',
          }],
        }
      },
      async saveImportSnapshot(ruleId, snapshot) {
        saved.snapshot = { ruleId, snapshot }
      },
      async getImportRules() {
        return [rule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return saved.sourceItems?.items || []
      },
      async saveAggregateSongs() {},
      async removeImportSnapshots() {},
    },
    registry: {
      get() {
        return {
          async scanSelection() {
            return {
              complete: false,
              items: [{
                sourceItemId: 'new',
                connectionId: 'conn_1',
                providerType: 'local',
                sourceUniqueKey: '/Albums/new.mp3',
                pathOrUri: '/Albums/new.mp3',
                fileName: 'new.mp3',
                title: 'new',
                artist: '',
                album: '',
                durationSec: 180,
                versionToken: 'new',
              }],
            }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists(generatedLists) {
        calls.push(['reconcile', generatedLists[1].list.map(item => item.id)])
      },
      async removeMissingSongs(ids) {
        calls.push(['remove', ids])
      },
    },
  })

  assert.deepEqual(calls, [
    ['reconcile', ['old', 'new']],
  ])
  assert.equal(saved.snapshot, null)
  assert.deepEqual(saved.sourceItems.items.map(item => item.sourceItemId), ['old', 'new'])
})

test('updateImportRule removes truly missing covered songs but keeps scope-removed songs as placeholders', async() => {
  const connection = createConnection()
  const previousRule = createRule({
    directories: [{
      selectionId: 'dir_old',
      kind: 'directory',
      pathOrUri: '/Albums',
      displayName: 'Albums',
    }],
  })
  const nextRule = createRule({
    directories: [{
      selectionId: 'dir_new',
      kind: 'directory',
      pathOrUri: '/Albums/New',
      displayName: 'New',
    }],
  })
  const previousSnapshot = {
    ruleId: 'rule_1',
    scannedAt: 1,
    items: [
      createSourceItem({
        sourceItemId: 'item_scope_removed',
        pathOrUri: '/Albums/Old/song.mp3',
      }),
      createSourceItem({
        sourceItemId: 'item_source_deleted',
        pathOrUri: '/Albums/New/missing.mp3',
      }),
    ],
  }
  const calls = []
  const saved = {
    snapshot: null,
  }
  const now = () => 200

  await updateImportRule({
    connection,
    rule: nextRule,
    previousRule,
    syncMode: 'full_validation',
    repository: {
      async getImportSnapshot() {
        return previousSnapshot
      },
      async saveImportSnapshot(ruleId, snapshot) {
        saved.snapshot = { ruleId, snapshot }
      },
      async getImportRules() {
        return [nextRule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems() {},
      async getAllSourceItems() {
        return [
          createSourceItem({
            sourceItemId: 'item_keep',
            pathOrUri: '/Albums/New/keep.mp3',
          }),
        ]
      },
      async saveAggregateSongs() {},
    },
    registry: {
      get() {
        return {
          async scanSelection() {
            return {
              complete: true,
              items: [
                createSourceItem({
                  sourceItemId: 'item_keep',
                  pathOrUri: '/Albums/New/keep.mp3',
                }),
              ],
            }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists(generatedLists) {
        calls.push(['reconcile', generatedLists.map(item => item.listInfo.id)])
      },
      async removeMissingSongs(ids) {
        calls.push(['remove', ids])
      },
      async markRuleRemoved(ids) {
        calls.push(['placeholder', ids])
      },
    },
    now,
  })

  assert.deepEqual(calls, [
    ['reconcile', ['media__conn_1__account_all', 'media__conn_1__rule_1__merged']],
    ['remove', ['item_source_deleted']],
    ['placeholder', ['item_scope_removed']],
  ])
  assert.equal(saved.snapshot.ruleId, 'rule_1')
  assert.equal(saved.snapshot.snapshot.scannedAt, now())
  assert.equal(saved.snapshot.snapshot.lastFullValidationAt, now())
  assert.equal(saved.snapshot.snapshot.pendingFullValidation, false)
})

test('updateImportRule incremental sync scans added selections first and hydrates only new candidates', async() => {
  const connection = createConnection()
  const previousRule = createRule({
    directories: [{
      selectionId: 'dir_keep',
      kind: 'directory',
      pathOrUri: '/Albums/Keep',
      displayName: 'Keep',
    }],
  })
  const nextRule = createRule({
    directories: [
      {
        selectionId: 'dir_keep',
        kind: 'directory',
        pathOrUri: '/Albums/Keep',
        displayName: 'Keep',
      },
      {
        selectionId: 'dir_added',
        kind: 'directory',
        pathOrUri: '/Albums/New',
        displayName: 'New',
      },
    ],
  })
  const previousSnapshot = {
    ruleId: 'rule_1',
    scannedAt: 100,
    lastIncrementalSyncAt: 100,
    lastFullValidationAt: 80,
    pendingFullValidation: false,
    items: [
      createSourceItem({
        sourceItemId: 'conn_1__/Albums/Keep/existing.mp3',
        pathOrUri: '/Albums/Keep/existing.mp3',
        versionToken: 'v_existing',
      }),
    ],
  }
  const enumerateCalls = []
  const hydrateCalls = []
  let scanSelectionCalls = 0
  let removeMissingCalls = 0

  const result = await updateImportRule({
    connection,
    rule: nextRule,
    previousRule,
    syncMode: 'incremental',
    repository: {
      async getImportSnapshot() {
        return previousSnapshot
      },
      async saveImportSnapshot() {},
      async getImportRules() {
        return [nextRule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems() {},
      async getAllSourceItems() {
        return []
      },
      async saveAggregateSongs() {},
    },
    registry: {
      get() {
        return {
          async enumerateSelection(_connection, selection) {
            enumerateCalls.push({
              directories: (selection.directories || []).map(item => item.pathOrUri),
              tracks: (selection.tracks || []).map(item => item.pathOrUri),
            })
            if (selection.directories?.[0]?.pathOrUri === '/Albums/New') {
              return {
                complete: true,
                items: [
                  createCandidate({
                    pathOrUri: '/Albums/New/new.mp3',
                    fileName: 'new.mp3',
                    versionToken: 'v_new',
                    modifiedTime: 210,
                  }),
                ],
              }
            }
            return {
              complete: true,
              items: [
                createCandidate({
                  pathOrUri: '/Albums/Keep/existing.mp3',
                  fileName: 'existing.mp3',
                  versionToken: 'v_existing',
                  modifiedTime: 90,
                }),
              ],
            }
          },
          async hydrateCandidate(_connection, candidate) {
            hydrateCalls.push(candidate.pathOrUri)
            return {
              candidate,
              metadata: {
                title: candidate.fileName.replace('.mp3', ''),
                artist: '',
                album: '',
                durationSec: 180,
              },
              metadataLevelReached: 1,
            }
          },
          async scanSelection() {
            scanSelectionCalls += 1
            return {
              complete: true,
              items: [],
            }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists() {},
      async removeMissingSongs() {
        removeMissingCalls += 1
      },
    },
    now: () => 200,
  })

  assert.deepEqual(enumerateCalls, [
    { directories: ['/Albums/New'], tracks: [] },
    { directories: ['/Albums/Keep'], tracks: [] },
  ])
  assert.deepEqual(hydrateCalls, ['/Albums/New/new.mp3'])
  assert.equal(scanSelectionCalls, 0)
  assert.equal(removeMissingCalls, 0)
  assert.deepEqual(result.nextItems.map(item => item.sourceItemId).sort(), [
    'conn_1__/Albums/Keep/existing.mp3',
    'conn_1__/Albums/New/new.mp3',
  ])
})

test('updateImportRule incremental sync removes items from removed selections immediately', async() => {
  const connection = createConnection()
  const previousRule = createRule({
    directories: [
      {
        selectionId: 'dir_keep',
        kind: 'directory',
        pathOrUri: '/Albums/Keep',
        displayName: 'Keep',
      },
      {
        selectionId: 'dir_remove',
        kind: 'directory',
        pathOrUri: '/Albums/Remove',
        displayName: 'Remove',
      },
    ],
  })
  const nextRule = createRule({
    directories: [{
      selectionId: 'dir_keep',
      kind: 'directory',
      pathOrUri: '/Albums/Keep',
      displayName: 'Keep',
    }],
  })
  const previousSnapshot = {
    ruleId: 'rule_1',
    scannedAt: 100,
    lastIncrementalSyncAt: 100,
    lastFullValidationAt: 80,
    pendingFullValidation: false,
    items: [
      createSourceItem({
        sourceItemId: 'conn_1__/Albums/Keep/keep.mp3',
        pathOrUri: '/Albums/Keep/keep.mp3',
        versionToken: 'v_keep',
      }),
      createSourceItem({
        sourceItemId: 'conn_1__/Albums/Remove/old.mp3',
        pathOrUri: '/Albums/Remove/old.mp3',
        versionToken: 'v_old',
      }),
    ],
  }
  const enumerateCalls = []
  const saved = {
    snapshot: null,
    sourceItems: null,
  }
  let removeMissingCalls = 0

  const result = await updateImportRule({
    connection,
    rule: nextRule,
    previousRule,
    syncMode: 'incremental',
    repository: {
      async getImportSnapshot() {
        return previousSnapshot
      },
      async saveImportSnapshot(ruleId, snapshot) {
        saved.snapshot = { ruleId, snapshot }
      },
      async getImportRules() {
        return [nextRule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return saved.sourceItems?.items || []
      },
      async saveAggregateSongs() {},
    },
    registry: {
      get() {
        return {
          async enumerateSelection(_connection, selection) {
            enumerateCalls.push({
              directories: (selection.directories || []).map(item => item.pathOrUri),
              tracks: (selection.tracks || []).map(item => item.pathOrUri),
            })
            return {
              complete: true,
              items: [
                createCandidate({
                  pathOrUri: '/Albums/Keep/keep.mp3',
                  fileName: 'keep.mp3',
                  versionToken: 'v_keep',
                  modifiedTime: 90,
                }),
              ],
            }
          },
          async hydrateCandidate() {
            throw new Error('incremental sync should not hydrate unchanged retained items')
          },
          async scanSelection() {
            throw new Error('incremental sync should not call scanSelection')
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists() {},
      async removeMissingSongs() {
        removeMissingCalls += 1
      },
    },
    now: () => 200,
  })

  assert.deepEqual(enumerateCalls, [
    { directories: ['/Albums/Keep'], tracks: [] },
  ])
  assert.equal(removeMissingCalls, 0)
  assert.deepEqual(result.nextItems.map(item => item.sourceItemId), [
    'conn_1__/Albums/Keep/keep.mp3',
  ])
  assert.deepEqual(saved.snapshot.snapshot.items.map(item => item.sourceItemId), [
    'conn_1__/Albums/Keep/keep.mp3',
  ])
  assert.deepEqual(saved.sourceItems.items.map(item => item.sourceItemId), [
    'conn_1__/Albums/Keep/keep.mp3',
  ])

  const accountAll = result.generatedLists.find(item => item.listInfo.mediaSource.kind === 'account_all')
  const merged = result.generatedLists.find(item => item.listInfo.mediaSource.kind === 'rule_merged')
  assert.ok(accountAll)
  assert.ok(merged)
  assert.deepEqual(accountAll.list.map(item => item.id), ['conn_1__/Albums/Keep/keep.mp3'])
  assert.deepEqual(merged.list.map(item => item.id), ['conn_1__/Albums/Keep/keep.mp3'])
})

test('updateImportRule incremental sync preserves previous metadata when hydration is incomplete', async() => {
  const connection = createConnection()
  const rule = createRule({
    directories: [{
      selectionId: 'dir_keep',
      kind: 'directory',
      pathOrUri: '/Albums/Keep',
      displayName: 'Keep',
    }],
  })
  const previousSnapshot = {
    ruleId: 'rule_1',
    scannedAt: 100,
    lastIncrementalSyncAt: 100,
    lastFullValidationAt: 80,
    pendingFullValidation: false,
    items: [
      createSourceItem({
        sourceItemId: 'conn_1__/Albums/Keep/song.mp3',
        pathOrUri: '/Albums/Keep/song.mp3',
        title: 'Good Title',
        artist: 'Good Artist',
        album: 'Good Album',
        durationSec: 180,
        versionToken: 'v_old',
      }),
    ],
  }
  const saved = {
    snapshot: null,
  }

  const result = await updateImportRule({
    connection,
    rule,
    previousRule: rule,
    syncMode: 'incremental',
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
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems() {},
      async getAllSourceItems() {
        return []
      },
      async saveAggregateSongs() {},
    },
    registry: {
      get() {
        return {
          async enumerateSelection() {
            return {
              complete: true,
              items: [
                createCandidate({
                  pathOrUri: '/Albums/Keep/song.mp3',
                  fileName: 'song.mp3',
                  versionToken: 'v_new',
                  modifiedTime: 150,
                }),
              ],
            }
          },
          async hydrateCandidate(_connection, candidate) {
            return {
              candidate,
              metadata: null,
              metadataLevelReached: 0,
            }
          },
          async scanSelection() {
            throw new Error('incremental sync should not call scanSelection')
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists() {},
      async removeMissingSongs() {},
    },
    now: () => 220,
  })

  assert.deepEqual(result.nextItems.map(item => ({
    sourceItemId: item.sourceItemId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    durationSec: item.durationSec,
    versionToken: item.versionToken,
  })), [{
    sourceItemId: 'conn_1__/Albums/Keep/song.mp3',
    title: 'Good Title',
    artist: 'Good Artist',
    album: 'Good Album',
    durationSec: 180,
    versionToken: 'v_old',
  }])
  assert.equal(saved.snapshot.snapshot.isComplete, false)
  assert.equal(result.scanResult.complete, false)
  assert.equal(result.scanResult.summary.failed, 1)
})

test('updateImportRule incremental sync keeps absent old items until full validation but still refreshes recently modified songs', async() => {
  const connection = createConnection()
  const rule = createRule({
    directories: [{
      selectionId: 'dir_keep',
      kind: 'directory',
      pathOrUri: '/Albums/Keep',
      displayName: 'Keep',
    }],
  })
  const previousSnapshot = {
    ruleId: 'rule_1',
    scannedAt: 100,
    lastIncrementalSyncAt: 100,
    lastFullValidationAt: 80,
    pendingFullValidation: false,
    selectionStats: [{
      selectionKey: 'directory::/Albums/Keep',
      kind: 'directory',
      pathOrUri: '/Albums/Keep',
      itemCount: 2,
      latestModifiedTime: 90,
      capturedAt: 100,
    }],
    items: [
      createSourceItem({
        sourceItemId: 'conn_1__/Albums/Keep/absent.mp3',
        pathOrUri: '/Albums/Keep/absent.mp3',
        versionToken: 'v_absent',
      }),
      createSourceItem({
        sourceItemId: 'conn_1__/Albums/Keep/recent.mp3',
        pathOrUri: '/Albums/Keep/recent.mp3',
        title: 'recent-old',
        versionToken: 'v_recent_old',
      }),
    ],
  }
  const hydrateCalls = []
  const saved = {
    snapshot: null,
  }
  let removeMissingCalls = 0

  const result = await updateImportRule({
    connection,
    rule,
    previousRule: rule,
    syncMode: 'incremental',
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
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems() {},
      async getAllSourceItems() {
        return []
      },
      async saveAggregateSongs() {},
    },
    registry: {
      get() {
        return {
          async enumerateSelection() {
            return {
              complete: true,
              items: [
                createCandidate({
                  pathOrUri: '/Albums/Keep/recent.mp3',
                  fileName: 'recent.mp3',
                  versionToken: 'v_recent_new',
                  modifiedTime: 150,
                }),
              ],
            }
          },
          async hydrateCandidate(_connection, candidate) {
            hydrateCalls.push(candidate.pathOrUri)
            return {
              candidate,
              metadata: {
                title: 'recent-new',
                artist: 'artist',
                album: 'album',
                durationSec: 181,
              },
              metadataLevelReached: 1,
            }
          },
          async scanSelection() {
            throw new Error('incremental sync should not call scanSelection')
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists() {},
      async removeMissingSongs() {
        removeMissingCalls += 1
      },
    },
    now: () => 220,
  })

  assert.deepEqual(hydrateCalls, ['/Albums/Keep/recent.mp3'])
  assert.equal(removeMissingCalls, 0)
  assert.deepEqual(result.nextItems.map(item => item.sourceItemId).sort(), [
    'conn_1__/Albums/Keep/absent.mp3',
    'conn_1__/Albums/Keep/recent.mp3',
  ])
  assert.equal(saved.snapshot.ruleId, 'rule_1')
  assert.equal(saved.snapshot.snapshot.lastIncrementalSyncAt, 220)
  assert.equal(saved.snapshot.snapshot.lastFullValidationAt, 80)
  assert.equal(saved.snapshot.snapshot.pendingFullValidation, true)
  assert.deepEqual(saved.snapshot.snapshot.items.map(item => item.sourceItemId).sort(), [
    'conn_1__/Albums/Keep/absent.mp3',
    'conn_1__/Albums/Keep/recent.mp3',
  ])
})

test('updateImportRule incremental sync persists completeness based on current run', async() => {
  const connection = createConnection()
  const rule = createRule({
    directories: [{
      selectionId: 'dir_keep',
      kind: 'directory',
      pathOrUri: '/Albums/Keep',
      displayName: 'Keep',
    }],
  })

  const runIncremental = async({ previousIsComplete, enumerateComplete }) => {
    const saved = { snapshot: null }

    await updateImportRule({
      connection,
      rule,
      previousRule: rule,
      syncMode: 'incremental',
      repository: {
        async getImportSnapshot() {
          return {
            ruleId: rule.ruleId,
            scannedAt: 100,
            isComplete: previousIsComplete,
            items: [],
          }
        },
        async saveImportSnapshot(ruleId, snapshot) {
          saved.snapshot = { ruleId, snapshot }
        },
        async getImportRules() {
          return [rule]
        },
        async saveImportRules() {},
        async getConnections() {
          return [connection]
        },
        async saveSourceItems() {},
        async getAllSourceItems() {
          return []
        },
        async saveAggregateSongs() {},
      },
      registry: {
        get() {
          return {
            async enumerateSelection() {
              return {
                complete: enumerateComplete,
                items: [],
              }
            },
            async hydrateCandidate() {
              throw new Error('incremental sync should not hydrate without candidates')
            },
            async scanSelection() {
              throw new Error('incremental sync should not call scanSelection')
            },
          }
        },
      },
      listApi: {
        async reconcileGeneratedLists() {},
        async removeMissingSongs() {},
      },
      now: () => 200,
    })

    return saved.snapshot?.snapshot
  }

  const snapshotWhenComplete = await runIncremental({
    previousIsComplete: false,
    enumerateComplete: true,
  })
  assert.ok(snapshotWhenComplete)
  assert.notStrictEqual(snapshotWhenComplete.isComplete, false)

  const snapshotWhenIncomplete = await runIncremental({
    previousIsComplete: true,
    enumerateComplete: false,
  })
  assert.ok(snapshotWhenIncomplete)
  assert.equal(snapshotWhenIncomplete.isComplete, false)
})

test('syncImportRule remote incremental avoids full validation removal path', async() => {
  const connection = createConnection({
    providerType: 'onedrive',
  })
  const rule = createRule({
    connectionId: connection.connectionId,
  })
  const previousSnapshot = {
    ruleId: 'rule_1',
    scannedAt: 100,
    lastFullValidationAt: 80,
    pendingFullValidation: true,
    items: [
      createSourceItem({
        sourceItemId: 'old',
        pathOrUri: '/Albums/old.mp3',
      }),
    ],
  }
  const calls = []
  const saved = {
    snapshot: null,
    sourceItems: null,
  }
  const now = () => 250

  const result = await syncImportRule({
    connection,
    rule,
    syncMode: 'incremental',
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
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return saved.sourceItems?.items || []
      },
      async saveAggregateSongs() {},
    },
    registry: {
      get() {
        return {
          async enumerateSelection() {
            return {
              complete: true,
              items: [
                createCandidate({
                  pathOrUri: '/Albums/new.mp3',
                  versionToken: 'v_new',
                }),
              ],
            }
          },
          async hydrateCandidate(_connection, candidate) {
            return {
              candidate,
              metadata: {
                title: 'new',
                artist: 'artist',
                album: 'album',
                durationSec: 180,
              },
              metadataLevelReached: 1,
            }
          },
        }
      },
    },
    listApi: {
      async removeMissingSongs(ids) {
        calls.push(ids)
      },
      async reconcileGeneratedLists() {},
    },
    now,
  })

  assert.deepEqual(calls, [])
  assert.deepEqual(result.removedIds, [])
  assert.equal(saved.snapshot.snapshot.lastIncrementalSyncAt, now())
  assert.equal(saved.snapshot.snapshot.lastFullValidationAt, previousSnapshot.lastFullValidationAt)
  assert.equal(saved.snapshot.snapshot.pendingFullValidation, true)
})

test('deleteImportRule rebuilds remaining generated lists and keeps uncovered custom references unavailable', async() => {
  const connection = createConnection()
  const rule1 = {
    ...createRule({ ruleId: 'rule_1', name: 'Rule 1' }),
    generatedListIds: ['media__conn_1__rule_1__merged'],
  }
  const rule2 = createRule({ ruleId: 'rule_2', name: 'Rule 2' })
  const snapshots = {
    rule_1: {
      ruleId: 'rule_1',
      scannedAt: 1,
      items: [
        createSourceItem({ sourceItemId: 'item_only_rule_1', pathOrUri: '/Albums/one.mp3' }),
        createSourceItem({ sourceItemId: 'item_shared', pathOrUri: '/Albums/shared.mp3' }),
      ],
    },
    rule_2: {
      ruleId: 'rule_2',
      scannedAt: 1,
      items: [
        createSourceItem({ sourceItemId: 'item_shared', pathOrUri: '/Albums/shared.mp3' }),
        createSourceItem({ sourceItemId: 'item_only_rule_2', pathOrUri: '/Albums/two.mp3' }),
      ],
    },
  }
  const calls = []
  const saved = {
    rules: null,
    sourceItems: null,
    snapshotsRemoved: null,
  }

  await deleteImportRule({
    ruleId: 'rule_1',
    repository: {
      async getConnections() {
        return [connection]
      },
      async getImportRules() {
        return [rule1, rule2]
      },
      async saveImportRules(items) {
        saved.rules = items
      },
      async getImportSnapshot(ruleId) {
        return snapshots[ruleId]
      },
      async removeImportSnapshots(ruleIds) {
        saved.snapshotsRemoved = ruleIds
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return saved.sourceItems?.items || []
      },
      async saveAggregateSongs() {},
    },
    listApi: {
      async removeGeneratedLists(ids) {
        calls.push(['removeLists', ids])
      },
      async reconcileGeneratedLists(generatedLists) {
        calls.push(['reconcile', generatedLists.map(item => item.listInfo.id)])
      },
      async markRuleRemoved(ids) {
        calls.push(['placeholder', ids])
      },
    },
  })

  assert.deepEqual(calls, [
    ['removeLists', ['media__conn_1__rule_1__merged']],
    ['reconcile', ['media__conn_1__account_all', 'media__conn_1__rule_2__merged']],
    ['placeholder', ['item_only_rule_1']],
  ])
  assert.deepEqual(saved.rules.map(item => item.ruleId), ['rule_2'])
  assert.deepEqual(saved.snapshotsRemoved, ['rule_1'])
  assert.deepEqual(saved.sourceItems, {
    connectionId: 'conn_1',
    items: snapshots.rule_2.items,
  })
})

test('deleteMediaConnection removes generated lists and converts custom-list references into placeholders', async() => {
  const connection = createConnection({ credentialRef: 'cred_1' })
  const otherConnection = createConnection({
    connectionId: 'conn_2',
    displayName: 'Backup',
  })
  const rule = createRule()
  const otherRule = createRule({
    ruleId: 'rule_2',
    connectionId: 'conn_2',
    name: 'Keep',
  })
  const effects = []
  const saved = {
    connections: null,
    rules: null,
    sourceItems: null,
    snapshotsRemoved: null,
    removedCredential: null,
  }

  await deleteMediaConnection({
    connectionId: 'conn_1',
    repository: {
      async getConnections() {
        return [connection, otherConnection]
      },
      async saveConnections(items) {
        saved.connections = items
      },
      async getImportRules() {
        return [rule, otherRule]
      },
      async saveImportRules(items) {
        saved.rules = items
      },
      async getImportSnapshot(ruleId) {
        if (ruleId === 'rule_1') {
          return {
            ruleId,
            scannedAt: 1,
            items: [createSourceItem({ sourceItemId: 'item_1', pathOrUri: '/Albums/a.mp3' })],
          }
        }
        return {
          ruleId,
          scannedAt: 1,
          items: [createSourceItem({
            sourceItemId: 'item_other',
            connectionId: 'conn_2',
            pathOrUri: '/Other/b.mp3',
          })],
        }
      },
      async removeImportSnapshots(ruleIds) {
        saved.snapshotsRemoved = ruleIds
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return [createSourceItem({
          sourceItemId: 'item_other',
          connectionId: 'conn_2',
          pathOrUri: '/Other/b.mp3',
        })]
      },
      async saveAggregateSongs() {},
      async removeCredential(credentialRef) {
        saved.removedCredential = credentialRef
      },
    },
    listApi: {
      async removeGeneratedLists(ids) {
        effects.push(['removeLists', ids])
      },
      async markConnectionRemoved(ids) {
        effects.push(['placeholder', ids])
      },
    },
  })

  assert.deepEqual(effects, [
    ['removeLists', ['media__conn_1__account_all', 'media__conn_1__rule_1__merged']],
    ['placeholder', ['item_1']],
  ])
  assert.deepEqual(saved.connections.map(item => item.connectionId), ['conn_2'])
  assert.deepEqual(saved.rules.map(item => item.ruleId), ['rule_2'])
  assert.deepEqual(saved.snapshotsRemoved, ['rule_1'])
  assert.deepEqual(saved.sourceItems, {
    connectionId: 'conn_1',
    items: [],
  })
  assert.equal(saved.removedCredential, 'cred_1')
})

test('syncImportRule prefers streamEnumerateSelection for remote providers when available', async() => {
  const connection = createConnection({
    providerType: 'onedrive',
    displayName: 'OneDrive',
  })
  const rule = createRule()
  const calls = []
  let streamCalls = 0
  let enumerateCalls = 0
  const saved = {
    snapshot: null,
    sourceItems: null,
  }

  const result = await syncImportRule({
    connection,
    rule,
    repository: {
      async getImportSnapshot() {
        return {
          ruleId: 'rule_1',
          scannedAt: 1,
          items: [createSourceItem({
            sourceItemId: 'old_remote',
            pathOrUri: '/Albums/old_remote.mp3',
          })],
        }
      },
      async saveImportSnapshot(ruleId, snapshot) {
        saved.snapshot = { ruleId, snapshot }
      },
      async getImportRules() {
        return [rule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return saved.sourceItems?.items || []
      },
      async saveAggregateSongs() {},
      async getSyncRuns() {
        return []
      },
      async saveSyncRuns() {},
      async saveSyncCandidates() {},
      async saveSyncSnapshot() {},
    },
    registry: {
      get() {
        return {
          async streamEnumerateSelection(_connection, _selection, onBatch) {
            streamCalls += 1
            await onBatch([{
              sourceStableKey: '/Albums/new_remote.mp3',
              connectionId: 'conn_1',
              providerType: 'onedrive',
              pathOrUri: '/Albums/new_remote.mp3',
              fileName: 'new_remote.mp3',
              fileSize: 100,
              modifiedTime: 1700000000000,
              versionToken: 'v_new_remote',
              metadataLevelReached: 0,
            }])
            return {
              complete: true,
              items: [{
                sourceStableKey: '/Albums/new_remote.mp3',
                connectionId: 'conn_1',
                providerType: 'onedrive',
                pathOrUri: '/Albums/new_remote.mp3',
                fileName: 'new_remote.mp3',
                fileSize: 100,
                modifiedTime: 1700000000000,
                versionToken: 'v_new_remote',
                metadataLevelReached: 0,
              }],
            }
          },
          async enumerateSelection() {
            enumerateCalls += 1
            return {
              complete: true,
              items: [{
                sourceStableKey: '/Albums/new_remote.mp3',
                connectionId: 'conn_1',
                providerType: 'onedrive',
                pathOrUri: '/Albums/new_remote.mp3',
                fileName: 'new_remote.mp3',
                fileSize: 100,
                modifiedTime: 1700000000000,
                versionToken: 'v_new_remote',
                metadataLevelReached: 0,
              }],
            }
          },
          async hydrateCandidate(_connection, candidate) {
            return {
              candidate,
              metadata: {
                title: 'new_remote',
                artist: 'artist',
                album: 'album',
                durationSec: 180,
              },
              metadataLevelReached: 1,
            }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists(generatedLists) {
        const accountAll = generatedLists.find(item => item.listInfo.mediaSource.kind === 'account_all')
        calls.push(['reconcile', accountAll?.list.map(item => item.id) || []])
      },
      async removeMissingSongs(ids) {
        calls.push(['remove', ids])
      },
    },
  })

  assert.equal(streamCalls, 1)
  assert.equal(enumerateCalls, 0)
  assert.deepEqual(calls, [
    ['reconcile', ['old_remote', 'conn_1__/Albums/new_remote.mp3']],
    ['reconcile', ['conn_1__/Albums/new_remote.mp3']],
    ['remove', ['old_remote']],
  ])
  assert.equal(result.isComplete, true)
  assert.deepEqual(result.removedIds, ['old_remote'])
  assert.equal(saved.snapshot.snapshot.items[0].sourceItemId, 'conn_1__/Albums/new_remote.mp3')
})

test('syncImportRule falls back to enumerateSelection when streamEnumerateSelection is unavailable', async() => {
  const connection = createConnection({
    providerType: 'onedrive',
    displayName: 'OneDrive',
  })
  const rule = createRule()
  let enumerateCalls = 0

  const result = await syncImportRule({
    connection,
    rule,
    repository: {
      async getImportSnapshot() {
        return {
          ruleId: 'rule_1',
          scannedAt: 1,
          items: [],
        }
      },
      async saveImportSnapshot() {},
      async getImportRules() {
        return [rule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems() {},
      async getAllSourceItems() {
        return []
      },
      async saveAggregateSongs() {},
      async getSyncRuns() {
        return []
      },
      async saveSyncRuns() {},
      async saveSyncCandidates() {},
      async saveSyncSnapshot() {},
    },
    registry: {
      get() {
        return {
          async enumerateSelection() {
            enumerateCalls += 1
            return {
              complete: true,
              items: [{
                sourceStableKey: '/Albums/new_remote.mp3',
                connectionId: 'conn_1',
                providerType: 'onedrive',
                pathOrUri: '/Albums/new_remote.mp3',
                fileName: 'new_remote.mp3',
                fileSize: 100,
                modifiedTime: 1700000000000,
                versionToken: 'v_new_remote',
                metadataLevelReached: 0,
              }],
            }
          },
          async hydrateCandidate(_connection, candidate) {
            return {
              candidate,
              metadata: {
                title: 'new_remote',
                artist: 'artist',
                album: 'album',
                durationSec: 180,
              },
              metadataLevelReached: 1,
            }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists() {},
      async removeMissingSongs() {},
    },
  })

  assert.equal(enumerateCalls, 1)
  assert.equal(result.isComplete, true)
  assert.deepEqual(result.nextItems.map(item => item.sourceItemId), [
    'conn_1__/Albums/new_remote.mp3',
  ])
})
