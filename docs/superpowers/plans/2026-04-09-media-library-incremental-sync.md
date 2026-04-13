# Media Library Incremental Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把媒体来源“更新”改成默认增量同步，只优先补新加范围、近期新增歌曲、近期更新歌曲；只有显式“全量校验 / 重新扫描”才做完整扫描和删歌传播。

**Architecture:** 保留现有 full scan / remote streaming 全量路径给 `full_validation`，同时在 `importSync.js` 新增 `incremental` 协调器。它先 diff 规则范围，再按 selection 轻量枚举候选、只 hydrate 新歌/变更歌曲，并把 `lastIncrementalSyncAt`、`lastFullValidationAt`、`selectionStats`、`pendingFullValidation` 写回 snapshot。`syncMode` 通过 job queue、auto sync、设置页 UI 全链路透传。

**Tech Stack:** React Native, JavaScript/TypeScript mixed codebase, AsyncStorage-backed media-library repository, node:test, existing media-library provider registry and job queue.

---

## File Structure

- `tests/media-library/import-repository.test.js`：锁定 `SyncMode`、snapshot 元数据和 job payload 持久化契约。
- `tests/media-library/local-provider.test.js`：锁定 local provider 的 `enumerateSelection()` / `hydrateCandidate()`。
- `tests/media-library/import-sync.test.js`：锁定增量同步、新增范围优先、近期更新补同步、默认不删歌、全量校验删歌。
- `tests/media-library/auto-sync.test.js`：锁定 auto sync 永远排队 `incremental`。
- `tests/media-library/import-jobs.test.js`：锁定队列去重后保留最新 `syncMode`。
- `tests/media-library/media-source-settings-ui.test.js`：锁定 UI 同时暴露“更新”和“全量校验”。
- `src/types/mediaLibrary.d.ts`：新增 `SyncMode`、snapshot selection stat 类型、job payload schema。
- `src/core/mediaLibrary/repository.js`：持久化新增 snapshot 字段和 payload `syncMode`。
- `src/core/mediaLibrary/providers/local.js`：补充轻量枚举和按需 metadata hydrate。
- `src/core/mediaLibrary/importSync.js`：实现 `incremental` 协调器和 `full_validation` 分流。
- `src/core/mediaLibrary/autoSync.js`：自动同步显式使用 `incremental`。
- `src/core/mediaLibrary/jobQueue.ts`：把 `syncMode` 传给 `updateImportRule()` 并输出模式感知 summary。
- `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx`
- `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx`
- `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx`
- `src/lang/zh-cn.json`
- `src/lang/zh-tw.json`
- `src/lang/en-us.json`

### Task 1: Persist sync mode and snapshot metadata

**Files:**
- Modify: `tests/media-library/import-repository.test.js`
- Modify: `tests/media-library/import-jobs.test.js`
- Modify: `src/types/mediaLibrary.d.ts`
- Modify: `src/core/mediaLibrary/repository.js`
- Test: `tests/media-library/import-repository.test.js`
- Test: `tests/media-library/import-jobs.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/media-library/import-repository.test.js
const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('repository persists incremental/full-validation snapshot metadata and syncMode payload', async() => {
  const typeFile = readFile('src/types/mediaLibrary.d.ts')
  assert.match(typeFile, /type SyncMode = 'incremental' \| 'full_validation'/)
  assert.match(typeFile, /lastIncrementalSyncAt\?: number \| null/)
  assert.match(typeFile, /lastFullValidationAt\?: number \| null/)
  assert.match(typeFile, /pendingFullValidation\?: boolean/)
  assert.match(typeFile, /selectionStats\?: ImportSnapshotSelectionStat\[\]/)
  assert.match(typeFile, /syncMode\?: SyncMode/)

  const repo = createMediaLibraryRepository(createMemoryStorage())
  await repo.saveImportSnapshot('rule_1', {
    ruleId: 'rule_1',
    scannedAt: 100,
    lastIncrementalSyncAt: 120,
    lastFullValidationAt: 80,
    pendingFullValidation: true,
    selectionStats: [{
      selectionKey: 'directory::/Albums',
      kind: 'directory',
      pathOrUri: '/Albums',
      itemCount: 2,
      latestModifiedTime: 50,
      capturedAt: 100,
    }],
    items: [],
  })
  await repo.saveImportJobs([{ jobId: 'job_1', type: 'import_rule_sync', connectionId: 'conn_1', ruleId: 'rule_1', status: 'queued', attempt: 0, createdAt: 1, payload: { syncMode: 'full_validation' } }])

  const snapshot = await repo.getImportSnapshot('rule_1')
  const jobs = await repo.getImportJobs()
  assert.equal(snapshot.lastIncrementalSyncAt, 120)
  assert.equal(snapshot.lastFullValidationAt, 80)
  assert.equal(snapshot.pendingFullValidation, true)
  assert.equal(snapshot.selectionStats[0].selectionKey, 'directory::/Albums')
  assert.equal(jobs[0].payload.syncMode, 'full_validation')
})
```

```js
// tests/media-library/import-jobs.test.js
test('media import queue keeps the latest syncMode when deduping the same rule', async() => {
  const calls = []
  const repo = createMediaLibraryRepository(createMemoryStorage())
  const queue = createMediaImportJobQueue({
    repository: repo,
    now: (() => { let value = 100; return () => ++value })(),
    async runImportRuleJob(job) { calls.push([job.ruleId, job.payload?.syncMode || null]) },
  })

  await queue.enqueueImportRuleJob({ connectionId: 'conn_1', ruleId: 'rule_1', payload: { syncMode: 'full_validation' } })
  await queue.enqueueImportRuleJob({ connectionId: 'conn_1', ruleId: 'rule_1', payload: { syncMode: 'incremental' } })

  await waitForQueueToDrain(queue)
  assert.deepEqual(calls, [['rule_1', 'incremental']])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/import-repository.test.js tests/media-library/import-jobs.test.js`
Expected: FAIL because `SyncMode`, snapshot metadata, and payload `syncMode` are not persisted yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/types/mediaLibrary.d.ts
type SyncMode = 'incremental' | 'full_validation'

interface ImportSnapshotSelectionStat {
  selectionKey: string
  kind: 'directory' | 'track'
  pathOrUri: string
  itemCount: number
  latestModifiedTime: number
  capturedAt: number
}

interface ImportSnapshot {
  ruleId: string
  scannedAt: number | null
  isComplete?: boolean
  lastIncrementalSyncAt?: number | null
  lastFullValidationAt?: number | null
  pendingFullValidation?: boolean
  selectionStats?: ImportSnapshotSelectionStat[]
  items: SourceItem[]
}

payload?: {
  previousRule?: ImportRule | null
  triggerSource?: SyncTriggerSource
  autoSyncTrigger?: AutoSyncTrigger
  syncMode?: SyncMode
} | null
```

```js
// src/core/mediaLibrary/repository.js
function sanitizeImportSnapshotSelectionStat(stat = {}) {
  return {
    selectionKey: stat.selectionKey,
    kind: stat.kind,
    pathOrUri: stat.pathOrUri ?? '',
    itemCount: Number(stat.itemCount) || 0,
    latestModifiedTime: Number(stat.latestModifiedTime) || 0,
    capturedAt: Number(stat.capturedAt) || 0,
  }
}

function sanitizeImportJob(job = {}) {
  return {
    // existing fields...
    payload: job.payload ? {
      previousRule: job.payload.previousRule ?? null,
      triggerSource: job.payload.triggerSource,
      autoSyncTrigger: job.payload.autoSyncTrigger,
      syncMode: job.payload.syncMode ?? 'incremental',
    } : null,
  }
}

async saveImportSnapshot(ruleId, snapshot) {
  if (!ruleId) throw new Error('ruleId is required')
  await storage.set(keys.importSnapshot(ruleId), snapshot ? {
    ruleId,
    scannedAt: snapshot.scannedAt ?? null,
    items: Array.isArray(snapshot.items) ? [...snapshot.items] : [],
    ...(snapshot.isComplete === false ? { isComplete: false } : {}),
    lastIncrementalSyncAt: snapshot.lastIncrementalSyncAt ?? null,
    lastFullValidationAt: snapshot.lastFullValidationAt ?? null,
    pendingFullValidation: snapshot.pendingFullValidation === true,
    selectionStats: Array.isArray(snapshot.selectionStats)
      ? snapshot.selectionStats.map(sanitizeImportSnapshotSelectionStat)
      : [],
  } : null)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/import-repository.test.js tests/media-library/import-jobs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/import-repository.test.js tests/media-library/import-jobs.test.js src/types/mediaLibrary.d.ts src/core/mediaLibrary/repository.js
git commit -m "feat: persist media sync mode metadata"
```

### Task 2: Add lightweight local-provider enumeration

**Files:**
- Modify: `tests/media-library/local-provider.test.js`
- Modify: `src/core/mediaLibrary/providers/local.js`
- Test: `tests/media-library/local-provider.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('createLocalProvider enumerateSelection returns lightweight candidates and hydrateCandidate reads metadata on demand', async() => {
  const metadataCalls = []
  const readDir = async(path) => {
    if (path === '/root') return [
      { path: '/root/a.mp3', name: 'a.mp3', isDirectory: false, size: 10, lastModified: 1 },
      { path: '/root/nested', name: 'nested', isDirectory: true },
    ]
    if (path === '/root/nested') return [
      { path: '/root/nested/c.flac', name: 'c.flac', isDirectory: false, size: 20, lastModified: 3 },
    ]
    return []
  }
  const readMetadata = async(path) => {
    metadataCalls.push(path)
    return { name: 'song', singer: 'artist', albumName: 'album', interval: 180 }
  }

  const provider = createLocalProvider({ readDir, readMetadata })
  const enumerated = await provider.enumerateSelection(
    { connectionId: 'conn_1', rootPathOrUri: '/root' },
    { directories: [{ selectionId: 'dir_1', kind: 'directory', pathOrUri: '/root', displayName: 'root' }], tracks: [] },
  )

  assert.equal(metadataCalls.length, 0)
  assert.deepEqual(enumerated.items.map(item => item.pathOrUri), ['/root/a.mp3', '/root/nested/c.flac'])
  assert.equal(enumerated.items[0].metadataLevelReached, 0)

  const hydrated = await provider.hydrateCandidate({ connectionId: 'conn_1' }, enumerated.items[0], { attempt: 1 })
  assert.deepEqual(metadataCalls, ['/root/a.mp3'])
  assert.deepEqual(hydrated.metadata, { title: 'song', artist: 'artist', album: 'album', durationSec: 180 })
  assert.equal(hydrated.metadataLevelReached, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/local-provider.test.js`
Expected: FAIL because local provider has no `enumerateSelection()` / `hydrateCandidate()` yet.

- [ ] **Step 3: Write minimal implementation**

```js
// src/core/mediaLibrary/providers/local.js
function toCandidate(connection, file) {
  return {
    sourceStableKey: file.path,
    connectionId: connection.connectionId,
    providerType: 'local',
    pathOrUri: file.path,
    fileName: file.name,
    fileSize: file.size || 0,
    modifiedTime: file.lastModified || 0,
    versionToken: buildLocalVersionToken({
      pathOrUri: file.path,
      fileSize: file.size,
      modifiedTime: file.lastModified || 0,
    }),
    metadataLevelReached: 0,
  }
}

function normalizeHydratedMetadata(candidate, metadata) {
  return {
    title: metadata?.name || stripExtension(candidate?.fileName || ''),
    artist: metadata?.singer || '',
    album: metadata?.albumName || '',
    durationSec: metadata?.interval || 0,
  }
}

async function collectSelectionFiles(readDir, selection = {}) {
  const files = []
  let skipped = 0
  for (const directory of selection.directories || []) {
    const nested = await collectLocalFiles(readDir, directory.pathOrUri)
    files.push(...nested.files)
    skipped += nested.skipped
  }
  for (const track of selection.tracks || []) {
    const entry = await resolveLocalFile(readDir, track.pathOrUri)
    if (!entry || !isAudioFile(entry.name)) {
      skipped += 1
      continue
    }
    files.push(entry)
  }
  return { files: [...new Map(files.map(file => [file.path, file])).values()], skipped }
}

return {
  type: 'local',
  async enumerateSelection(connection, selection = {}) {
    const { files, skipped } = await collectSelectionFiles(readDir, selection)
    return { complete: true, items: files.map(file => toCandidate(connection, file)), summary: { skipped } }
  },
  async hydrateCandidate(_connection, candidate, { attempt = 1 } = {}) {
    const metadata = await readMetadata(candidate.pathOrUri)
    return {
      candidate,
      metadata: normalizeHydratedMetadata(candidate, metadata),
      metadataLevelReached: metadata ? Math.max(Number(attempt) || 0, 1) : 0,
    }
  },
  async scanSelection(connection, selection = {}) {
    const { files, skipped } = await collectSelectionFiles(readDir, selection)
    return buildLocalScanItems(files, connection, readMetadata, skipped)
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/local-provider.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/local-provider.test.js src/core/mediaLibrary/providers/local.js
git commit -m "feat: add local provider incremental enumeration"
```

### Task 3: Implement the incremental coordinator in `importSync.js`

**Files:**
- Modify: `tests/media-library/import-sync.test.js`
- Modify: `src/core/mediaLibrary/importSync.js`
- Test: `tests/media-library/import-sync.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('updateImportRule incremental sync scans added selections first and hydrates only new candidates', async() => {
  const connection = createConnection()
  const previousRule = createRule({ directories: [{ selectionId: 'dir_old', kind: 'directory', pathOrUri: '/Albums/Old', displayName: 'Old' }] })
  const nextRule = createRule({ directories: [
    { selectionId: 'dir_old', kind: 'directory', pathOrUri: '/Albums/Old', displayName: 'Old' },
    { selectionId: 'dir_new', kind: 'directory', pathOrUri: '/Albums/New', displayName: 'New' },
  ] })
  const enumerateCalls = []
  const hydrateCalls = []

  await updateImportRule({
    connection,
    rule: nextRule,
    previousRule,
    syncMode: 'incremental',
    repository: {
      async getImportSnapshot() {
        return {
          ruleId: 'rule_1',
          scannedAt: 50,
          lastIncrementalSyncAt: 90,
          lastFullValidationAt: 40,
          selectionStats: [{ selectionKey: 'directory::/Albums/Old', kind: 'directory', pathOrUri: '/Albums/Old', itemCount: 1, latestModifiedTime: 70, capturedAt: 50 }],
          items: [createSourceItem({ sourceItemId: 'item_old', pathOrUri: '/Albums/Old/song.mp3', versionToken: 'v_old' })],
        }
      },
      async saveImportSnapshot() {},
      async getImportRules() { return [nextRule] },
      async saveImportRules() {},
      async getConnections() { return [connection] },
      async saveSourceItems() {},
      async getAllSourceItems() { return [] },
      async saveAggregateSongs() {},
    },
    registry: {
      get() {
        return {
          async enumerateSelection(_connection, selection) {
            const key = selection.directories.map(item => item.pathOrUri).join(',')
            enumerateCalls.push(key)
            if (key === '/Albums/New') {
              return { complete: true, items: [{ sourceStableKey: '/Albums/New/new.mp3', connectionId: 'conn_1', providerType: 'local', pathOrUri: '/Albums/New/new.mp3', fileName: 'new.mp3', fileSize: 100, modifiedTime: 120, versionToken: 'v_new', metadataLevelReached: 0 }] }
            }
            return { complete: true, items: [{ sourceStableKey: '/Albums/Old/song.mp3', connectionId: 'conn_1', providerType: 'local', pathOrUri: '/Albums/Old/song.mp3', fileName: 'song.mp3', fileSize: 100, modifiedTime: 70, versionToken: 'v_old', metadataLevelReached: 0 }] }
          },
          async hydrateCandidate(_connection, candidate) {
            hydrateCalls.push(candidate.pathOrUri)
            return { candidate, metadata: { title: candidate.fileName.replace(/\.[^.]+$/, ''), artist: '', album: '', durationSec: 180 }, metadataLevelReached: 1 }
          },
          async scanSelection() { assert.fail('incremental sync should not use full scanSelection') },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists() {},
      async removeMissingSongs() { assert.fail('incremental sync must not propagate source deletions') },
      async markRuleRemoved() {},
    },
  })

  assert.deepEqual(enumerateCalls, ['/Albums/New', '/Albums/Old'])
  assert.deepEqual(hydrateCalls, ['/Albums/New/new.mp3'])
})

test('updateImportRule incremental sync keeps absent old items until full validation but still refreshes recently modified songs', async() => {
  const connection = createConnection()
  const rule = createRule()
  const saved = { snapshot: null }
  const hydrateCalls = []
  const removeCalls = []

  await updateImportRule({
    connection,
    rule,
    previousRule: rule,
    syncMode: 'incremental',
    repository: {
      async getImportSnapshot() {
        return {
          ruleId: 'rule_1',
          scannedAt: 10,
          lastIncrementalSyncAt: 100,
          lastFullValidationAt: 60,
          selectionStats: [{ selectionKey: 'directory::/Albums', kind: 'directory', pathOrUri: '/Albums', itemCount: 2, latestModifiedTime: 90, capturedAt: 10 }],
          items: [
            createSourceItem({ sourceItemId: 'item_keep', pathOrUri: '/Albums/keep.mp3', versionToken: 'v_keep_old' }),
            createSourceItem({ sourceItemId: 'item_missing', pathOrUri: '/Albums/missing.mp3', versionToken: 'v_missing' }),
          ],
        }
      },
      async saveImportSnapshot(ruleId, snapshot) { saved.snapshot = { ruleId, snapshot } },
      async getImportRules() { return [rule] },
      async saveImportRules() {},
      async getConnections() { return [connection] },
      async saveSourceItems() {},
      async getAllSourceItems() { return [] },
      async saveAggregateSongs() {},
    },
    registry: {
      get() {
        return {
          async enumerateSelection() {
            return { complete: true, items: [{ sourceStableKey: '/Albums/keep.mp3', connectionId: 'conn_1', providerType: 'local', pathOrUri: '/Albums/keep.mp3', fileName: 'keep.mp3', fileSize: 100, modifiedTime: 130, versionToken: 'v_keep_new', metadataLevelReached: 0 }] }
          },
          async hydrateCandidate(_connection, candidate) {
            hydrateCalls.push(candidate.pathOrUri)
            return { candidate, metadata: { title: 'keep', artist: '', album: '', durationSec: 180 }, metadataLevelReached: 1 }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists() {},
      async removeMissingSongs(ids) { removeCalls.push(ids) },
      async markRuleRemoved() {},
    },
  })

  assert.deepEqual(hydrateCalls, ['/Albums/keep.mp3'])
  assert.deepEqual(removeCalls, [])
  assert.equal(saved.snapshot.snapshot.pendingFullValidation, true)
  assert.ok(saved.snapshot.snapshot.items.some(item => item.sourceItemId === 'item_missing'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/import-sync.test.js`
Expected: FAIL because `updateImportRule()` 没有 `syncMode` 分支，local 也还会退回整轮扫描。

- [ ] **Step 3: Write minimal implementation**

```js
// src/core/mediaLibrary/importSync.js
function createEmptySnapshot(ruleId) {
  return {
    ruleId,
    scannedAt: null,
    lastIncrementalSyncAt: null,
    lastFullValidationAt: null,
    pendingFullValidation: false,
    selectionStats: [],
    items: [],
  }
}

function createSelectionKey(selection = {}) {
  const kind = selection.kind === 'track' ? 'track' : 'directory'
  return `${kind}::${normalizePathOrUri(selection.pathOrUri)}`
}

function diffImportSelections(previousRule, nextRule) {
  const previousSelection = normalizeImportSelection(previousRule)
  const nextSelection = normalizeImportSelection(nextRule)
  const previousMap = new Map([...previousSelection.directories, ...previousSelection.tracks].map(item => [createSelectionKey(item), item]))
  const nextMap = new Map([...nextSelection.directories, ...nextSelection.tracks].map(item => [createSelectionKey(item), item]))
  return {
    addedSelections: [...nextMap.entries()].filter(([key]) => !previousMap.has(key)).map(([, item]) => item),
    removedSelections: [...previousMap.entries()].filter(([key]) => !nextMap.has(key)).map(([, item]) => item),
    unchangedSelections: [...nextMap.entries()].filter(([key]) => previousMap.has(key)).map(([, item]) => item),
  }
}

function buildSelectionStat(selection, candidates = [], capturedAt) {
  return {
    selectionKey: createSelectionKey(selection),
    kind: selection.kind,
    pathOrUri: selection.pathOrUri,
    itemCount: candidates.length,
    latestModifiedTime: Math.max(0, ...candidates.map(item => item.modifiedTime || 0)),
    capturedAt,
  }
}

async function runIncrementalSync({ connection, rule, previousRule = null, repository, registry, listApi, now = () => Date.now() }) {
  const provider = registry?.get?.(connection.providerType)
  if (!provider?.enumerateSelection || !provider?.hydrateCandidate) throw new Error(`Provider ${connection.providerType} does not support incremental sync`)

  const scanAt = now()
  const previousSnapshot = await repository.getImportSnapshot(rule.ruleId) || createEmptySnapshot(rule.ruleId)
  const previousItemsByPath = new Map(previousSnapshot.items.map(item => [normalizePathOrUri(item.pathOrUri), item]))
  const previousStats = new Map((previousSnapshot.selectionStats || []).map(item => [item.selectionKey, item]))
  const { addedSelections, removedSelections, unchangedSelections } = diffImportSelections(previousRule, rule)
  const hydratedItems = []
  const nextSelectionStats = []
  let pendingFullValidation = false

  for (const selection of [...addedSelections, ...unchangedSelections]) {
    const enumerateResult = await provider.enumerateSelection(connection, {
      directories: selection.kind === 'directory' ? [selection] : [],
      tracks: selection.kind === 'track' ? [selection] : [],
    })
    const stat = buildSelectionStat(selection, enumerateResult.items || [], scanAt)
    const previousStat = previousStats.get(stat.selectionKey) || null
    if (!previousStat || previousStat.itemCount !== stat.itemCount) pendingFullValidation = true
    nextSelectionStats.push(stat)

    for (const candidate of enumerateResult.items || []) {
      const previousItem = previousItemsByPath.get(normalizePathOrUri(candidate.pathOrUri)) || null
      const shouldHydrate = !previousStat || !previousItem || String(previousItem.versionToken || '') !== String(candidate.versionToken || '') || (candidate.modifiedTime || 0) > (previousSnapshot.lastIncrementalSyncAt || 0)
      if (!shouldHydrate) continue
      const hydrated = await provider.hydrateCandidate(connection, candidate, { attempt: 1 })
      hydratedItems.push({
        sourceItemId: `${connection.connectionId}__${candidate.pathOrUri}`,
        connectionId: connection.connectionId,
        providerType: connection.providerType,
        sourceUniqueKey: candidate.sourceStableKey || candidate.pathOrUri,
        pathOrUri: candidate.pathOrUri,
        fileName: candidate.fileName || '',
        title: hydrated.metadata?.title || '',
        artist: hydrated.metadata?.artist || '',
        album: hydrated.metadata?.album || '',
        durationSec: hydrated.metadata?.durationSec || 0,
        fileSize: candidate.fileSize || 0,
        modifiedTime: candidate.modifiedTime || 0,
        versionToken: candidate.versionToken || '',
        lastSeenAt: scanAt,
        scanStatus: 'success',
      })
    }
  }

  const retainedPreviousItems = previousSnapshot.items.filter(item => !removedSelections.some(selection => (
    selection.kind === 'directory'
      ? isWithinDirectory(normalizePathOrUri(item.pathOrUri), selection.pathOrUri)
      : normalizePathOrUri(selection.pathOrUri) === normalizePathOrUri(item.pathOrUri)
  )))
  const nextItems = mergeSourceItems(retainedPreviousItems, hydratedItems)

  return finalizeRuleSyncState({
    connection,
    rule,
    repository,
    listApi,
    scanAt,
    previousSnapshot,
    nextItems,
    isComplete: true,
    skipMissingRemoval: true,
    snapshotPatch: {
      lastIncrementalSyncAt: scanAt,
      lastFullValidationAt: previousSnapshot.lastFullValidationAt ?? null,
      pendingFullValidation,
      selectionStats: nextSelectionStats,
    },
  })
}

async function syncImportRule(options) {
  const { connection, syncMode = 'incremental', registry } = options
  const provider = registry?.get?.(connection.providerType)
  if (syncMode === 'incremental') return runIncrementalSync(options)
  if (connection.providerType !== 'local' && (provider?.streamEnumerateSelection || provider?.enumerateSelection) && provider?.hydrateCandidate) {
    return finalizeFullValidationResult(await runRemoteStreamingSync(options), options)
  }
  return runLocalFullValidationSync(options)
}

async function updateMediaConnection({ connection, repository, registry, listApi, now = () => Date.now(), syncMode = 'incremental' }) {
  const allRules = typeof repository.getImportRules === 'function' ? await repository.getImportRules() : []
  const connectionRules = allRules.filter(rule => rule.connectionId === connection.connectionId)
  const results = []
  for (const rule of connectionRules) {
    results.push(await updateImportRule({ connection, rule, repository, registry, listApi, now, syncMode }))
  }
  return results
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/import-sync.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/import-sync.test.js src/core/mediaLibrary/importSync.js
git commit -m "feat: add incremental media import sync mode"
```

### Task 4: Wire `syncMode` through auto sync, jobs, and settings UI

**Files:**
- Modify: `tests/media-library/auto-sync.test.js`
- Modify: `tests/media-library/media-source-settings-ui.test.js`
- Modify: `tests/media-library/import-sync.test.js`
- Modify: `src/core/mediaLibrary/autoSync.js`
- Modify: `src/core/mediaLibrary/jobQueue.ts`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx`
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`
- Test: `tests/media-library/auto-sync.test.js`
- Test: `tests/media-library/media-source-settings-ui.test.js`
- Test: `tests/media-library/import-sync.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/media-library/auto-sync.test.js
test('runEligibleMediaLibraryAutoSync always enqueues incremental sync jobs for stale remote rules', async() => {
  const calls = []
  const now = 2_000_000

  await runEligibleMediaLibraryAutoSync({
    repository: {
      async getConnections() { return [{ connectionId: 'conn_remote', providerType: 'onedrive', lastScanAt: now - AUTO_SYNC_COOLDOWN_MS, lastScanStatus: 'success' }] },
      async getImportRules() { return [{ ruleId: 'rule_remote', connectionId: 'conn_remote', lastSyncAt: now - AUTO_SYNC_COOLDOWN_MS, lastSyncStatus: 'success' }] },
    },
    enqueueImportRuleSyncJob: async(job) => { calls.push(job); return job },
    now: () => now,
  })

  assert.deepEqual(calls, [{ connectionId: 'conn_remote', ruleId: 'rule_remote', triggerSource: 'auto', syncMode: 'incremental' }])
})
```

```js
// tests/media-library/media-source-settings-ui.test.js
test('Account and rule cards expose quick-update and full-validation actions', () => {
  const accountFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx')
  const ruleFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx')
  const modalFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx')
  const zhCnFile = readFile('src/lang/zh-cn.json')

  assert.match(accountFile, /onFullValidate/)
  assert.match(accountFile, /media_source_full_validation/)
  assert.match(ruleFile, /onFullValidateRule/)
  assert.match(ruleFile, /media_source_full_validation/)
  assert.match(modalFile, /syncMode:\s*'incremental'/)
  assert.match(modalFile, /syncMode:\s*'full_validation'/)
  assert.match(zhCnFile, /"media_source_full_validation": "全量校验"/)
})
```

```js
// tests/media-library/import-sync.test.js
test('updateImportRule full_validation still removes missing covered songs and refreshes full-validation metadata', async() => {
  const connection = createConnection()
  const rule = createRule()
  const saved = { snapshot: null }
  const calls = []

  await updateImportRule({
    connection,
    rule,
    previousRule: rule,
    syncMode: 'full_validation',
    repository: {
      async getImportSnapshot() {
        return { ruleId: 'rule_1', scannedAt: 10, lastIncrementalSyncAt: 90, lastFullValidationAt: 30, selectionStats: [], items: [createSourceItem({ sourceItemId: 'old', pathOrUri: '/Albums/old.mp3' })] }
      },
      async saveImportSnapshot(ruleId, snapshot) { saved.snapshot = { ruleId, snapshot } },
      async getImportRules() { return [rule] },
      async saveImportRules() {},
      async getConnections() { return [connection] },
      async saveSourceItems() {},
      async getAllSourceItems() { return [] },
      async saveAggregateSongs() {},
    },
    registry: { get() { return { async scanSelection() { return { complete: true, items: [createSourceItem({ sourceItemId: 'new', pathOrUri: '/Albums/new.mp3' })] } } } } },
    listApi: { async reconcileGeneratedLists() {}, async removeMissingSongs(ids) { calls.push(ids) }, async markRuleRemoved() {} },
    now: () => 150,
  })

  assert.deepEqual(calls, [['old']])
  assert.equal(saved.snapshot.snapshot.lastIncrementalSyncAt, 90)
  assert.equal(saved.snapshot.snapshot.lastFullValidationAt, 150)
  assert.equal(saved.snapshot.snapshot.pendingFullValidation, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/auto-sync.test.js tests/media-library/media-source-settings-ui.test.js tests/media-library/import-sync.test.js`
Expected: FAIL because auto sync 没带 `syncMode`，UI 还没有“全量校验”，全量校验元数据也还没单独更新。

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/mediaLibrary/jobQueue.ts
const buildResultSummary = (result, syncMode: LX.MediaLibrary.SyncMode) => {
  const base = result?.syncStats
    ? `committed: ${result.syncStats.committedCount ?? 0}, removed: ${result.syncStats.removedCount ?? 0}, discovered: ${result.syncStats.discoveredCount ?? 0}`
    : result?.scanResult?.summary
      ? `success: ${result.scanResult.summary.success ?? 0}, failed: ${result.scanResult.summary.failed ?? 0}, skipped: ${result.scanResult.summary.skipped ?? 0}`
      : 'success'
  return `${syncMode}:${base}`
}

const syncMode = job.payload?.syncMode ?? 'incremental'
const result = await updateImportRule({ connection, rule, previousRule: job.payload?.previousRule ?? null, syncMode, repository: mediaLibraryRepository, registry: getMediaLibraryRuntimeRegistry(), listApi, triggerSource: job.payload?.triggerSource ?? 'manual', notifications: syncNotifications, jobControl })
const summary = buildResultSummary(result, syncMode)

export const enqueueImportRuleSyncJob = async({ connectionId, ruleId, previousRule = null, triggerSource = 'manual', syncMode = 'incremental', conflictMode = 'continue_previous' }) => {
  return getQueue().enqueueImportRuleJob({ connectionId, ruleId, payload: { previousRule, triggerSource, syncMode }, conflictMode })
}
```

```js
// src/core/mediaLibrary/autoSync.js
enqueued.push(await enqueueImportRuleSyncJob({
  connectionId: rule.connectionId,
  ruleId: rule.ruleId,
  triggerSource: 'auto',
  syncMode: 'incremental',
}))
```

```tsx
// src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx
const handleUpdateRule = async(rule: LX.MediaLibrary.ImportRule) => {
  await enqueueImportRuleSyncJob({ connectionId: currentConnection.connectionId, ruleId: rule.ruleId, previousRule: rule, conflictMode, syncMode: 'incremental' })
}

const handleFullValidateRule = async(rule: LX.MediaLibrary.ImportRule) => {
  await enqueueImportRuleSyncJob({ connectionId: currentConnection.connectionId, ruleId: rule.ruleId, previousRule: rule, conflictMode, syncMode: 'full_validation' })
}

const handleUpdateConnection = async(connection: LX.MediaLibrary.SourceConnection) => {
  if (!connectionRules.length) {
    await updateMediaConnection({ connection, repository: mediaLibraryRepository, registry: getMediaLibraryRuntimeRegistry(), listApi, syncMode: 'incremental' })
    return
  }
  await Promise.all(connectionRules.map(async rule => enqueueImportRuleSyncJob({ connectionId: connection.connectionId, ruleId: rule.ruleId, previousRule: rule, conflictMode, syncMode: 'incremental' })))
}

const handleFullValidateConnection = async(connection: LX.MediaLibrary.SourceConnection) => {
  if (!connectionRules.length) {
    await updateMediaConnection({ connection, repository: mediaLibraryRepository, registry: getMediaLibraryRuntimeRegistry(), listApi, syncMode: 'full_validation' })
    return
  }
  await Promise.all(connectionRules.map(async rule => enqueueImportRuleSyncJob({ connectionId: connection.connectionId, ruleId: rule.ruleId, previousRule: rule, conflictMode, syncMode: 'full_validation' })))
}
```

```tsx
// AccountList.tsx / RuleList.tsx
<Button onPress={() => { onUpdate(connection) }}>{t('media_source_update')}</Button>
<Button onPress={() => { onFullValidate(connection) }}>{t('media_source_full_validation')}</Button>

<Button onPress={() => { onUpdateRule(rule) }}>{t('media_source_update')}</Button>
<Button onPress={() => { onFullValidateRule(rule) }}>{t('media_source_full_validation')}</Button>
```

```json
// src/lang/zh-cn.json
"media_source_full_validation": "全量校验"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/auto-sync.test.js tests/media-library/media-source-settings-ui.test.js tests/media-library/import-sync.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/auto-sync.test.js tests/media-library/media-source-settings-ui.test.js tests/media-library/import-sync.test.js src/core/mediaLibrary/autoSync.js src/core/mediaLibrary/jobQueue.ts src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json
git commit -m "feat: expose full validation for media sources"
```

### Task 5: Final verification and changelog

**Files:**
- Modify: `CHANGELOG.md`
- Test: `tests/media-library/import-repository.test.js`
- Test: `tests/media-library/local-provider.test.js`
- Test: `tests/media-library/import-sync.test.js`
- Test: `tests/media-library/auto-sync.test.js`
- Test: `tests/media-library/import-jobs.test.js`
- Test: `tests/media-library/media-source-settings-ui.test.js`

- [ ] **Step 1: Write the failing test**

```md
## [Unreleased] - 2026-04-09

### 优化

- 媒体来源“更新”改为默认增量同步，优先补新加范围、近期新增歌曲与近期更新歌曲
- 媒体来源新增“全量校验 / 重新扫描”入口，只有这个动作才处理源端删歌
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/import-repository.test.js tests/media-library/local-provider.test.js tests/media-library/import-sync.test.js tests/media-library/auto-sync.test.js tests/media-library/import-jobs.test.js tests/media-library/media-source-settings-ui.test.js`
Expected: 至少一项 FAIL，直到前面四个任务全部完成。

- [ ] **Step 3: Write minimal implementation**

```md
# CHANGELOG.md
## [Unreleased] - 2026-04-09

### 优化

- 媒体来源“更新”改为默认增量同步，优先补新加范围、近期新增歌曲与近期更新歌曲
- 媒体来源新增“全量校验 / 重新扫描”入口，只有这个动作才处理源端删歌
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/import-repository.test.js tests/media-library/local-provider.test.js tests/media-library/import-sync.test.js tests/media-library/auto-sync.test.js tests/media-library/import-jobs.test.js tests/media-library/media-source-settings-ui.test.js`
Expected: PASS.

Run: `npx eslint src/core/mediaLibrary/repository.js src/core/mediaLibrary/providers/local.js src/core/mediaLibrary/importSync.js src/core/mediaLibrary/autoSync.js src/core/mediaLibrary/jobQueue.ts src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx tests/media-library/import-repository.test.js tests/media-library/local-provider.test.js tests/media-library/import-sync.test.js tests/media-library/auto-sync.test.js tests/media-library/import-jobs.test.js tests/media-library/media-source-settings-ui.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: note incremental media sync rollout"
```
