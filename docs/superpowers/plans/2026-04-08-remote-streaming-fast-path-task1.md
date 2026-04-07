# Remote Streaming Fast-Path Task 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stream enumeration to remote providers and surface OneDrive Graph audio metadata hints on candidates.

**Architecture:** Extend provider contracts with `streamEnumerateSelection` that emits batches while preserving `enumerateSelection` behavior by streaming into an array. OneDrive listChildren requests include audio facets so candidates can expose cheap `metadataHints` without hydration.

**Tech Stack:** Node.js tests (`node:test`), JavaScript providers, TypeScript type declarations.

---

### Task 1: Add Failing Provider Tests for Stream Enumeration and OneDrive Hints

**Files:**
- Modify: `tests/media-library/streaming-provider-contract.test.js`
- Modify: `tests/media-library/onedrive-provider.test.js`
- Modify: `tests/media-library/webdav-provider.test.js`
- Modify: `tests/media-library/smb-bridge.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/media-library/streaming-provider-contract.test.js
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
```

```js
// tests/media-library/onedrive-provider.test.js
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

```js
// tests/media-library/webdav-provider.test.js
test('createWebdavProvider streamEnumerateSelection streams candidates before hydration', async() => {
  const xml = `<?xml version="1.0"?>
  <d:multistatus xmlns:d="DAV:">
    <d:response>
      <d:href>/music/</d:href>
      <d:propstat><d:prop><d:getetag>"root"</d:getetag></d:prop></d:propstat>
    </d:response>
    <d:response>
      <d:href>/music/test.mp3</d:href>
      <d:propstat>
        <d:prop>
          <d:getetag>"abc"</d:getetag>
          <d:getlastmodified>Sat, 05 Apr 2026 10:00:00 GMT</d:getlastmodified>
          <d:getcontentlength>321</d:getcontentlength>
        </d:prop>
      </d:propstat>
    </d:response>
  </d:multistatus>`

  const batches = []
  const provider = createWebdavProvider({
    async request() { return xml },
    async downloadFile() {},
    async readMetadata() { return null },
  })

  const result = await provider.streamEnumerateSelection({
    connectionId: 'conn_1',
    providerType: 'webdav',
  }, {
    directories: [{ selectionId: 'dir_1', kind: 'directory', pathOrUri: '/music/', displayName: 'music' }],
    tracks: [],
  }, async batch => {
    batches.push(batch)
  })

  assert.equal(batches.length, 1)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].pathOrUri, '/music/test.mp3')
})
```

```js
// tests/media-library/smb-bridge.test.js
test('createSmbProvider streamEnumerateSelection streams candidates before hydration', async() => {
  const batches = []
  const provider = createSmbProvider({
    async listDirectory(_connection, pathOrUri) {
      if (pathOrUri === '/music') {
        return [
          { path: '/music/a.mp3', name: 'a.mp3', isDirectory: false, size: 10, modifiedTime: 1700000000001 },
        ]
      }
      return []
    },
    async readMetadata() { return null },
    async downloadFile() { return null },
  })

  const result = await provider.streamEnumerateSelection({
    connectionId: 'conn_1',
    providerType: 'smb',
  }, {
    directories: [{ selectionId: 'dir_1', kind: 'directory', pathOrUri: '/music', displayName: 'music' }],
    tracks: [],
  }, async batch => {
    batches.push(batch)
  })

  assert.equal(batches.length, 1)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].pathOrUri, '/music/a.mp3')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/media-library/streaming-provider-contract.test.js tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js`

Expected: FAIL because `streamEnumerateSelection` is missing and OneDrive candidates do not include `metadataHints`.

---

### Task 2: Extend Graph Queries and Candidate Types for Metadata Hints

**Files:**
- Modify: `src/core/mediaLibrary/oneDriveGraph.js`
- Modify: `src/types/mediaLibrary.d.ts`

- [ ] **Step 1: Update Graph children select to include audio facet**

```js
function buildChildrenUrl(pathOrUri = '') {
  const encodedPath = encodeGraphPath(pathOrUri)
  const baseUrl = encodedPath
    ? `${GRAPH_BASE_URL}/me/drive/root:${encodedPath}:/children`
    : `${GRAPH_BASE_URL}/me/drive/root/children`

  return `${baseUrl}?$select=name,size,file,folder,parentReference,eTag,lastModifiedDateTime,audio`
}
```

- [ ] **Step 2: Add metadata hints to SyncCandidate**

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

---

### Task 3: Implement Stream Enumeration and OneDrive Metadata Hints

**Files:**
- Modify: `src/core/mediaLibrary/providers/onedrive.js`
- Modify: `src/core/mediaLibrary/providers/webdav.js`
- Modify: `src/core/mediaLibrary/providers/smb.js`

- [ ] **Step 1: Add shared batch emission helper**

```js
async function emitBatches(items, onBatch, batchSize = 10) {
  if (typeof onBatch !== 'function') return
  for (let index = 0; index < items.length; index += batchSize) {
    await onBatch(items.slice(index, index + batchSize))
  }
}
```

- [ ] **Step 2: OneDrive metadata hints + streamEnumerateSelection**

```js
function toMetadataHints(fileName, item = {}) {
  return {
    title: stripExtension(fileName),
    artist: item.audio?.artist || '',
    album: item.audio?.album || '',
    durationSec: item.audio?.duration ? Math.round(item.audio.duration / 1000) : 0,
  }
}

function toCandidate(connection, item) {
  const pathOrUri = buildPathOrUri(item)
  const fileName = item?.name || getFileName(pathOrUri)
  return {
    sourceStableKey: pathOrUri,
    connectionId: connection.connectionId,
    providerType: 'onedrive',
    pathOrUri,
    fileName,
    fileSize: item?.size || 0,
    modifiedTime: item?.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) || 0 : 0,
    versionToken: buildVersionToken(item, pathOrUri),
    metadataHints: toMetadataHints(fileName, item),
    metadataLevelReached: 0,
  }
}
```

```js
async streamEnumerateSelection(connection, selection = {}, onBatch) {
  const items = []
  for (const directory of selection.directories || []) {
    const batchItems = await collectDirectoryTracks(listChildren, connection, directory.pathOrUri)
    const candidates = dedupeItems(batchItems).map(item => toCandidate(connection, item))
    items.push(...candidates)
    await emitBatches(candidates, onBatch)
  }
  for (const track of selection.tracks || []) {
    const entry = await getItemByPath(connection, track.pathOrUri)
    if (entry?.file && isAudioFile(entry.name)) {
      const candidates = dedupeItems([entry]).map(item => toCandidate(connection, item))
      items.push(...candidates)
      await emitBatches(candidates, onBatch)
    }
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
```

- [ ] **Step 3: WebDAV streamEnumerateSelection + enumerateSelection fallback**

```js
async streamEnumerateSelection(connection, selection = {}, onBatch) {
  const entries = []
  for (const directory of selection.directories || []) {
    entries.push(...await requestPropfind(request, connection, directory.pathOrUri, 'infinity'))
  }
  for (const track of selection.tracks || []) {
    const entry = await resolveTrackEntry(request, connection, track.pathOrUri)
    if (entry) entries.push(entry)
  }
  const dedupedEntries = [...new Map(entries.map(item => [normalizeHref(item.href), item])).values()]
  const items = dedupedEntries
    .filter(item => !isDirectoryHref(item.href))
    .filter(item => isAudioFile(getFileName(item.href)))
    .map(item => toCandidate(connection, item))
  await emitBatches(items, onBatch)
  return { complete: true, items }
},
async enumerateSelection(connection, selection = {}) {
  const streamed = []
  await this.streamEnumerateSelection(connection, selection, async batch => {
    streamed.push(...batch)
  })
  return { complete: true, items: streamed }
},
```

- [ ] **Step 4: SMB streamEnumerateSelection + enumerateSelection fallback**

```js
async streamEnumerateSelection(connection, selection = {}, onBatch) {
  const files = []
  for (const directory of selection.directories || []) {
    const nested = await collectSmbFiles(listDirectory, directory.pathOrUri, connection)
    files.push(...nested.files)
  }
  for (const track of selection.tracks || []) {
    const entry = await resolveSmbFile(listDirectory, connection, track.pathOrUri)
    if (entry && isAudioFile(entry.name)) files.push(entry)
  }
  const dedupedFiles = [...new Map(files.map(file => [file.path, file])).values()]
  const items = dedupedFiles.map(file => toCandidate(connection, file))
  await emitBatches(items, onBatch)
  return { complete: true, items }
},
async enumerateSelection(connection, selection = {}) {
  const streamed = []
  await this.streamEnumerateSelection(connection, selection, async batch => {
    streamed.push(...batch)
  })
  return { complete: true, items: streamed }
},
```

---

### Task 4: Verify and Commit

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

- [ ] **Step 1: Run the provider suite**

Run: `node --test tests/media-library/streaming-provider-contract.test.js tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js`

Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add tests/media-library/streaming-provider-contract.test.js tests/media-library/onedrive-provider.test.js tests/media-library/webdav-provider.test.js tests/media-library/smb-bridge.test.js src/core/mediaLibrary/oneDriveGraph.js src/core/mediaLibrary/providers/onedrive.js src/core/mediaLibrary/providers/webdav.js src/core/mediaLibrary/providers/smb.js src/types/mediaLibrary.d.ts docs/superpowers/plans/2026-04-08-remote-streaming-fast-path-task1.md
git commit -m "feat: add streaming enumeration and onedrive metadata hints"
```

---

## Self-Review Checklist

- Spec coverage: Added stream enumerate contract, OneDrive metadata hints, Graph audio select, and SyncCandidate metadataHints.
- Placeholder scan: No placeholders or TBD markers.
- Type consistency: `metadataHints` uses `SyncCandidateMetadata` and matches candidate usage in tests and providers.
