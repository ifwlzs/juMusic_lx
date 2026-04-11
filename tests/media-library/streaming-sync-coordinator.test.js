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

test('runRemoteStreamingSync keeps existing visible songs while progressively checkpointing new ones', async() => {
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
    batchCommitterOptions: {
      maxBatchSize: 1,
      schedule(_delay, run) {
        return setTimeout(run, 0)
      },
    },
  })

  const reconcileEvents = events.filter(event => event[0] === 'reconcile')
  assert.ok(reconcileEvents.length >= 2)
  assert.equal(reconcileEvents[0][1].includes('missing_song_id'), true)
  assert.equal(reconcileEvents.at(-1)[1].includes('missing_song_id'), false)
  assert.equal(reconcileEvents.at(-1)[1].length, 12)
  assert.deepEqual(events.at(-1), ['removeMissingSongs', ['missing_song_id']])

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

test('runRemoteStreamingSync preserves full-validation metadata in snapshot saves', async() => {
  const connection = createConnection()
  const rule = createRule()
  const snapshotSaves = []
  const previousSnapshot = {
    ruleId: 'rule_1',
    scannedAt: 80,
    lastFullValidationAt: 80,
    pendingFullValidation: true,
    items: [
      createSourceItem({
        sourceItemId: 'placeholder',
        pathOrUri: '/Albums/placeholder.mp3',
      }),
    ],
  }
  let savedSourceItems = []

  await runRemoteStreamingSync({
    connection,
    rule,
    repository: {
      async getImportSnapshot() {
        return previousSnapshot
      },
      async saveImportSnapshot(ruleId, snapshot) {
        snapshotSaves.push({ ruleId, snapshot })
      },
      async getImportRules() {
        return [rule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems(_connectionId, items) {
        savedSourceItems = items
      },
      async getAllSourceItems() {
        return savedSourceItems
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
            return {
              complete: true,
              items: [createCandidate(1), createCandidate(2)],
            }
          },
          async hydrateCandidate(_connection, candidate) {
            return {
              candidate,
              metadata: {
                title: candidate.fileName.replace(/\.[^.]+$/, ''),
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
    now: () => 2000,
    batchCommitterOptions: {
      maxBatchSize: 1,
    },
  })

  assert.ok(snapshotSaves.length >= 2)
  const checkpoint = snapshotSaves.find(entry => entry.snapshot.isComplete === false)
  assert.ok(checkpoint, 'expected at least one checkpoint save')
  assert.equal(checkpoint.snapshot.lastFullValidationAt, previousSnapshot.lastFullValidationAt)
  assert.equal(checkpoint.snapshot.pendingFullValidation, previousSnapshot.pendingFullValidation)
  const finalSnapshot = snapshotSaves.at(-1)
  assert.equal(finalSnapshot.snapshot.isComplete, true)
  assert.equal(finalSnapshot.snapshot.lastFullValidationAt, 2000)
  assert.equal(finalSnapshot.snapshot.pendingFullValidation, false)
})

test('runRemoteStreamingSync checkpoints flushed batches before the full remote scan completes', async() => {
  const connection = createConnection()
  const rule = createRule()
  const snapshotSaves = []
  const saved = {
    sourceItems: [],
    aggregateSongs: [],
    reconciles: [],
  }

  const result = await runRemoteStreamingSync({
    connection,
    rule,
    repository: {
      async getImportSnapshot() {
        return {
          ruleId: 'rule_1',
          scannedAt: 1,
          items: [
            createSourceItem({
              sourceItemId: 'existing_song_id',
              pathOrUri: '/Albums/existing.mp3',
              title: 'existing',
              versionToken: 'old',
            }),
          ],
        }
      },
      async saveImportSnapshot(ruleId, snapshot) {
        snapshotSaves.push({ ruleId, snapshot })
      },
      async getImportRules() {
        return [rule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems(_connectionId, items) {
        saved.sourceItems.push(items)
      },
      async getAllSourceItems() {
        return saved.sourceItems.at(-1) || []
      },
      async saveAggregateSongs(items) {
        saved.aggregateSongs.push(items)
      },
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
            return {
              complete: true,
              items: [createCandidate(1), createCandidate(2)],
            }
          },
          async hydrateCandidate(_connection, candidate) {
            return {
              candidate,
              metadata: {
                title: candidate.fileName.replace(/\.[^.]+$/, ''),
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
        saved.reconciles.push(accountAll?.list.map(item => item.id) || [])
      },
      async removeMissingSongs() {},
    },
    batchCommitterOptions: {
      maxBatchSize: 1,
    },
  })

  assert.equal(result.nextItems.length, 2)
  assert.ok(snapshotSaves.length >= 2)
  assert.equal(snapshotSaves[0].snapshot.isComplete, false)
  assert.equal(snapshotSaves[0].snapshot.items.some(item => item.sourceItemId === 'existing_song_id'), true)
  assert.equal(snapshotSaves[0].snapshot.items.some(item => item.sourceItemId === 'conn_1__/Albums/song_1.mp3'), true)
  assert.equal(snapshotSaves.at(-1).snapshot.isComplete, true)
  assert.ok(saved.sourceItems.length >= 2)
  assert.ok(saved.aggregateSongs.length >= 2)
  assert.ok(saved.reconciles.length >= 2)
})

test('runRemoteStreamingSync commits the first streamed batch before full enumeration completes', async() => {
  const connection = createConnection()
  const rule = createRule()
  const reconcileEvents = []
  let savedSourceItems = []
  const scheduledFlushes = []

  await runRemoteStreamingSync({
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
      async saveSourceItems(_connectionId, items) {
        savedSourceItems = items
      },
      async getAllSourceItems() {
        return savedSourceItems
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
            const first = createCandidate(1)
            const second = createCandidate(2)
            await onBatch([first])
            reconcileEvents.push('after_first_batch')
            await onBatch([second])
            return {
              complete: true,
              items: [first, second],
            }
          },
          async enumerateSelection(connectionArg, selectionArg) {
            const items = []
            const result = await this.streamEnumerateSelection(connectionArg, selectionArg, async batch => {
              items.push(...batch)
            })
            return {
              ...result,
              items,
            }
          },
          async hydrateCandidate(_connection, candidate) {
            return {
              candidate,
              metadata: {
                title: candidate.fileName.replace(/\.[^.]+$/, ''),
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
        reconcileEvents.push(accountAll?.list.length || 0)
      },
      async removeMissingSongs() {},
    },
    batchCommitterOptions: {
      maxBatchSize: 10,
      schedule(_delay, run) {
        scheduledFlushes.push(run)
        return run
      },
      cancel() {},
    },
  })

  assert.equal(scheduledFlushes.length > 0, true)
  assert.deepEqual(reconcileEvents.slice(0, 2), [1, 'after_first_batch'])
})

test('runRemoteStreamingSync reuses checkpointed items with unchanged version tokens after an interrupted run', async() => {
  const connection = createConnection()
  const rule = createRule()
  const hydrateCalls = []
  let savedSourceItems = []
  let savedSyncCandidates = []

  const previousSong = createSourceItem({
    sourceItemId: 'conn_1__/Albums/song_1.mp3',
    pathOrUri: '/Albums/song_1.mp3',
    title: 'song_1',
    versionToken: 'v_song_1',
  })
  previousSong.artist = 'checkpoint_artist'
  previousSong.album = 'checkpoint_album'
  previousSong.durationSec = 245

  const result = await runRemoteStreamingSync({
    connection,
    rule,
    repository: {
      async getImportSnapshot() {
        return {
          ruleId: 'rule_1',
          scannedAt: 1,
          isComplete: false,
          items: [previousSong],
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
      async saveSourceItems(_connectionId, items) {
        savedSourceItems = items
      },
      async getAllSourceItems() {
        return savedSourceItems
      },
      async saveAggregateSongs() {},
      async getSyncRuns() {
        return []
      },
      async saveSyncRuns() {},
      async saveSyncCandidates(_runId, items) {
        savedSyncCandidates = items
      },
      async saveSyncSnapshot() {},
    },
    registry: {
      get() {
        return {
          async enumerateSelection() {
            return {
              complete: true,
              items: [createCandidate(1), createCandidate(2)],
            }
          },
          async hydrateCandidate(_connection, candidate) {
            hydrateCalls.push(candidate.sourceStableKey)
            return {
              candidate,
              metadata: {
                title: candidate.fileName.replace(/\.[^.]+$/, ''),
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
    batchCommitterOptions: {
      maxBatchSize: 1,
    },
  })

  assert.deepEqual(hydrateCalls, ['/Albums/song_2.mp3'])
  assert.equal(result.nextItems.length, 2)
  assert.deepEqual(result.nextItems.find(item => item.sourceItemId === previousSong.sourceItemId), {
    ...previousSong,
    lastSeenAt: result.nextItems.find(item => item.sourceItemId === previousSong.sourceItemId)?.lastSeenAt,
  })
  assert.deepEqual(savedSyncCandidates.find(item => item.sourceStableKey === '/Albums/song_1.mp3'), {
    ...createCandidate(1),
    sourceStableKey: '/Albums/song_1.mp3',
    hydrateState: 'committed',
    attempts: 0,
    lastError: '',
    metadataLevelReached: 1,
    metadata: {
      title: 'song_1',
      artist: 'checkpoint_artist',
      album: 'checkpoint_album',
      durationSec: 245,
    },
  })
})

test('runRemoteStreamingSync preserves flushed visible state when pause is requested', async() => {
  const connection = createConnection()
  const rule = createRule()
  const events = []
  const saved = {
    snapshot: null,
    sourceItems: null,
    aggregateSongs: null,
  }
  let hydrateCount = 0

  await assert.rejects(async() => {
    await runRemoteStreamingSync({
      connection,
      rule,
      repository: {
        async getImportSnapshot() {
          return {
            ruleId: 'rule_1',
            scannedAt: 1,
            items: [
              createSourceItem({
                sourceItemId: 'existing_song_id',
                pathOrUri: '/Albums/existing.mp3',
                title: 'existing',
                versionToken: 'old',
              }),
            ],
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
          return []
        },
        async saveAggregateSongs(items) {
          saved.aggregateSongs = items
        },
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
              return {
                complete: true,
                items: [createCandidate(1), createCandidate(2), createCandidate(3)],
              }
            },
            async hydrateCandidate(_connection, candidate) {
              hydrateCount += 1
              return {
                candidate,
                metadata: {
                  title: candidate.fileName.replace(/\.[^.]+$/, ''),
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
          events.push(['reconcile', accountAll?.list.map(item => item.id) || []])
        },
        async removeMissingSongs(ids) {
          events.push(['removeMissingSongs', ids])
        },
      },
      jobControl: {
        async isPauseRequested() {
          return hydrateCount >= 1
        },
        async heartbeat() {},
      },
      batchCommitterOptions: {
        maxBatchSize: 1,
      },
    })
  }, error => error?.code === 'MEDIA_IMPORT_JOB_PAUSED')

  assert.deepEqual(events, [
    ['reconcile', ['existing_song_id', 'conn_1__/Albums/song_1.mp3']],
  ])
  assert.equal(saved.snapshot.ruleId, 'rule_1')
  assert.equal(saved.snapshot.snapshot.isComplete, false)
  assert.deepEqual(saved.snapshot.snapshot.items.map(item => item.sourceItemId), [
    'existing_song_id',
    'conn_1__/Albums/song_1.mp3',
  ])
  assert.equal(saved.sourceItems.connectionId, 'conn_1')
  assert.deepEqual(saved.sourceItems.items.map(item => item.sourceItemId), [
    'existing_song_id',
    'conn_1__/Albums/song_1.mp3',
  ])
  assert.ok(Array.isArray(saved.aggregateSongs))
})


test('runRemoteStreamingSync flushes the first ready item from a streamed batch before later hydration in the same batch finishes', async() => {
  const connection = createConnection()
  const rule = createRule()
  const reconcileEvents = []
  let savedSourceItems = []
  let resolveSecondHydrationStarted
  let releaseSecondHydration
  const secondHydrationStarted = new Promise(resolve => {
    resolveSecondHydrationStarted = resolve
  })
  const secondHydrationBlocked = new Promise(resolve => {
    releaseSecondHydration = resolve
  })

  const syncPromise = runRemoteStreamingSync({
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
      async saveSourceItems(_connectionId, items) {
        savedSourceItems = items
      },
      async getAllSourceItems() {
        return savedSourceItems
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
            const first = createCandidate(1)
            const second = createCandidate(2)
            await onBatch([first, second])
            return {
              complete: true,
              items: [first, second],
            }
          },
          async enumerateSelection(connectionArg, selectionArg) {
            const items = []
            const result = await this.streamEnumerateSelection(connectionArg, selectionArg, async batch => {
              items.push(...batch)
            })
            return {
              ...result,
              items,
            }
          },
          async hydrateCandidate(_connection, candidate) {
            if (candidate.pathOrUri === '/Albums/song_2.mp3') {
              resolveSecondHydrationStarted()
              await secondHydrationBlocked
            }
            return {
              candidate,
              metadata: {
                title: candidate.fileName.replace(/\.[^.]+$/, ''),
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
        reconcileEvents.push(accountAll?.list.map(item => item.id) || [])
      },
      async removeMissingSongs() {},
    },
    batchCommitterOptions: {
      maxBatchSize: 10,
    },
  })

  await secondHydrationStarted
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(reconcileEvents, [['conn_1__/Albums/song_1.mp3']])

  releaseSecondHydration()
  const result = await syncPromise
  assert.equal(result.nextItems.length, 2)
})

test('runRemoteStreamingSync flushes later ready items from the same streamed batch before a subsequent hydration blocks', async() => {
  const connection = createConnection()
  const rule = createRule()
  const reconcileEvents = []
  let savedSourceItems = []
  let resolveThirdHydrationStarted
  let releaseThirdHydration
  const thirdHydrationStarted = new Promise(resolve => {
    resolveThirdHydrationStarted = resolve
  })
  const thirdHydrationBlocked = new Promise(resolve => {
    releaseThirdHydration = resolve
  })

  const syncPromise = runRemoteStreamingSync({
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
      async saveSourceItems(_connectionId, items) {
        savedSourceItems = items
      },
      async getAllSourceItems() {
        return savedSourceItems
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
            const first = createCandidate(1)
            const second = createCandidate(2)
            const third = createCandidate(3)
            await onBatch([first, second, third])
            return {
              complete: true,
              items: [first, second, third],
            }
          },
          async enumerateSelection(connectionArg, selectionArg) {
            const items = []
            const result = await this.streamEnumerateSelection(connectionArg, selectionArg, async batch => {
              items.push(...batch)
            })
            return {
              ...result,
              items,
            }
          },
          async hydrateCandidate(_connection, candidate) {
            if (candidate.pathOrUri === '/Albums/song_3.mp3') {
              resolveThirdHydrationStarted()
              await thirdHydrationBlocked
            }
            return {
              candidate,
              metadata: {
                title: candidate.fileName.replace(/\.[^.]+$/, ''),
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
        reconcileEvents.push(accountAll?.list.map(item => item.id) || [])
      },
      async removeMissingSongs() {},
    },
    batchCommitterOptions: {
      maxBatchSize: 10,
    },
  })

  await thirdHydrationStarted
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(reconcileEvents, [
    ['conn_1__/Albums/song_1.mp3'],
    ['conn_1__/Albums/song_1.mp3', 'conn_1__/Albums/song_2.mp3'],
  ])

  releaseThirdHydration()
  const result = await syncPromise
  assert.equal(result.nextItems.length, 3)
})

test('runRemoteStreamingSync reuses static repository config across checkpoint recomputes and refreshes it for the final visible state', async() => {
  const connection = createConnection()
  const rule = createRule()
  let savedSourceItems = []
  let getImportRulesCalls = 0
  let getConnectionsCalls = 0

  await runRemoteStreamingSync({
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
        getImportRulesCalls += 1
        return [rule]
      },
      async saveImportRules() {},
      async getConnections() {
        getConnectionsCalls += 1
        return [connection]
      },
      async saveSourceItems(_connectionId, items) {
        savedSourceItems = items
      },
      async getAllSourceItems() {
        return savedSourceItems
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
            const items = [createCandidate(1), createCandidate(2), createCandidate(3)]
            await onBatch(items)
            return {
              complete: true,
              items,
            }
          },
          async enumerateSelection(connectionArg, selectionArg) {
            const items = []
            const result = await this.streamEnumerateSelection(connectionArg, selectionArg, async batch => {
              items.push(...batch)
            })
            return {
              ...result,
              items,
            }
          },
          async hydrateCandidate(_connection, candidate) {
            return {
              candidate,
              metadata: {
                title: candidate.fileName.replace(/\.[^.]+$/, ''),
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
    batchCommitterOptions: {
      maxBatchSize: 10,
    },
  })

  assert.equal(getConnectionsCalls, 2)
  assert.equal(getImportRulesCalls, 3)
})

test('runRemoteStreamingSync reuses sibling-rule snapshots across checkpoint recomputes and refreshes them for the final visible state', async() => {
  const connection = createConnection()
  const rule = createRule()
  const siblingRule = {
    ...createRule(),
    ruleId: 'rule_2',
    name: 'Sibling Albums',
  }
  let savedSourceItems = []
  const snapshotCalls = {
    rule_1: 0,
    rule_2: 0,
  }

  await runRemoteStreamingSync({
    connection,
    rule,
    repository: {
      async getImportSnapshot(ruleId) {
        snapshotCalls[ruleId] = (snapshotCalls[ruleId] || 0) + 1
        if (ruleId === 'rule_2') {
          return {
            ruleId,
            scannedAt: 99,
            items: [
              createSourceItem({
                sourceItemId: 'sibling_song_id',
                pathOrUri: '/Albums/sibling.mp3',
                title: 'sibling',
                versionToken: 'v_sibling',
              }),
            ],
          }
        }
        return {
          ruleId,
          scannedAt: 1,
          items: [],
        }
      },
      async saveImportSnapshot() {},
      async getImportRules() {
        return [rule, siblingRule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems(_connectionId, items) {
        savedSourceItems = items
      },
      async getAllSourceItems() {
        return savedSourceItems
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
            const items = [createCandidate(1), createCandidate(2)]
            await onBatch(items)
            return {
              complete: true,
              items,
            }
          },
          async enumerateSelection(connectionArg, selectionArg) {
            const items = []
            const result = await this.streamEnumerateSelection(connectionArg, selectionArg, async batch => {
              items.push(...batch)
            })
            return {
              ...result,
              items,
            }
          },
          async hydrateCandidate(_connection, candidate) {
            return {
              candidate,
              metadata: {
                title: candidate.fileName.replace(/\.[^.]+$/, ''),
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
    batchCommitterOptions: {
      maxBatchSize: 1,
    },
  })

  assert.equal(snapshotCalls.rule_1, 1)
  assert.equal(snapshotCalls.rule_2, 2)
})

