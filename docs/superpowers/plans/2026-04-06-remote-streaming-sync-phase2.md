# Remote Streaming Sync Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace batch-only remote media imports with a shared streaming sync pipeline for `onedrive`, `webdav`, and `smb` so songs appear as they are hydrated, old playlists stay stable until final reconcile, auto-sync runs with a one-day cooldown, and playback caches the current track while prefetching the next one.

**Architecture:** Keep the existing media-library index as the single source of truth, but add a transient sync workspace layer (`sync_run`, `sync_candidate`, `sync_snapshot`) plus a generic coordinator that drives `enumerate -> hydrate -> batch commit -> final delete reconcile`. Remote providers expose a staged contract instead of a single `scanSelection`, the job queue routes remote rules through the streaming coordinator, and playback reuses cache records with explicit prefetch state.

**Tech Stack:** React Native, Android Java native modules, node:test, AsyncStorage-backed media-library repository, existing provider runtime registry, existing generated playlist/list API, existing cache/download utilities.

---

## File Structure

- `tests/media-library/streaming-sync-repository.test.js`
  Locks repository/storage support for sync runs, candidates, snapshots, and the extra connection/cache metadata.
- `tests/media-library/streaming-hydration.test.js`
  Locks the per-track hydration state machine and the `10 songs or 2 seconds` batch commit rule.
- `tests/media-library/streaming-sync-coordinator.test.js`
  Locks the end-to-end remote sync flow: preserve old playlists, add committed songs incrementally, delete only in the final reconcile stage.
- `tests/media-library/streaming-provider-contract.test.js`
  Locks the shared staged provider contract for `onedrive`, `webdav`, and `smb`.
- `tests/media-library/auto-sync.test.js`
  Locks one-day cooldown checks and boot/media-source-page trigger behavior.
- `tests/media-library/prefetch.test.js`
  Locks `play` vs `prefetch` cache writes and next-track prefetch scheduling.
- `src/core/mediaLibrary/hydrationPolicy.js`
  Shared rules for `ready`, `degraded`, and per-track attempt accounting.
- `src/core/mediaLibrary/batchCommitter.js`
  Shared `10 items or 2 seconds` batch collector for ready tracks.
- `src/core/mediaLibrary/streamingSync.js`
  Main coordinator for remote streaming sync runs.
- `src/core/mediaLibrary/autoSync.ts`
  One-day cooldown gate and entrypoints for boot/media-source-page auto checks.
- `src/core/mediaLibrary/syncNotifications.ts`
  JS wrapper for scan progress/status notifications.
- `src/utils/nativeModules/mediaLibrarySyncNotification.ts`
  Typed bridge to the Android notification module.
- `android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationModule.java`
  Android module that posts scan progress/finished/failed notifications.
- `android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationPackage.java`
  Registers the Android notification module.
- `src/core/mediaLibrary/repository.js`
  Adds sync workspace keys and repository methods.
- `src/core/mediaLibrary/importSync.js`
  Routes remote rules through the streaming coordinator while keeping local imports stable.
- `src/core/mediaLibrary/jobs.js`
  Persists richer job summaries/status updates and invokes streaming sync for remote rules.
- `src/core/mediaLibrary/jobQueue.ts`
  Supports sync run metadata and dedupes auto/manual jobs correctly.
- `src/core/mediaLibrary/runtimeRegistry.js`
  Wires staged provider helpers for `onedrive`, `webdav`, and `smb`.
- `src/core/mediaLibrary/providers/onedrive.js`
  Splits OneDrive into lightweight enumeration, staged hydration, and cache download hooks.
- `src/core/mediaLibrary/providers/webdav.js`
  Splits WebDAV into lightweight enumeration, staged hydration, and cache download hooks.
- `src/core/mediaLibrary/providers/smb.js`
  Splits SMB into lightweight enumeration, staged hydration, and cache download hooks.
- `src/core/music/mediaLibrary.ts`
  Starts current-track cache work and schedules next-track prefetch.
- `src/core/mediaLibrary/cache.js`
  Persists `cacheOrigin`, `prefetchState`, and prefetch-safe upserts.
- `src/core/mediaLibrary/playbackResolver.js`
  Keeps playback priority explicit while leaving prefetch as a lower-priority background task.
- `src/core/init/mediaLibrary.ts`
  Starts the queue and kicks off boot-time auto-sync eligibility checks.
- `src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx`
  Triggers the media-source-page auto-sync eligibility check without blocking the page.
- `android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java`
  Registers the media-library sync notification package.
- `src/types/mediaLibrary.d.ts`
  Extends type definitions for sync workspace entities and cache metadata.

### Task 1: Add sync workspace repository coverage

**Files:**
- Create: `tests/media-library/streaming-sync-repository.test.js`
- Modify: `src/core/mediaLibrary/repository.js`
- Modify: `src/core/mediaLibrary/storage.js`
- Modify: `src/types/mediaLibrary.d.ts`
- Test: `src/core/mediaLibrary/repository.js`

- [ ] **Step 1: Add failing repository tests for sync runs, candidates, snapshots, and cache metadata fields**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { createKeyBuilder, createMediaLibraryRepository } = require('../../src/core/mediaLibrary/repository.js')

test('createKeyBuilder exposes keys for sync runs, candidates, and snapshots', () => {
  const keys = createKeyBuilder('@media_library__')

  assert.equal(keys.syncRuns(), '@media_library__sync_runs')
  assert.equal(keys.syncCandidates('run_1'), '@media_library__sync_candidates__run_1')
  assert.equal(keys.syncSnapshot('rule_1'), '@media_library__sync_snapshot__rule_1')
})

test('repository persists sync runs and candidates separately from import jobs', async() => {
  const store = new Map()
  const repository = createMediaLibraryRepository({
    async get(key) { return store.get(key) ?? null },
    async set(key, value) { store.set(key, value) },
    async remove(key) { store.delete(key) },
  })

  await repository.saveSyncRuns([{ runId: 'run_1', status: 'running', phase: 'enumerate' }])
  await repository.saveSyncCandidates('run_1', [{ sourceStableKey: 'song_1', hydrateState: 'hydrating' }])

  assert.deepEqual(await repository.getSyncRuns(), [{ runId: 'run_1', status: 'running', phase: 'enumerate' }])
  assert.deepEqual(await repository.getSyncCandidates('run_1'), [{ sourceStableKey: 'song_1', hydrateState: 'hydrating' }])
  assert.deepEqual(await repository.getImportJobs(), [])
})
```

- [ ] **Step 2: Run the new repository test to confirm the sync workspace API is missing**

Run: `node --test tests/media-library/streaming-sync-repository.test.js`

Expected: FAIL because `createKeyBuilder()` does not expose sync workspace keys and the repository has no `getSyncRuns/saveSyncRuns/getSyncCandidates/saveSyncCandidates/getSyncSnapshot/saveSyncSnapshot` methods.

- [ ] **Step 3: Extend repository keys, sanitize helpers, and repository methods for sync workspace records**

```js
function createKeyBuilder(prefix = '@media_library__') {
  return {
    connections: () => `${prefix}connections`,
    credentials: credentialRef => `${prefix}credential__${credentialRef}`,
    importRules: () => `${prefix}import_rules`,
    importJobs: () => `${prefix}import_jobs`,
    importSnapshot: ruleId => `${prefix}import_snapshot__${ruleId}`,
    syncRuns: () => `${prefix}sync_runs`,
    syncCandidates: runId => `${prefix}sync_candidates__${runId}`,
    syncSnapshot: ruleId => `${prefix}sync_snapshot__${ruleId}`,
    sourceItems: connectionId => `${prefix}source_items__${connectionId}`,
    aggregateSongs: () => `${prefix}aggregate_songs`,
    caches: () => `${prefix}caches`,
    playStats: () => `${prefix}play_stats`,
  }
}

function sanitizeSyncRun(run = {}) {
  return {
    runId: run.runId,
    providerType: run.providerType,
    connectionId: run.connectionId,
    ruleId: run.ruleId ?? null,
    triggerSource: run.triggerSource,
    phase: run.phase,
    status: run.status,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    discoveredCount: run.discoveredCount ?? 0,
    readyCount: run.readyCount ?? 0,
    degradedCount: run.degradedCount ?? 0,
    committedCount: run.committedCount ?? 0,
    failedCount: run.failedCount ?? 0,
  }
}
```

```js
async getSyncRuns() {
  return await storage.get(keys.syncRuns()) || []
},
async saveSyncRuns(items) {
  await storage.set(keys.syncRuns(), items.map(sanitizeSyncRun))
},
async getSyncCandidates(runId) {
  if (!runId) return []
  return await storage.get(keys.syncCandidates(runId)) || []
},
async saveSyncCandidates(runId, items) {
  if (!runId) throw new Error('runId is required')
  await storage.set(keys.syncCandidates(runId), items.map(sanitizeSyncCandidate))
},
async removeSyncCandidates(runId) {
  if (!runId) return
  await storage.remove(keys.syncCandidates(runId))
},
async getSyncSnapshot(ruleId) {
  if (!ruleId) return null
  return await storage.get(keys.syncSnapshot(ruleId)) || null
},
async saveSyncSnapshot(ruleId, snapshot) {
  if (!ruleId) throw new Error('ruleId is required')
  await storage.set(keys.syncSnapshot(ruleId), snapshot ? sanitizeSyncSnapshot(snapshot) : null)
},
```

- [ ] **Step 4: Extend types for sync workspace entities and cache metadata fields**

```ts
declare namespace LX.MediaLibrary {
  interface SyncRun {
    runId: string
    providerType: ProviderType
    connectionId: string
    ruleId?: string | null
    triggerSource: 'manual' | 'auto'
    phase: 'enumerate' | 'hydrate' | 'commit' | 'reconcile_delete'
    status: 'queued' | 'running' | 'success' | 'failed'
    startedAt?: number | null
    finishedAt?: number | null
    discoveredCount: number
    readyCount: number
    degradedCount: number
    committedCount: number
    failedCount: number
  }
}
```

- [ ] **Step 5: Re-run the repository test and commit the sync workspace storage slice**

Run: `node --test tests/media-library/streaming-sync-repository.test.js tests/media-library/repository.test.js tests/media-library/import-repository.test.js`

Expected: PASS with sync workspace persistence working alongside the existing repository APIs.

```bash
git add tests/media-library/streaming-sync-repository.test.js src/core/mediaLibrary/repository.js src/core/mediaLibrary/storage.js src/types/mediaLibrary.d.ts
git commit -m "feat: add streaming sync workspace storage"
```

### Task 2: Lock hydration policy and batch commit behavior

**Files:**
- Create: `tests/media-library/streaming-hydration.test.js`
- Create: `src/core/mediaLibrary/hydrationPolicy.js`
- Create: `src/core/mediaLibrary/batchCommitter.js`
- Test: `src/core/mediaLibrary/hydrationPolicy.js`
- Test: `src/core/mediaLibrary/batchCommitter.js`

- [ ] **Step 1: Add failing tests for `ready`, `degraded`, and `10 songs or 2 seconds` flush behavior**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { classifyHydrationResult } = require('../../src/core/mediaLibrary/hydrationPolicy.js')
const { createReadyBatchCommitter } = require('../../src/core/mediaLibrary/batchCommitter.js')

test('classifyHydrationResult returns ready when title artist duration are complete', () => {
  const result = classifyHydrationResult({
    attempts: 1,
    metadata: { title: 'Song', artist: 'Singer', durationSec: 123 },
    fallbackTitle: 'song.mp3',
  })
  assert.equal(result.state, 'ready')
})

test('classifyHydrationResult returns degraded after 3 failed rounds', () => {
  const result = classifyHydrationResult({
    attempts: 3,
    metadata: { title: '', artist: '', durationSec: 0 },
    fallbackTitle: 'song.mp3',
  })
  assert.equal(result.state, 'degraded')
  assert.equal(result.title, 'song')
})
```

- [ ] **Step 2: Run the new hydration test and confirm the policy files do not exist**

Run: `node --test tests/media-library/streaming-hydration.test.js`

Expected: FAIL because `hydrationPolicy.js` and `batchCommitter.js` do not exist yet.

- [ ] **Step 3: Implement the shared hydration policy**

```js
function normalizeFallbackTitle(fileName = '') {
  return String(fileName || '').replace(/\.[^.]+$/, '')
}

function isReadyMetadata(metadata = {}) {
  return Boolean(metadata.title && metadata.artist && Number(metadata.durationSec) > 0)
}

function classifyHydrationResult({ attempts, metadata = {}, fallbackTitle = '' }) {
  if (isReadyMetadata(metadata)) {
    return {
      state: 'ready',
      title: metadata.title,
      artist: metadata.artist,
      durationSec: metadata.durationSec,
      album: metadata.album || '',
    }
  }

  if (attempts >= 3) {
    return {
      state: 'degraded',
      title: normalizeFallbackTitle(fallbackTitle),
      artist: '',
      durationSec: 0,
      album: '',
    }
  }

  return { state: 'hydrating' }
}
```

- [ ] **Step 4: Implement the batch committer with dual thresholds**

```js
function createReadyBatchCommitter({
  maxBatchSize = 10,
  maxDelayMs = 2000,
  schedule = (delay, run) => setTimeout(run, delay),
  cancel = handle => clearTimeout(handle),
  onFlush,
}) {
  let items = []
  let timer = null

  async function flush() {
    if (!items.length) return
    const batch = items
    items = []
    if (timer) {
      cancel(timer)
      timer = null
    }
    await onFlush(batch)
  }

  async function push(item) {
    items.push(item)
    if (items.length >= maxBatchSize) return flush()
    if (!timer) {
      timer = schedule(maxDelayMs, () => {
        void flush()
      })
    }
  }

  return { push, flush }
}
```

- [ ] **Step 5: Re-run the hydration tests and commit the shared policy layer**

Run: `node --test tests/media-library/streaming-hydration.test.js`

Expected: PASS with `ready`, `degraded`, and `10 songs / 2 seconds` flush behavior locked.

```bash
git add tests/media-library/streaming-hydration.test.js src/core/mediaLibrary/hydrationPolicy.js src/core/mediaLibrary/batchCommitter.js
git commit -m "feat: add hydration policy and ready batch committer"
```

### Task 3: Split remote providers into enumerate and staged hydrate hooks

**Files:**
- Create: `tests/media-library/streaming-provider-contract.test.js`
- Modify: `tests/media-library/onedrive-provider.test.js`
- Modify: `tests/media-library/webdav-provider.test.js`
- Modify: `tests/media-library/smb-bridge.test.js`
- Modify: `src/core/mediaLibrary/providers/onedrive.js`
- Modify: `src/core/mediaLibrary/providers/webdav.js`
- Modify: `src/core/mediaLibrary/providers/smb.js`
- Modify: `src/core/mediaLibrary/runtimeRegistry.js`
- Test: `src/core/mediaLibrary/providers/onedrive.js`
- Test: `src/core/mediaLibrary/providers/webdav.js`
- Test: `src/core/mediaLibrary/providers/smb.js`

- [ ] **Step 1: Add a failing staged provider contract test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { createOneDriveProvider } = require('../../src/core/mediaLibrary/providers/onedrive.js')

test('remote providers expose enumerateSelection hydrateCandidate and downloadToCache', async() => {
  const provider = createOneDriveProvider({
    async listChildren() { return { items: [] } },
    async getItemByPath() { return null },
    async downloadFile() {},
    async readMetadata() { return null },
    createTempFilePath() { return '/tmp/song.mp3' },
    async removeTempFile() {},
  })

  assert.equal(typeof provider.enumerateSelection, 'function')
  assert.equal(typeof provider.hydrateCandidate, 'function')
  assert.equal(typeof provider.downloadToCache, 'function')
})
```

- [ ] **Step 2: Extend provider-specific tests so lightweight enumeration stays cheap and hydration can be retried**

```js
test('onedrive enumerateSelection returns lightweight candidates before metadata hydration', async() => {
  const provider = createOneDriveProvider({ /* test doubles */ })
  const result = await provider.enumerateSelection(connection, {
    directories: [{ pathOrUri: '/Music', displayName: 'Music' }],
    tracks: [],
  })

  assert.deepEqual(result.items[0], {
    sourceStableKey: '/Music/song.mp3',
    pathOrUri: '/Music/song.mp3',
    fileName: 'song.mp3',
    providerType: 'onedrive',
    versionToken: '"v1"',
    metadataLevelReached: 0,
  })
})
```

- [ ] **Step 3: Run the provider contract suite and confirm the staged hooks are missing**

Run: `node --test tests/media-library/streaming-provider-contract.test.js tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js`

Expected: FAIL because the current providers still expose `scanSelection()` only and do not separate lightweight enumeration from staged hydration.

- [ ] **Step 4: Refactor each remote provider to expose the staged contract**

```js
function createOneDriveProvider(deps) {
  return {
    type: 'onedrive',
    async browseConnection(connection, pathOrUri = connection.rootPathOrUri) {
      /* existing browser behavior */
    },
    async enumerateSelection(connection, selection = {}) {
      const entries = await collectEnumeratedTracks(connection, selection, deps.listChildren, deps.getItemByPath)
      return {
        complete: true,
        items: dedupeItems(entries).map(item => toCandidate(connection, item)),
      }
    },
    async hydrateCandidate(connection, candidate, { attempt }) {
      const metadata = await hydrateOneDriveMetadata(connection, candidate, deps, attempt)
      return {
        candidate,
        metadata,
        metadataLevelReached: metadata?.metadataLevelReached ?? attempt,
      }
    },
    async downloadToCache(connection, sourceItem, savePath) {
      return deps.downloadFile(connection, sourceItem.pathOrUri, savePath)
    },
  }
}
```

```js
const oneDriveProvider = createOneDriveProvider({
  listChildren: /* existing Graph helper */,
  getItemByPath: /* existing Graph helper */,
  downloadFile: /* existing download helper */,
  readMetadata,
  createTempFilePath(fileName) {
    return `${temporaryDirectoryPath}/media_library_onedrive_${Date.now()}_${Math.random().toString(36).slice(2)}${getTempFileExtension(fileName)}`
  },
  removeTempFile: unlink,
})
```

- [ ] **Step 5: Re-run the staged provider tests and commit the contract migration**

Run: `node --test tests/media-library/streaming-provider-contract.test.js tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js`

Expected: PASS with all three remote providers exposing `enumerateSelection()`, `hydrateCandidate()`, and `downloadToCache()`.

```bash
git add tests/media-library/streaming-provider-contract.test.js tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js src/core/mediaLibrary/providers/onedrive.js src/core/mediaLibrary/providers/webdav.js src/core/mediaLibrary/providers/smb.js src/core/mediaLibrary/runtimeRegistry.js
git commit -m "feat: split remote providers into staged sync hooks"
```

### Task 4: Implement the streaming sync coordinator and final delete reconcile

**Files:**
- Create: `tests/media-library/streaming-sync-coordinator.test.js`
- Modify: `tests/media-library/import-sync.test.js`
- Modify: `tests/media-library/import-jobs.test.js`
- Create: `src/core/mediaLibrary/streamingSync.js`
- Modify: `src/core/mediaLibrary/importSync.js`
- Modify: `src/core/mediaLibrary/jobs.js`
- Modify: `src/core/mediaLibrary/jobQueue.ts`
- Modify: `src/core/mediaLibrary/listApi.js`
- Test: `src/core/mediaLibrary/streamingSync.js`
- Test: `src/core/mediaLibrary/importSync.js`

- [ ] **Step 1: Add a failing coordinator test for preserve-old-list, incremental add, and final delete**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { runRemoteStreamingSync } = require('../../src/core/mediaLibrary/streamingSync.js')

test('runRemoteStreamingSync keeps old list entries until final reconcile and commits new songs in batches', async() => {
  const events = []
  const repository = createRepositoryDouble(/* include sync workspace + old snapshot */)
  const listApi = {
    async reconcileGeneratedLists(generatedLists) {
      events.push(['reconcile', generatedLists.flatMap(item => item.list.map(music => music.id))])
    },
    async removeMissingSongs(ids) {
      events.push(['removeMissingSongs', ids])
    },
  }

  await runRemoteStreamingSync({
    connection,
    rule,
    repository,
    registry: {
      get() {
        return {
          async enumerateSelection() { return { complete: true, items: buildCandidates(12) } },
          async hydrateCandidate(_connection, candidate) {
            return { candidate, metadata: buildReadyMetadata(candidate.fileName) }
          },
        }
      },
    },
    listApi,
  })

  assert.equal(events[0][0], 'reconcile')
  assert.deepEqual(events.at(-1), ['removeMissingSongs', ['missing_song_id']])
})
```

- [ ] **Step 2: Run the streaming coordinator tests and confirm the coordinator is missing**

Run: `node --test tests/media-library/streaming-sync-coordinator.test.js tests/media-library/import-sync.test.js tests/media-library/import-jobs.test.js`

Expected: FAIL because `runRemoteStreamingSync()` does not exist and `updateImportRule()` still runs the old all-at-once `scanImportSelection()` path for remote providers.

- [ ] **Step 3: Implement the coordinator with enumerate, hydrate, batch commit, and final reconcile**

```js
async function runRemoteStreamingSync({
  connection,
  rule,
  repository,
  registry,
  listApi,
  notifications,
  now = () => Date.now(),
}) {
  const run = await beginSyncRun({ connection, rule, repository, now, triggerSource: 'manual' })
  const provider = registry.get(connection.providerType)
  const enumeration = await provider.enumerateSelection(connection, normalizeImportSelection(rule))
  await repository.saveSyncCandidates(run.runId, enumeration.items.map(candidate => ({
    ...candidate,
    hydrateState: 'discovered',
    hydrateAttempts: 0,
  })))

  const batchCommitter = createReadyBatchCommitter({
    onFlush: batch => commitReadyBatch({ connection, rule, batch, repository, listApi, now }),
  })

  for (const candidate of enumeration.items) {
    await hydrateAndQueueCandidate({ connection, candidate, provider, repository, batchCommitter, now })
  }

  await batchCommitter.flush()
  await reconcileRemoteDeletes({ connection, rule, repository, listApi })
  await finishSyncRun(run.runId, repository, { status: 'success', phase: 'reconcile_delete', finishedAt: now() })
}
```

- [ ] **Step 4: Route remote rules through the new coordinator while keeping local imports on the existing direct scan path**

```js
async function updateImportRule(args) {
  if (args.connection.providerType === 'local') {
    return updateLocalImportRule(args)
  }
  return runRemoteStreamingSync({
    ...args,
    notifications: createMediaLibrarySyncNotifications(),
  })
}
```

```ts
async runImportRuleJob(job: LX.MediaLibrary.ImportJob) {
  /* existing rule/connection lookup */
  const result = await updateImportRule({
    connection,
    rule,
    previousRule: job.payload?.previousRule ?? null,
    repository: mediaLibraryRepository,
    registry: getMediaLibraryRuntimeRegistry(),
    listApi,
  })
  const summary = result.summary ?? 'success'
  await setRuleStatus(rule.ruleId, result.isComplete ? 'success' : 'failed', summary, Date.now())
}
```

- [ ] **Step 5: Re-run sync coordinator/import tests and commit the incremental remote sync path**

Run: `node --test tests/media-library/streaming-sync-coordinator.test.js tests/media-library/import-sync.test.js tests/media-library/import-jobs.test.js tests/media-library/system-list-ui.test.js`

Expected: PASS with remote rules preserving old lists, adding ready songs in batches, and deleting missing songs only after final reconcile.

```bash
git add tests/media-library/streaming-sync-coordinator.test.js tests/media-library/import-sync.test.js tests/media-library/import-jobs.test.js src/core/mediaLibrary/streamingSync.js src/core/mediaLibrary/importSync.js src/core/mediaLibrary/jobs.js src/core/mediaLibrary/jobQueue.ts src/core/mediaLibrary/listApi.js
git commit -m "feat: add streaming sync coordinator for remote media"
```

### Task 5: Add one-day auto-sync and notification progress reporting

**Files:**
- Create: `tests/media-library/auto-sync.test.js`
- Create: `src/core/mediaLibrary/autoSync.ts`
- Create: `src/core/mediaLibrary/syncNotifications.ts`
- Create: `src/utils/nativeModules/mediaLibrarySyncNotification.ts`
- Create: `android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationModule.java`
- Create: `android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationPackage.java`
- Modify: `android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java`
- Modify: `src/core/init/mediaLibrary.ts`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx`
- Test: `src/core/mediaLibrary/autoSync.ts`

- [ ] **Step 1: Add failing tests for one-day cooldown and boot/page trigger behavior**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { shouldStartAutoSync, runEligibleMediaLibraryAutoSync } = require('../../src/core/mediaLibrary/autoSync.ts')

test('shouldStartAutoSync requires one day since the last successful sync', () => {
  const now = 1_000_000
  assert.equal(shouldStartAutoSync({ lastSyncFinishedAt: now - (23 * 60 * 60 * 1000) }, now), false)
  assert.equal(shouldStartAutoSync({ lastSyncFinishedAt: now - (24 * 60 * 60 * 1000) }, now), true)
})
```

- [ ] **Step 2: Run the auto-sync test to confirm the helpers do not exist**

Run: `node --test tests/media-library/auto-sync.test.js`

Expected: FAIL because `autoSync.ts` and the notification bridge do not exist yet.

- [ ] **Step 3: Implement the JS auto-sync gate and notification wrapper**

```ts
const AUTO_SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000

export const shouldStartAutoSync = (target: { lastSyncFinishedAt?: number | null }, now = Date.now()) => {
  const lastFinishedAt = target.lastSyncFinishedAt ?? 0
  return now - lastFinishedAt >= AUTO_SYNC_COOLDOWN_MS
}
```

- [ ] **Step 4: Add the Android notification module and wire boot/page triggers**

```java
@ReactMethod
public void showSyncProgress(String title, String message, Promise promise) {
  NotificationCompat.Builder builder = new NotificationCompat.Builder(getReactApplicationContext(), "MediaLibrarySync")
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(title)
      .setContentText(message)
      .setOngoing(true)
      .setOnlyAlertOnce(true);
  NotificationManagerCompat.from(getReactApplicationContext()).notify(4102, builder.build());
  promise.resolve(true);
}
```

```ts
export default async() => {
  startMediaLibraryJobQueue()
  void runEligibleMediaLibraryAutoSync({
    repository: mediaLibraryRepository,
    enqueueImportRuleSyncJob,
  })
  /* existing dev seed logic */
}
```

- [ ] **Step 5: Re-run auto-sync tests, compile the Android app module, and commit the background sync trigger slice**

Run: `node --test tests/media-library/auto-sync.test.js`

Expected: PASS with one-day cooldown logic and trigger selection locked.

Run: `cd android && .\gradlew.bat :app:compileDebugJavaWithJavac`

Expected: PASS with the notification module and package compiling.

```bash
git add tests/media-library/auto-sync.test.js src/core/mediaLibrary/autoSync.ts src/core/mediaLibrary/syncNotifications.ts src/utils/nativeModules/mediaLibrarySyncNotification.ts android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationModule.java android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationPackage.java android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java src/core/init/mediaLibrary.ts src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx
git commit -m "feat: add remote media auto sync and notifications"
```

### Task 6: Prefetch the next track while caching the current one

**Files:**
- Create: `tests/media-library/prefetch.test.js`
- Create: `src/core/mediaLibrary/prefetch.js`
- Modify: `src/core/music/mediaLibrary.ts`
- Modify: `src/core/mediaLibrary/cache.js`
- Modify: `src/core/mediaLibrary/playbackResolver.js`
- Modify: `src/types/mediaLibrary.d.ts`
- Test: `src/core/music/mediaLibrary.ts`
- Test: `src/core/mediaLibrary/cache.js`

- [ ] **Step 1: Add failing tests for `play` vs `prefetch` cache writes and next-track scheduling**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { createPrefetchScheduler } = require('../../src/core/mediaLibrary/prefetch.js')

test('prefetch scheduler starts the next track after current playback begins', async() => {
  const calls = []
  const scheduler = createPrefetchScheduler({
    async ensureCached(musicInfo, origin) {
      calls.push([musicInfo.id, origin])
    },
  })

  await scheduler.onTrackStarted({ id: 'current' }, { id: 'next' })
  assert.deepEqual(calls, [['next', 'prefetch']])
})
```

- [ ] **Step 2: Run the prefetch test and confirm the scheduler does not exist**

Run: `node --test tests/media-library/prefetch.test.js`

Expected: FAIL because `prefetch.js` does not exist and cache entries do not record `cacheOrigin/prefetchState`.

- [ ] **Step 3: Implement the scheduler and cache metadata fields**

```js
function createPrefetchScheduler({ ensureCached }) {
  let currentToken = 0

  return {
    async onTrackStarted(currentMusicInfo, nextMusicInfo) {
      currentToken += 1
      const token = currentToken
      if (!nextMusicInfo) return
      await Promise.resolve()
      if (token !== currentToken) return
      await ensureCached(nextMusicInfo, 'prefetch')
    },
    cancel() {
      currentToken += 1
    },
  }
}
```

```js
async function upsertCacheEntry(repository, cacheEntry) {
  const prevCaches = await repository.getCaches()
  const nextCaches = prevCaches.filter(item => item.sourceItemId !== cacheEntry.sourceItemId)
  nextCaches.push({
    cacheOrigin: 'play',
    prefetchState: 'ready',
    lastAccessedAt: Date.now(),
    ...cacheEntry,
  })
  await repository.saveCaches(nextCaches)
  return cacheEntry
}
```

- [ ] **Step 4: Call the scheduler from the media-library playback path**

```ts
const prefetchScheduler = createPrefetchScheduler({
  async ensureCached(musicInfo, origin) {
    await resolveLocalPlayableFilePath(musicInfo, false, origin)
  },
})

export const getMusicUrl = async({ musicInfo, isRefresh }: { musicInfo: LX.Music.MusicInfoRemoteFile, isRefresh: boolean }) => {
  const filePath = await resolveLocalPlayableFilePath(musicInfo, isRefresh, 'play')
  const nextMusicInfo = await getNextMediaLibraryTrack(musicInfo)
  void prefetchScheduler.onTrackStarted(musicInfo, nextMusicInfo)
  return `file://${filePath}`
}
```

- [ ] **Step 5: Re-run prefetch/playback tests and commit the playback optimization slice**

Run: `node --test tests/media-library/prefetch.test.js tests/media-library/playback-resolver.test.js`

Expected: PASS with current-track cache writes still winning and next-track prefetch running as a lower-priority background action.

```bash
git add tests/media-library/prefetch.test.js src/core/mediaLibrary/prefetch.js src/core/music/mediaLibrary.ts src/core/mediaLibrary/cache.js src/core/mediaLibrary/playbackResolver.js src/types/mediaLibrary.d.ts
git commit -m "feat: prefetch next remote media track"
```

### Task 7: Run the full regression suite and finalize the phase 2 rollout

**Files:**
- Verify: `docs/superpowers/specs/2026-04-06-remote-streaming-sync-design.md`
- Verify: `src/core/mediaLibrary`
- Verify: `src/core/music/mediaLibrary.ts`
- Verify: `src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx`
- Verify: `android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync`

- [ ] **Step 1: Run the complete media-library regression suite**

Run: `node --test tests/media-library`

Expected: PASS with the new streaming sync, auto-sync, notification, and prefetch tests all green alongside the existing media-library coverage.

- [ ] **Step 2: Compile the Android debug app with the new notification module**

Run: `cd android && .\gradlew.bat :app:compileDebugJavaWithJavac`

Expected: PASS with no Java compile errors from the new media-library sync notification package.

- [ ] **Step 3: Run a release-oriented JS bundle build to catch packaging regressions**

Run: `cd android && .\gradlew.bat createBundleReleaseJsAndAssets`

Expected: PASS with the streaming sync additions not breaking release bundle generation.

- [ ] **Step 4: Review spec coverage before the final commit**

Run: `rg -n "自动同步|通知栏|下一首预读|删除只在整次任务收尾阶段统一判断|满 10 首|2 秒|3 轮补全" docs/superpowers/specs/2026-04-06-remote-streaming-sync-design.md`

Expected: Every requirement in the spec has a corresponding implementation and test path in this plan.

- [ ] **Step 5: Commit the completed phase 2 rollout**

```bash
git add src/core/mediaLibrary src/core/music/mediaLibrary.ts src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx src/utils/nativeModules/mediaLibrarySyncNotification.ts android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java tests/media-library docs/superpowers/specs/2026-04-06-remote-streaming-sync-design.md
git commit -m "feat: deliver remote streaming sync phase 2"
```
