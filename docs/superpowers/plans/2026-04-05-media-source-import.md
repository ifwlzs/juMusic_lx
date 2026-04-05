# Media Source Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build media-source account management in settings, scoped directory/track import rules, read-only generated playlists in My List, and two-phase manual updates that only cache tracks on playback.

**Architecture:** Extend the media-library repository with import-rule state and snapshots, add provider-level browse/scoped-scan APIs, then layer a sync service that materializes generated playlists into the existing `userList` storage. Keep My List flat by treating generated playlists as read-only user lists with media metadata, and move account/rule management into a settings modal rather than the legacy My List overlay.

**Tech Stack:** React Native + TSX UI, CommonJS media-library core modules, existing list storage/events, `node:test`, targeted lint, Android Gradle compile

---

## File Map

### Core domain and persistence

- Modify: `src/types/mediaLibrary.d.ts`
  Add import-rule, selection-node, snapshot, and generated-playlist metadata types.
- Modify: `src/types/list.d.ts`
  Extend `UserListInfo` with read-only media-source metadata.
- Modify: `src/types/music.d.ts`
  Extend `meta.mediaLibrary` with unavailable-state metadata for placeholder rows.
- Modify: `src/core/mediaLibrary/repository.js`
  Add storage keys and CRUD methods for import rules and snapshots.
- Create: `src/core/mediaLibrary/importRules.js`
  ID helpers, selection normalization, and delete-account helper entrypoints.
- Create: `src/core/mediaLibrary/browse.js`
  Provider browse facade and selection-tree normalization helpers.
- Create: `src/core/mediaLibrary/importSync.js`
  Two-phase sync orchestration, generated-playlist materialization, and delete-account/source-missing behavior.
- Create: `src/core/mediaLibrary/systemLists.js`
  Stable generated-list IDs and `UserListInfo` builders for account-all, per-directory, merged, and singles lists.

### Provider integration

- Modify: `src/core/mediaLibrary/providers/local.js`
  Add `browseConnection` and `scanSelection` support using existing `readDir`.
- Modify: `src/core/mediaLibrary/providers/smb.js`
  Add `browseConnection` and `scanSelection` support on top of `listDirectory`.
- Modify: `src/core/mediaLibrary/providers/webdav.js`
  Add depth-1 browse and scoped PROPFIND recursion for selected folders/files.

### My List integration

- Modify: `src/screens/Home/Views/Mylist/MyList/ListMenu.tsx`
  Disable list-level destructive/edit actions for generated media lists and remove legacy source-management shortcut.
- Modify: `src/screens/Home/Views/Mylist/MyList/index.tsx`
  Stop mounting the legacy `SourceLists` overlay.
- Modify: `src/screens/Home/Views/Mylist/MusicList/List.tsx`
  Block direct playback of unavailable placeholder songs.
- Modify: `src/screens/Home/Views/Mylist/MusicList/ListItem.tsx`
  Show source/read-only/unavailable badges and dim placeholder rows.
- Modify: `src/screens/Home/Views/Mylist/MusicList/ListMenu.tsx`
  Disable remove/move/reorder/edit metadata for read-only generated lists and unavailable songs.
- Modify: `src/screens/Home/Views/Mylist/MusicList/listAction.ts`
  Guard play/play-later/remove against unavailable placeholders and show user-facing toasts.

### Settings UI

- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx`
  Settings subsection entry button and summary.
- Modify: `src/screens/Home/Views/Setting/settings/Basic/index.tsx`
  Mount the new `MediaSources` subsection.
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx`
  Main modal shell.
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx`
  Account cards with edit/manage/update/delete.
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ConnectionForm.tsx`
  Account editor for local/WebDAV/SMB credentials and root path.
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ImportRuleEditor.tsx`
  Rule name, generation mode, and save/update controls.
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/DirectoryBrowser.tsx`
  Tree view for multi-selecting directories and tracks.
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx`
  Existing-rule summaries and per-rule update/delete actions.
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`
  Add settings/media-source labels, statuses, rule modes, and placeholder messages.

### Tests

- Create: `tests/media-library/import-repository.test.js`
- Create: `tests/media-library/browse.test.js`
- Create: `tests/media-library/import-sync.test.js`
- Create: `tests/media-library/system-list-ui.test.js`
- Create: `tests/media-library/media-source-settings-ui.test.js`
- Modify: `tests/media-library/source-lists-ui.test.js`
  Replace the old My List source-management expectation with the new settings-based entry assertions.

---

### Task 1: Extend Repository and Types for Import Rules

**Files:**
- Modify: `src/types/mediaLibrary.d.ts`
- Modify: `src/types/list.d.ts`
- Modify: `src/types/music.d.ts`
- Modify: `src/core/mediaLibrary/repository.js`
- Test: `tests/media-library/import-repository.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { createMediaLibraryRepository } = require('../../src/core/mediaLibrary/repository.js')

const createMemoryStorage = () => {
  const map = new Map()
  return {
    async get(key) { return map.has(key) ? map.get(key) : null },
    async set(key, value) { map.set(key, value) },
    async remove(key) { map.delete(key) },
  }
}

test('repository persists import rules and snapshots separately from connections', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveImportRules([{
    ruleId: 'rule_1',
    connectionId: 'conn_1',
    name: 'Albums',
    mode: 'per_directory',
    directories: [{ selectionId: 'dir_1', pathOrUri: '/Albums', displayName: 'Albums' }],
    tracks: [],
  }])
  await repo.saveImportSnapshot('rule_1', {
    scannedAt: 100,
    items: [{ sourceItemId: 'item_1', pathOrUri: '/Albums/song.mp3' }],
  })

  const rules = await repo.getImportRules()
  const snapshot = await repo.getImportSnapshot('rule_1')

  assert.equal(rules[0].ruleId, 'rule_1')
  assert.equal(snapshot.items[0].sourceItemId, 'item_1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/import-repository.test.js`  
Expected: FAIL with `repo.saveImportRules is not a function` or missing storage key assertions.

- [ ] **Step 3: Write minimal implementation**

```js
function createKeyBuilder(prefix = '@media_library__') {
  return {
    connections: () => `${prefix}connections`,
    importRules: () => `${prefix}import_rules`,
    importSnapshot: ruleId => `${prefix}import_snapshot__${ruleId}`,
    // existing keys...
  }
}

async function saveImportRules(items) {
  await storage.set(keys.importRules(), items.map(sanitizeImportRule))
}

async function getImportRules() {
  return await storage.get(keys.importRules()) || []
}

async function saveImportSnapshot(ruleId, snapshot) {
  await storage.set(keys.importSnapshot(ruleId), snapshot)
}

async function getImportSnapshot(ruleId) {
  return await storage.get(keys.importSnapshot(ruleId)) || null
}
```

```ts
interface ImportRule {
  ruleId: string
  connectionId: string
  name: string
  mode: 'account_all_only' | 'per_directory' | 'merged'
  directories: Array<{ selectionId: string, pathOrUri: string, displayName: string }>
  tracks: Array<{ selectionId: string, pathOrUri: string, displayName: string }>
  generatedListIds?: string[]
  lastSyncAt?: number | null
  lastSyncStatus?: LX.MediaLibrary.ConnectionScanStatus
}
```

```ts
interface UserListInfo {
  id: string
  name: string
  locationUpdateTime: number | null
  mediaSource?: {
    generated: true
    readOnly: true
    connectionId: string
    ruleId?: string
    kind: 'account_all' | 'rule_directory' | 'rule_merged' | 'rule_singles'
    sourcePathOrUri?: string
  }
}
```

```ts
mediaLibrary?: {
  connectionId: string
  sourceItemId: string
  aggregateSongId: string
  providerType: LX.MediaLibrary.ProviderType
  remotePathOrUri: string
  versionToken: string
  preferredSourceItemId?: string
  unavailableReason?: 'connection_removed'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/import-repository.test.js tests/media-library/repository.test.js`  
Expected: PASS, including existing repository coverage.

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/import-repository.test.js src/types/mediaLibrary.d.ts src/types/list.d.ts src/types/music.d.ts src/core/mediaLibrary/repository.js
git commit -m "feat: add media source import repository state"
```

### Task 2: Add Provider Browse and Scoped Selection Scan APIs

**Files:**
- Create: `src/core/mediaLibrary/browse.js`
- Modify: `src/core/mediaLibrary/providers/local.js`
- Modify: `src/core/mediaLibrary/providers/smb.js`
- Modify: `src/core/mediaLibrary/providers/webdav.js`
- Test: `tests/media-library/browse.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { createLocalProvider } = require('../../src/core/mediaLibrary/providers/local.js')

test('local provider browseConnection returns directories and audio files only', async() => {
  const provider = createLocalProvider({
    async readDir(path) {
      if (path === '/Music') {
        return [
          { name: 'Albums', path: '/Music/Albums', isDirectory: true },
          { name: 'song.mp3', path: '/Music/song.mp3', isDirectory: false, size: 1, lastModified: 1 },
          { name: 'cover.jpg', path: '/Music/cover.jpg', isDirectory: false, size: 1, lastModified: 1 },
        ]
      }
      return []
    },
    async readMetadata() { return { name: 'song', singer: '', albumName: '', interval: 0 } },
  })

  const nodes = await provider.browseConnection({ connectionId: 'c1', rootPathOrUri: '/Music' }, '/Music')

  assert.deepEqual(nodes.map(item => item.name), ['Albums', 'song.mp3'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/browse.test.js`  
Expected: FAIL with `provider.browseConnection is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
function toBrowserNode(entry, kind) {
  return {
    nodeId: `${kind}__${entry.path}`,
    kind,
    name: entry.name,
    pathOrUri: entry.path,
  }
}

async function browseConnection(connection, pathOrUri) {
  const entries = await readDir(pathOrUri)
  return entries
    .filter(entry => entry.isDirectory || isAudioFile(entry.name))
    .map(entry => toBrowserNode(entry, entry.isDirectory ? 'directory' : 'track'))
}

async function scanSelection(connection, selection) {
  const dirs = await Promise.all(selection.directories.map(dir => collectLocalFiles(readDir, dir.pathOrUri)))
  const directTracks = selection.tracks.map(track => ({
    name: track.displayName,
    path: track.pathOrUri,
    isDirectory: false,
  }))
  const files = [...dirs.flatMap(item => item.files), ...directTracks]
  return buildScanItems(files, connection)
}
```

```js
async function browseConnection(registry, connection, pathOrUri = connection.rootPathOrUri) {
  return registry.get(connection.providerType).browseConnection(connection, pathOrUri)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/browse.test.js tests/media-library/local-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js`  
Expected: PASS with browse and scoped-scan coverage.

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/browse.test.js src/core/mediaLibrary/browse.js src/core/mediaLibrary/providers/local.js src/core/mediaLibrary/providers/smb.js src/core/mediaLibrary/providers/webdav.js
git commit -m "feat: add media source browse and scoped scan"
```

### Task 3: Build Two-Phase Import Sync and Generated Playlist Materialization

**Files:**
- Create: `src/core/mediaLibrary/systemLists.js`
- Create: `src/core/mediaLibrary/importRules.js`
- Create: `src/core/mediaLibrary/importSync.js`
- Modify: `src/core/mediaLibrary/sourceLists.js`
- Test: `tests/media-library/import-sync.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { syncImportRule } = require('../../src/core/mediaLibrary/importSync.js')

test('syncImportRule adds new songs before removing missing songs', async() => {
  const calls = []
  await syncImportRule({
    connection: { connectionId: 'conn_1', providerType: 'local', displayName: 'Disk' },
    rule: {
      ruleId: 'rule_1',
      connectionId: 'conn_1',
      name: 'Albums',
      mode: 'merged',
      directories: [{ selectionId: 'dir_1', pathOrUri: '/Albums', displayName: 'Albums' }],
      tracks: [],
    },
    repository: {
      async getImportSnapshot() { return { scannedAt: 1, items: [{ sourceItemId: 'old', pathOrUri: '/Albums/old.mp3' }] } },
      async saveImportSnapshot() {},
      async getImportRules() { return [] },
      async getConnections() { return [] },
      async saveSourceItems() {},
      async saveAggregateSongs() {},
    },
    registry: {
      get() {
        return {
          async scanSelection() {
            return { complete: true, items: [{ sourceItemId: 'new', pathOrUri: '/Albums/new.mp3' }] }
          },
        }
      },
    },
    listApi: {
      async upsertGeneratedLists(result) { calls.push(['upsert', result.addedIds]) },
      async removeMissingSongs(ids) { calls.push(['remove', ids]) },
    },
  })

  assert.deepEqual(calls, [
    ['upsert', ['new']],
    ['remove', ['old']],
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/import-sync.test.js`  
Expected: FAIL with missing `syncImportRule` export.

- [ ] **Step 3: Write minimal implementation**

```js
function buildGeneratedListId(connectionId, ruleId, kind, sourcePathOrUri = '') {
  return ['media', connectionId, ruleId || 'all', kind, sourcePathOrUri].filter(Boolean).join('__')
}

async function syncImportRule({ connection, rule, repository, registry, listApi }) {
  const provider = registry.get(connection.providerType)
  const prevSnapshot = await repository.getImportSnapshot(rule.ruleId) || { items: [] }
  const scanResult = await provider.scanSelection(connection, rule)
  const nextItems = scanResult.items

  const prevIds = new Set(prevSnapshot.items.map(item => item.sourceItemId))
  const nextIds = new Set(nextItems.map(item => item.sourceItemId))
  const addedIds = nextItems.filter(item => !prevIds.has(item.sourceItemId)).map(item => item.sourceItemId)
  const removedIds = scanResult.complete
    ? prevSnapshot.items.filter(item => !nextIds.has(item.sourceItemId)).map(item => item.sourceItemId)
    : []

  await listApi.upsertGeneratedLists({ connection, rule, items: nextItems, addedIds })
  if (removedIds.length) await listApi.removeMissingSongs(removedIds)
  await repository.saveImportSnapshot(rule.ruleId, { scannedAt: Date.now(), items: nextItems })
}
```

```js
function buildAccountAllList(connection, tracks) {
  return {
    id: buildGeneratedListId(connection.connectionId, null, 'account_all'),
    name: `${connection.displayName} · 全部媒体`,
    mediaSource: {
      generated: true,
      readOnly: true,
      connectionId: connection.connectionId,
      kind: 'account_all',
    },
    list: tracks,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/import-sync.test.js tests/media-library/core-rules.test.js`  
Expected: PASS with two-phase sync ordering validated.

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/import-sync.test.js src/core/mediaLibrary/systemLists.js src/core/mediaLibrary/importRules.js src/core/mediaLibrary/importSync.js src/core/mediaLibrary/sourceLists.js
git commit -m "feat: add media source import sync"
```

### Task 4: Materialize Read-Only System Lists and Placeholder Behavior in My List

**Files:**
- Modify: `src/screens/Home/Views/Mylist/MyList/ListMenu.tsx`
- Modify: `src/screens/Home/Views/Mylist/MyList/index.tsx`
- Modify: `src/screens/Home/Views/Mylist/MusicList/List.tsx`
- Modify: `src/screens/Home/Views/Mylist/MusicList/ListItem.tsx`
- Modify: `src/screens/Home/Views/Mylist/MusicList/ListMenu.tsx`
- Modify: `src/screens/Home/Views/Mylist/MusicList/listAction.ts`
- Test: `tests/media-library/system-list-ui.test.js`
- Modify: `tests/media-library/source-lists-ui.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('generated media lists are treated as read-only in My List menus', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MyList/ListMenu.tsx')
  assert.match(file, /mediaSource\?\.readOnly/)
})

test('music rows render unavailable media-library state', () => {
  const file = readFile('src/screens/Home/Views/Mylist/MusicList/ListItem.tsx')
  assert.match(file, /unavailableReason/)
  assert.match(file, /Badge/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/system-list-ui.test.js tests/media-library/source-lists-ui.test.js`  
Expected: FAIL because read-only guards and unavailable rendering do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
const readOnly = Boolean((listInfo as LX.List.UserListInfo).mediaSource?.readOnly)

setMenus([
  { action: 'rename', disabled: !rename || readOnly, label: t('list_rename') },
  { action: 'import', disabled: readOnly, label: t('list_import') },
  { action: 'export', disabled: readOnly, label: t('list_export') },
  { action: 'remove', disabled: !remove || readOnly, label: t('list_remove') },
])
```

```ts
const unavailableReason = item.meta.mediaLibrary?.unavailableReason
const canPlay = !unavailableReason

<Badge>{unavailableReason ? t('media_source_unavailable_badge') : item.source.toUpperCase()}</Badge>
<TouchableOpacity disabled={!canPlay} onPress={() => { onPress(item, index) }}>
```

```ts
export const handlePlay = (listId, index, musicInfo) => {
  if (musicInfo.meta.mediaLibrary?.unavailableReason) {
    toast(global.i18n.t('media_source_track_unavailable'))
    return
  }
  void playList(listId, index)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/system-list-ui.test.js tests/media-library/source-lists-ui.test.js`  
Expected: PASS with the legacy My List source-management assertions updated to settings-based behavior.

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/system-list-ui.test.js tests/media-library/source-lists-ui.test.js src/screens/Home/Views/Mylist/MyList/ListMenu.tsx src/screens/Home/Views/Mylist/MyList/index.tsx src/screens/Home/Views/Mylist/MusicList/List.tsx src/screens/Home/Views/Mylist/MusicList/ListItem.tsx src/screens/Home/Views/Mylist/MusicList/ListMenu.tsx src/screens/Home/Views/Mylist/MusicList/listAction.ts
git commit -m "feat: integrate read-only media playlists"
```

### Task 5: Add Settings-Based Media Source Manager UI

**Files:**
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/index.tsx`
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx`
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx`
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ConnectionForm.tsx`
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx`
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ImportRuleEditor.tsx`
- Create: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/DirectoryBrowser.tsx`
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`
- Test: `tests/media-library/media-source-settings-ui.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('Basic settings mounts MediaSources subsection', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/index.tsx')
  assert.match(file, /MediaSources/)
})

test('Media source manager exposes account and rule actions', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx')
  assert.match(file, /AccountList/)
  assert.match(file, /ImportRuleEditor/)
  assert.match(file, /DirectoryBrowser/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/media-source-settings-ui.test.js`  
Expected: FAIL because the settings entry and manager files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
export default memo(() => {
  const t = useI18n()
  const modalRef = useRef<MediaSourceManagerModalType>(null)

  return (
    <SubTitle title={t('setting_media_sources')}>
      <View style={styles.actions}>
        <Button onPress={() => { modalRef.current?.show() }}>{t('setting_media_sources_manage')}</Button>
      </View>
      <MediaSourceManagerModal ref={modalRef} />
    </SubTitle>
  )
})
```

```tsx
export default forwardRef<MediaSourceManagerModalType>((_, ref) => {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<'accounts' | 'connection' | 'rules'>('accounts')
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({
    show() { setVisible(true) },
  }))

  if (!visible) return null

  return (
    <Dialog /* shell */>
      {step === 'accounts' ? <AccountList onManageRules={setSelectedConnectionId} /> : null}
      {step === 'connection' ? <ConnectionForm onSaved={() => setStep('rules')} /> : null}
      {step === 'rules' ? <ImportRuleEditor connectionId={selectedConnectionId!} /> : null}
    </Dialog>
  )
})
```

```tsx
export default function DirectoryBrowser({ nodes, onToggle }) {
  return (
    <ScrollView>
      {nodes.map(node => (
        <Pressable key={node.nodeId} onPress={() => { onToggle(node) }}>
          <Text>{node.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/media-source-settings-ui.test.js`  
Expected: PASS with the new settings-based manager shell and entry.

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/media-source-settings-ui.test.js src/screens/Home/Views/Setting/settings/Basic/index.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ConnectionForm.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ImportRuleEditor.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/DirectoryBrowser.tsx src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json
git commit -m "feat: add media source settings manager"
```

### Task 6: Wire Rule Editing, Manual Update, and Delete Flows End-to-End

**Files:**
- Modify: `src/core/mediaLibrary/importRules.js`
- Modify: `src/core/mediaLibrary/importSync.js`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ImportRuleEditor.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/DirectoryBrowser.tsx`
- Test: `tests/media-library/import-sync.test.js`
- Test: `tests/media-library/media-source-settings-ui.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('delete account converts referenced custom-list tracks into placeholders but source-missing sync removes them', async() => {
  const effects = []

  await deleteMediaConnection({
    connectionId: 'conn_1',
    repository: fakeRepo,
    listApi: {
      async markConnectionRemoved(ids) { effects.push(['placeholder', ids]) },
      async removeGeneratedLists(ids) { effects.push(['removeLists', ids]) },
    },
  })

  await applyMissingSourceRemoval({
    missingSourceItemIds: ['item_2'],
    listApi: {
      async removeMissingSongs(ids) { effects.push(['removeSongs', ids]) },
    },
  })

  assert.deepEqual(effects, [
    ['removeLists', ['media__conn_1__all']],
    ['placeholder', ['item_1', 'item_2']],
    ['removeSongs', ['item_2']],
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/import-sync.test.js tests/media-library/media-source-settings-ui.test.js`  
Expected: FAIL because delete/update flows are not fully wired.

- [ ] **Step 3: Write minimal implementation**

```js
async function deleteMediaConnection({ connectionId, repository, listApi }) {
  const rules = (await repository.getImportRules()).filter(rule => rule.connectionId === connectionId)
  const snapshots = await Promise.all(rules.map(rule => repository.getImportSnapshot(rule.ruleId)))
  const sourceItemIds = snapshots.flatMap(snapshot => (snapshot?.items || []).map(item => item.sourceItemId))

  await listApi.removeGeneratedLists(buildGeneratedIdsForConnection(connectionId, rules))
  await listApi.markConnectionRemoved(sourceItemIds)
  await repository.removeImportRules(rules.map(rule => rule.ruleId))
}

async function updateImportRule(input) {
  await syncImportRule(input)
  await rebuildAccountAllList(input.connection.connectionId, input.repository, input.listApi)
}
```

```tsx
<Button onPress={() => { void onUpdateRule(rule.ruleId) }}>{t('media_source_update')}</Button>
<Button onPress={() => { void onDeleteRule(rule.ruleId) }}>{t('media_source_delete_rule')}</Button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/import-sync.test.js tests/media-library/media-source-settings-ui.test.js`  
Expected: PASS with end-to-end update/delete behavior covered.

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/import-sync.test.js tests/media-library/media-source-settings-ui.test.js src/core/mediaLibrary/importRules.js src/core/mediaLibrary/importSync.js src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ImportRuleEditor.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/DirectoryBrowser.tsx
git commit -m "feat: wire media source update and delete flows"
```

### Task 7: Verification and Final Cleanup

**Files:**
- Verify only; no planned source additions beyond fixes from test results.

- [ ] **Step 1: Run focused media-library tests**

Run:

```bash
node --test tests/media-library/import-repository.test.js tests/media-library/browse.test.js tests/media-library/import-sync.test.js tests/media-library/system-list-ui.test.js tests/media-library/media-source-settings-ui.test.js tests/media-library/repository.test.js tests/media-library/local-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js tests/media-library/search-integration.test.js tests/media-library/analytics-integration.test.js
```

Expected: PASS for the full media-library slice.

- [ ] **Step 2: Run targeted lint**

Run:

```bash
npm run lint -- src/core/mediaLibrary src/screens/Home/Views/Setting/settings/Basic src/screens/Home/Views/Mylist src/types/mediaLibrary.d.ts src/types/list.d.ts src/types/music.d.ts
```

Expected: PASS with no new lint errors in touched files.

- [ ] **Step 3: Run Android compile smoke check**

Run:

```bash
android\gradlew.bat :app:compileDebugJavaWithJavac
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Manual spot-check**

Run:

```bash
npm run dev
```

Expected manual checks:

```text
1. 设置 -> 基础 -> 媒体来源 可打开并新增 WebDAV/SMB 账号
2. 可浏览目录并多选目录/单曲
3. 首次导入后“我的列表”出现 全部媒体/目录歌单
4. 播放远端歌曲时才触发缓存
5. 删除账号后自建歌单显示占位；完整更新确认源文件删除后自建歌单歌曲被移除
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: verify media source import flow"
```
