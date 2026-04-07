# Remote Streaming Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `onedrive`, `webdav`, and `smb` remote imports show the first committed songs before full enumeration completes, prefer lightweight hydration over temp-file downloads, preserve the existing checkpoint/recovery semantics, and keep current-track playback cache ahead of next-track prefetch.

**Architecture:** Keep the existing phase-2 `streamingSync` pipeline, but extend the provider contract with an optional streaming enumeration hook and candidate metadata hints. The coordinator should consume discovered batches immediately, keep writing partial checkpoints after flushes, reuse checkpointed items whose `sourceUniqueKey/path + versionToken` still match, and leave final delete reconcile unchanged. Playback keeps using the existing media-library cache path, but the prefetch scheduler should defer next-track work while remote sync is actively enumerating or hydrating.

**Tech Stack:** React Native 0.73, JavaScript/TypeScript mixed codebase, AsyncStorage-backed media-library repository, node:test, existing media-library job queue, existing Android notification bridge.

---

## File Structure

- `tests/media-library/streaming-provider-contract.test.js`
  Extends the remote provider contract so `streamEnumerateSelection()` becomes the preferred fast-path hook, while `enumerateSelection()` remains the compatibility fallback.
- `tests/media-library/onedrive-provider.test.js`
  Locks OneDrive candidate streaming batches and Graph audio-facet metadata hints.
- `tests/media-library/webdav-provider.test.js`
  Locks WebDAV streaming enumeration batches and compatibility fallback behavior.
- `tests/media-library/smb-bridge.test.js`
  Locks SMB streaming enumeration batches and compatibility fallback behavior.
- `tests/media-library/streaming-sync-coordinator.test.js`
  Locks fast-path coordinator behavior: first batch visible before full enumeration, checkpoint reuse on rerun, and pause/kill-safe partial snapshots.
- `tests/media-library/import-sync.test.js`
  Locks `updateImportRule()` so remote rules prefer the streaming hook and still preserve legacy fallback behavior.
- `tests/media-library/prefetch.test.js`
  Locks prefetch deferral while remote sync is actively enumerating/hydrating, while preserving current-track `play` cache writes.
- `tests/media-library/sync-notifications.test.js`
  Locks user-visible notification copy for streaming progress and completion summaries.
- `src/core/mediaLibrary/oneDriveGraph.js`
  Extends Graph list/item requests to include cheap audio metadata hints that can satisfy `title + artist + duration` without temp-file hydration when available.
- `src/core/mediaLibrary/providers/onedrive.js`
  Adds `streamEnumerateSelection()`, emits candidate batches, and populates candidate metadata hints from Graph results.
- `src/core/mediaLibrary/providers/webdav.js`
  Adds `streamEnumerateSelection()` using incremental PROPFIND traversal while preserving existing `enumerateSelection()` and `scanSelection()` compatibility.
- `src/core/mediaLibrary/providers/smb.js`
  Adds `streamEnumerateSelection()` using incremental recursive listing while preserving existing `enumerateSelection()` and `scanSelection()` compatibility.
- `src/core/mediaLibrary/streamingSync.js`
  Consumes streamed batches immediately, keeps partial checkpoints, reuses checkpointed items with unchanged version tokens, and falls back to array-based enumeration when providers do not implement the stream hook.
- `src/core/mediaLibrary/importSync.js`
  Keeps local imports on the existing direct scan path while remote imports use the new streaming fast path.
- `src/core/mediaLibrary/prefetch.js`
  Adds a deferral gate so next-track prefetch yields while active remote sync runs are in `enumerate` or `hydrate`.
- `src/core/init/player/preloadNextMusic.ts`
  Wires the deferral-aware prefetch scheduler to the existing media-library playback path.
- `src/core/mediaLibrary/syncNotifications.js`
  Upgrades progress/completion copy so notifications reflect discovered, committed, and reconcile phases more clearly.
- `src/core/mediaLibrary/jobQueue.ts`
  Continues to pass notifications and job control, and exposes final fast-path summaries on the existing rule/connection status surfaces.
- `src/types/mediaLibrary.d.ts`
  Extends `SyncCandidate` typing for optional metadata hints used by fast-path hydration decisions.

### Task 1: Add fast-path provider contract coverage and OneDrive metadata hints

**Files:**
- Modify: `tests/media-library/streaming-provider-contract.test.js`
- Modify: `tests/media-library/onedrive-provider.test.js`
- Modify: `tests/media-library/webdav-provider.test.js`
- Modify: `tests/media-library/smb-bridge.test.js`
- Modify: `src/core/mediaLibrary/oneDriveGraph.js`
- Modify: `src/core/mediaLibrary/providers/onedrive.js`
- Modify: `src/core/mediaLibrary/providers/webdav.js`
- Modify: `src/core/mediaLibrary/providers/smb.js`
- Modify: `src/types/mediaLibrary.d.ts`

- [ ] **Step 1: Add failing provider tests for `streamEnumerateSelection()` and OneDrive audio-facet hints**

```js
test('remote providers expose streamEnumerateSelection in addition to enumerateSelection hydrateCandidate and downloadToCache', async() => {
  const provider = createOneDriveProvider({
    async listChildren() { return { items: [], nextLink: null } },
    async getItemByPath() { return null },
    async downloadFile() {},
    async readMetadata() { return null },
  })

  assert.equal(typeof provider.streamEnumerateSelection, 'function')
  assert.equal(typeof provider.enumerateSelection, 'function')
  assert.equal(typeof provider.hydrateCandidate, 'function')
  assert.equal(typeof provider.downloadToCache, 'function')
})

test('onedrive streamEnumerateSelection emits candidate metadata hints from Graph audio fields', async() => {
  const batches = []
  const provider = createOneDriveProvider({
    async listChildren() {
      return {
        items: [{
          name: 'song_1.mp3',
          file: {},
          audio: {
            artist: 'artist_1',
            album: 'album_1',
            duration: 181000,
          },
          parentReference: { path: '/drive/root:/Albums' },
          eTag: '"v1"',
          size: 123,
          lastModifiedDateTime: '2026-04-08T00:00:00Z',
        }],
        nextLink: null,
      }
    },
    async getItemByPath() { return null },
    async downloadFile() {},
    async readMetadata() { return null },
  })

  await provider.streamEnumerateSelection(createConnection(), createSelection(), async batch => {
    batches.push(batch)
  })

  assert.equal(batches.length, 1)
  assert.deepEqual(batches[0][0].metadataHints, {
    title: 'song_1',
    artist: 'artist_1',
    album: 'album_1',
    durationSec: 181,
  })
})
```

- [ ] **Step 2: Run the provider contract suite and confirm the new stream hook is missing**

Run:

```bash
node --test tests/media-library/streaming-provider-contract.test.js tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js
```

Expected:
- fail because the providers only expose `enumerateSelection()` today
- fail because OneDrive candidates do not yet carry cheap metadata hints from Graph results

- [ ] **Step 3: Extend the Graph and candidate types to carry fast-path metadata hints**

```js
function buildChildrenUrl(pathOrUri = '') {
  const encodedPath = encodeGraphPath(pathOrUri)
  const baseUrl = encodedPath
    ? `${GRAPH_BASE_URL}/me/drive/root:${encodedPath}:/children`
    : `${GRAPH_BASE_URL}/me/drive/root/children`

  return `${baseUrl}?$select=name,size,file,folder,parentReference,eTag,lastModifiedDateTime,audio`
}

function toMetadataHints(fileName, item = {}) {
  return {
    title: stripExtension(fileName),
    artist: item.audio?.artist || '',
    album: item.audio?.album || '',
    durationSec: item.audio?.duration ? Math.round(item.audio.duration / 1000) : 0,
  }
}
```

```ts
interface SyncCandidate {
  sourceStableKey: string
  pathOrUri: string
  fileName?: string
  versionToken?: string
  fileSize?: number
  modifiedTime?: number | null
  hydrateState: SyncCandidateState
  metadataHints?: SyncCandidateMetadata | null
  metadataLevelReached?: number
  attempts?: number
  lastError?: string
  metadata?: SyncCandidateMetadata | null
}
```

- [ ] **Step 4: Implement `streamEnumerateSelection()` in all three remote providers while preserving compatibility**

```js
async function emitBatches(items, onBatch, batchSize = 10) {
  if (typeof onBatch !== 'function') return
  for (let index = 0; index < items.length; index += batchSize) {
    await onBatch(items.slice(index, index + batchSize))
  }
}

return {
  async streamEnumerateSelection(connection, selection = {}, onBatch) {
    const items = []
    for (const directory of selection.directories || []) {
      const batchItems = await collectDirectoryTracks(listChildren, connection, directory.pathOrUri)
      const candidates = dedupeItems(batchItems).map(item => toCandidate(connection, item))
      items.push(...candidates)
      await emitBatches(candidates, onBatch)
    }
    return { complete: true, items }
  },
  async enumerateSelection(connection, selection = {}) {
    const streamed = []
    await this.streamEnumerateSelection(connection, selection, async batch => {
      streamed.push(...batch)
    })
    return { complete: true, items: streamed }
  },
}
```

- [ ] **Step 5: Re-run the provider suite and commit the fast-path contract slice**

Run:

```bash
node --test tests/media-library/streaming-provider-contract.test.js tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js
```

Expected:
- pass with `streamEnumerateSelection()` available on `onedrive`, `webdav`, and `smb`
- pass with OneDrive candidates carrying cheap metadata hints when Graph already supplies them

```bash
git add tests/media-library/streaming-provider-contract.test.js tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js src/core/mediaLibrary/oneDriveGraph.js src/core/mediaLibrary/providers/onedrive.js src/core/mediaLibrary/providers/webdav.js src/core/mediaLibrary/providers/smb.js src/types/mediaLibrary.d.ts
git commit -m "feat: add remote streaming provider fast path hooks"
```

### Task 2: Consume streamed batches in `streamingSync` without regressing checkpoints

**Files:**
- Modify: `tests/media-library/streaming-sync-coordinator.test.js`
- Modify: `tests/media-library/import-sync.test.js`
- Modify: `src/core/mediaLibrary/streamingSync.js`
- Modify: `src/core/mediaLibrary/importSync.js`

- [ ] **Step 1: Add failing coordinator tests for streamed-first visibility and legacy fallback**

```js
test('runRemoteStreamingSync commits the first streamed batch before full enumeration completes', async() => {
  const reconcileEvents = []

  await runRemoteStreamingSync({
    connection,
    rule,
    repository,
    registry: {
      get() {
        return {
          async streamEnumerateSelection(_connection, _selection, onBatch) {
            await onBatch([createCandidate(1)])
            reconcileEvents.push('after_first_batch')
            await onBatch([createCandidate(2)])
            return { complete: true, items: [createCandidate(1), createCandidate(2)] }
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
    batchCommitterOptions: { maxBatchSize: 1 },
  })

  assert.deepEqual(reconcileEvents.slice(0, 2), [1, 'after_first_batch'])
})

test('runRemoteStreamingSync falls back to enumerateSelection when streamEnumerateSelection is unavailable', async() => {
  let enumerateCalls = 0
  await runRemoteStreamingSync({
    connection,
    rule,
    repository,
    registry: {
      get() {
        return {
          async enumerateSelection() {
            enumerateCalls += 1
            return { complete: true, items: [createCandidate(1)] }
          },
          async hydrateCandidate(_connection, candidate) {
            return {
              candidate,
              metadata: { title: 'song_1', artist: 'artist', album: 'album', durationSec: 180 },
              metadataLevelReached: 1,
            }
          },
        }
      },
    },
    listApi,
    batchCommitterOptions: { maxBatchSize: 1 },
  })

  assert.equal(enumerateCalls, 1)
})
```

- [ ] **Step 2: Run the coordinator/import tests and confirm the stream hook is not yet consumed**

Run:

```bash
node --test tests/media-library/streaming-sync-coordinator.test.js tests/media-library/import-sync.test.js
```

Expected:
- fail because `runRemoteStreamingSync()` still waits on full `enumerateSelection()` arrays
- fail because the first flushed batch does not become visible before the full enumeration completes

- [ ] **Step 3: Refactor the coordinator to process candidate batches as they are discovered**

```js
function findReusableCommittedItem(previousItems = [], candidate) {
  return previousItems.find(item => {
    const previousKey = item.sourceUniqueKey || item.pathOrUri || ''
    const candidateKey = candidate.sourceStableKey || candidate.pathOrUri || ''
    return previousKey === candidateKey && String(item.versionToken || '') === String(candidate.versionToken || '')
  }) || null
}

async function processCandidateBatch(batch = []) {
  for (const candidate of batch) {
    await assertJobCanContinue()
    registerDiscoveredCandidate(candidate)

    const reusableItem = findReusableCommittedItem(previousSnapshot.items, candidate)
    if (reusableItem) {
      committedItems.push(reusableItem)
      candidateStates.set(candidate.sourceStableKey, {
        ...candidate,
        hydrateState: 'committed',
        metadata: {
          title: reusableItem.title,
          artist: reusableItem.artist,
          album: reusableItem.album,
          durationSec: reusableItem.durationSec,
        },
      })
      await committer.push(reusableItem)
      continue
    }

    await hydrateCandidateIntoCommitter(candidate)
  }
}

if (typeof provider.streamEnumerateSelection === 'function') {
  enumerateResult = await provider.streamEnumerateSelection(connection, normalizeImportSelection(rule), processCandidateBatch)
} else {
  enumerateResult = await provider.enumerateSelection(connection, normalizeImportSelection(rule))
  await processCandidateBatch(enumerateResult.items || [])
}
```

- [ ] **Step 4: Keep partial checkpoint semantics as a non-negotiable invariant**

```js
const persistCheckpoint = async(currentCommittedItems = committedItems) => {
  const checkpointItems = mergeSourceItems(previousSnapshot.items, dedupeSourceItems(currentCommittedItems))
  await recomputeVisibleState(checkpointItems, { persistFinalState: false })
  await repository.saveImportSnapshot(rule.ruleId, {
    ruleId: rule.ruleId,
    scannedAt: previousSnapshot.scannedAt,
    items: checkpointItems,
    isComplete: false,
  })
  return checkpointItems
}

const finalizeSnapshot = async(nextItems) => {
  await recomputeVisibleState(nextItems, { persistFinalState: true })
  await repository.saveImportSnapshot(rule.ruleId, {
    ruleId: rule.ruleId,
    scannedAt: scanAt,
    items: nextItems,
    isComplete: true,
  })
}
```

- [ ] **Step 5: Re-run the coordinator/import suite and commit the streamed coordinator slice**

Run:

```bash
node --test tests/media-library/streaming-sync-coordinator.test.js tests/media-library/import-sync.test.js tests/media-library/import-jobs.test.js tests/media-library/streaming-sync-repository.test.js tests/media-library/media-source-backup.test.js
```

Expected:
- pass with the first streamed batch visible before full enumeration completes
- pass with interrupted runs reusing checkpointed items whose version tokens are unchanged
- pass with pause/kill-safe partial snapshots still written with `isComplete: false`

```bash
git add tests/media-library/streaming-sync-coordinator.test.js tests/media-library/import-sync.test.js src/core/mediaLibrary/streamingSync.js src/core/mediaLibrary/importSync.js
git commit -m "feat: stream remote sync batches into the coordinator"
```

### Task 3: Prefer cheap hydration before temp-file downloads

**Files:**
- Modify: `tests/media-library/onedrive-provider.test.js`
- Modify: `tests/media-library/webdav-provider.test.js`
- Modify: `tests/media-library/smb-bridge.test.js`
- Modify: `src/core/mediaLibrary/providers/onedrive.js`
- Modify: `src/core/mediaLibrary/providers/webdav.js`
- Modify: `src/core/mediaLibrary/providers/smb.js`
- Modify: `src/core/mediaLibrary/streamingSync.js`

- [ ] **Step 1: Add failing tests for candidate hint short-circuit and temp-file fallback only when required**

```js
test('onedrive hydrateCandidate short-circuits when metadata hints already satisfy title artist duration', async() => {
  let downloadCalls = 0
  const provider = createOneDriveProvider({
    async listChildren() { return { items: [], nextLink: null } },
    async getItemByPath() { return null },
    async downloadFile() {
      downloadCalls += 1
    },
    async readMetadata() {
      return null
    },
  })

  const result = await provider.hydrateCandidate(createConnection(), {
    sourceStableKey: '/Albums/song_1.mp3',
    pathOrUri: '/Albums/song_1.mp3',
    fileName: 'song_1.mp3',
    hydrateState: 'discovered',
    metadataHints: {
      title: 'song_1',
      artist: 'artist_1',
      album: 'album_1',
      durationSec: 181,
    },
  }, { attempt: 1 })

  assert.equal(downloadCalls, 0)
  assert.deepEqual(result.metadata, {
    title: 'song_1',
    artist: 'artist_1',
    album: 'album_1',
    durationSec: 181,
  })
})
```

- [ ] **Step 2: Run the provider tests and confirm hydration still always falls through to the heavy path**

Run:

```bash
node --test tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js
```

Expected:
- fail because `hydrateCandidate()` ignores candidate metadata hints today
- fail because providers do not distinguish cheap metadata from temp-file fallback

- [ ] **Step 3: Short-circuit `hydrateCandidate()` when the candidate already has enough metadata**

```js
function normalizeHydratedMetadata(candidate, metadata) {
  const hints = candidate?.metadataHints || {}
  return {
    title: metadata?.name || hints.title || stripExtension(candidate?.fileName || ''),
    artist: metadata?.singer || hints.artist || '',
    album: metadata?.albumName || hints.album || '',
    durationSec: metadata?.interval || hints.durationSec || 0,
  }
}

async function hydrateCandidateMetadata(connection, candidate, attempt, helpers = {}) {
  const hinted = normalizeHydratedMetadata(candidate, null)
  if (hinted.title && hinted.artist && Number(hinted.durationSec) > 0) {
    return {
      candidate,
      metadata: hinted,
      metadataLevelReached: Math.max(Number(attempt) || 0, candidate?.metadataLevelReached || 0, 1),
    }
  }

  const metadata = await readRemoteMetadata(/* existing heavy fallback */)
  return {
    candidate,
    metadata: normalizeHydratedMetadata(candidate, metadata),
    metadataLevelReached: Math.max(Number(attempt) || 0, metadata ? 2 : 1),
  }
}
```

- [ ] **Step 4: Prefer previous committed metadata when reusing unchanged checkpoint items**

```js
candidateStates.set(candidate.sourceStableKey, {
  ...candidate,
  hydrateState: 'committed',
  metadata: {
    title: reusableItem.title,
    artist: reusableItem.artist,
    album: reusableItem.album,
    durationSec: reusableItem.durationSec,
  },
  metadataLevelReached: 1,
})
```

- [ ] **Step 5: Re-run provider/coordinator tests and commit the cheap-hydration slice**

Run:

```bash
node --test tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js tests/media-library/streaming-sync-coordinator.test.js
```

Expected:
- pass with OneDrive candidates short-circuiting to ready when Graph audio hints are already enough
- pass with WebDAV/SMB still falling back to temp-file reads only when they truly need them
- pass with reused checkpoint items keeping their previous committed metadata without re-hydration

```bash
git add tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js src/core/mediaLibrary/providers/onedrive.js src/core/mediaLibrary/providers/webdav.js src/core/mediaLibrary/providers/smb.js src/core/mediaLibrary/streamingSync.js
git commit -m "feat: prefer cheap remote hydration paths"
```

### Task 4: Defer next-track prefetch while remote sync is actively working

**Files:**
- Modify: `tests/media-library/prefetch.test.js`
- Modify: `src/core/mediaLibrary/prefetch.js`
- Modify: `src/core/init/player/preloadNextMusic.ts`

- [ ] **Step 1: Add failing tests for prefetch deferral while remote sync is in `enumerate` or `hydrate`**

```js
test('prefetch scheduler defers next-track downloads while remote sync is actively enumerating or hydrating', async() => {
  const calls = []
  let deferCount = 0

  const scheduler = createPrefetchScheduler({
    async ensureCached(musicInfo, origin) {
      calls.push([musicInfo.id, origin])
    },
    async shouldDeferPrefetch() {
      deferCount += 1
      return deferCount < 3
    },
    wait: async() => {},
  })

  await scheduler.onTrackStarted({ id: 'current' }, { id: 'next' })

  assert.deepEqual(calls, [['next', 'prefetch']])
  assert.equal(deferCount, 3)
})
```

- [ ] **Step 2: Run the prefetch tests and confirm the scheduler has no deferral hook**

Run:

```bash
node --test tests/media-library/prefetch.test.js
```

Expected:
- fail because `createPrefetchScheduler()` cannot currently wait on active sync work

- [ ] **Step 3: Add a deferral hook to the scheduler**

```js
function createPrefetchScheduler({
  ensureCached,
  shouldDeferPrefetch = async() => false,
  wait = delay => new Promise(resolve => setTimeout(resolve, delay)),
  retryDelayMs = 1500,
}) {
  let currentToken = 0

  return {
    async onTrackStarted(currentMusicInfo, nextMusicInfo) {
      currentToken += 1
      const token = currentToken
      if (!currentMusicInfo || !nextMusicInfo) return
      await Promise.resolve()
      while (token === currentToken && await shouldDeferPrefetch()) {
        await wait(retryDelayMs)
      }
      if (token !== currentToken) return
      await ensureCached(nextMusicInfo, 'prefetch')
    },
    cancel() {
      currentToken += 1
    },
  }
}
```

- [ ] **Step 4: Wire the scheduler to active remote sync runs**

```ts
const prefetchScheduler = createPrefetchScheduler({
  async ensureCached(musicInfo) {
    if (!musicInfo || 'progress' in musicInfo) return
    if (musicInfo.source !== 'webdav' && musicInfo.source !== 'smb' && musicInfo.source !== 'onedrive') return
    await prefetchMediaLibraryTrack(musicInfo)
  },
  async shouldDeferPrefetch() {
    const runs = await mediaLibraryRepository.getSyncRuns() as LX.MediaLibrary.SyncRun[]
    return runs.some(run => run.status === 'running' && (run.phase === 'enumerate' || run.phase === 'hydrate'))
  },
})
```

- [ ] **Step 5: Re-run the prefetch tests and commit the playback-priority slice**

Run:

```bash
node --test tests/media-library/prefetch.test.js tests/media-library/playback-resolver.test.js
```

Expected:
- pass with next-track prefetch yielding while remote sync is actively enumerating or hydrating
- pass with current-track `play` cache writes still winning over background prefetch

```bash
git add tests/media-library/prefetch.test.js src/core/mediaLibrary/prefetch.js src/core/init/player/preloadNextMusic.ts
git commit -m "feat: defer next-track prefetch during active remote sync"
```

### Task 5: Tighten user-visible progress copy and final verification

**Files:**
- Create: `tests/media-library/sync-notifications.test.js`
- Modify: `src/core/mediaLibrary/syncNotifications.js`
- Modify: `src/core/mediaLibrary/streamingSync.js`
- Modify: `src/core/mediaLibrary/jobQueue.ts`

- [ ] **Step 1: Add failing tests for streaming progress and completion copy**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { buildProgressMessage, buildFinishedMessage } = require('../../src/core/mediaLibrary/syncNotifications.js')

test('buildProgressMessage reports streaming discovery and commit progress', () => {
  assert.equal(
    buildProgressMessage({ phase: 'hydrate', discoveredCount: 20, committedCount: 3, totalCount: 20 }),
    '正在补全歌曲信息 3/20'
  )
  assert.equal(
    buildProgressMessage({ phase: 'commit', discoveredCount: 20, committedCount: 7, totalCount: 20 }),
    '正在导入歌曲 7/20'
  )
})

test('buildFinishedMessage reports committed and removed counts', () => {
  assert.equal(
    buildFinishedMessage({ committedCount: 12, removedCount: 2, totalCount: 15 }),
    '已更新 12/15 首歌曲，移除 2 首'
  )
})
```

- [ ] **Step 2: Run the notification test and confirm the helpers are not exported yet**

Run:

```bash
node --test tests/media-library/sync-notifications.test.js
```

Expected:
- fail because `syncNotifications.js` does not expose structured message builders yet
- fail because completion copy does not report remove/reconcile counts

- [ ] **Step 3: Export structured notification builders and pass richer counts from `streamingSync`**

```js
function buildProgressMessage({
  phase = 'sync',
  committedCount = 0,
  totalCount = 0,
}) {
  switch (phase) {
    case 'enumerate':
      return totalCount > 0 ? `正在扫描远端媒体 ${committedCount}/${totalCount}` : '正在扫描远端媒体'
    case 'hydrate':
      return totalCount > 0 ? `正在补全歌曲信息 ${committedCount}/${totalCount}` : '正在补全歌曲信息'
    case 'commit':
      return totalCount > 0 ? `正在导入歌曲 ${committedCount}/${totalCount}` : '正在导入歌曲'
    case 'reconcile_delete':
      return '正在处理源端删除'
    default:
      return '正在同步远端媒体'
  }
}

function buildFinishedMessage({ committedCount = 0, removedCount = 0, totalCount = 0 }) {
  const countText = totalCount > 0 ? `${committedCount}/${totalCount}` : `${committedCount}`
  return removedCount > 0
    ? `已更新 ${countText} 首歌曲，移除 ${removedCount} 首`
    : `已更新 ${countText} 首歌曲`
}
```

```js
return {
  scanResult: { /* existing summary */ },
  removedIds,
  syncStats: {
    discoveredCount: discoveredCandidates.length,
    committedCount: nextItems.length,
    removedCount: removedIds.length,
  },
}
```

- [ ] **Step 4: Use the structured stats in the existing queue summary surface**

```ts
const stats = result.syncStats
const summary = stats
  ? `committed: ${stats.committedCount}, removed: ${stats.removedCount}, discovered: ${stats.discoveredCount}`
  : 'success'
```

- [ ] **Step 5: Run the full fast-path verification set and commit the rollout**

Run:

```bash
node --test tests/media-library/streaming-provider-contract.test.js tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js tests/media-library/streaming-sync-coordinator.test.js tests/media-library/import-sync.test.js tests/media-library/import-jobs.test.js tests/media-library/streaming-sync-repository.test.js tests/media-library/media-source-backup.test.js tests/media-library/prefetch.test.js tests/media-library/playback-resolver.test.js tests/media-library/sync-notifications.test.js
```

Expected:
- pass with the provider fast path, streamed coordinator, checkpoint reuse, prefetch deferral, and richer progress copy all green together

Run:

```bash
npx eslint src/core/mediaLibrary/oneDriveGraph.js src/core/mediaLibrary/providers/onedrive.js src/core/mediaLibrary/providers/webdav.js src/core/mediaLibrary/providers/smb.js src/core/mediaLibrary/streamingSync.js src/core/mediaLibrary/prefetch.js src/core/init/player/preloadNextMusic.ts src/core/mediaLibrary/syncNotifications.js src/core/mediaLibrary/jobQueue.ts tests/media-library/streaming-provider-contract.test.js tests/media-library/streaming-sync-coordinator.test.js tests/media-library/prefetch.test.js tests/media-library/sync-notifications.test.js
```

Expected:
- pass with no new lint errors

```bash
git add src/core/mediaLibrary/oneDriveGraph.js src/core/mediaLibrary/providers/onedrive.js src/core/mediaLibrary/providers/webdav.js src/core/mediaLibrary/providers/smb.js src/core/mediaLibrary/streamingSync.js src/core/mediaLibrary/prefetch.js src/core/init/player/preloadNextMusic.ts src/core/mediaLibrary/syncNotifications.js src/core/mediaLibrary/jobQueue.ts src/types/mediaLibrary.d.ts tests/media-library
git commit -m "feat: deliver remote streaming fast path"
```
