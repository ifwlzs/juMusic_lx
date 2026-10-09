# Media Library Sync Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让媒体库同步在极端断网时快速失败并保住已有歌曲，修正「已更新 10574/10566」口径，并让扫描进度持续刷新，避免卡在一个数字。

**Architecture:** 抽出 `syncResilience.js` 负责超时识别和连续网络失败熔断。增量同步与全量流式同步共用熔断、失败通知、旧元数据复用。Provider 枚举增加 `shouldDescendDirectory` / `onDirectory`，增量用目录 `modifiedTime` 跳过未变化的嵌套目录。完成通知改用本轮处理数/发现数。

**Tech Stack:** React Native 0.73, Node test runner, existing media-library providers (webdav/smb/onedrive), job queue, Android sync notifications.

## Global Constraints

- 默认「更新」仍是 `incremental`，全量校验仍是 `full_validation`。
- 增量不处理源端删歌。
- 连续 5 次网络类失败后停止整轮，错误码 `MEDIA_LIBRARY_NETWORK_UNAVAILABLE`。
- 有完整旧元数据时，hydrate 失败不得写成 00:00 / degraded 覆盖。
- 完成文案分子不超过分母。
- 不改系统歌单结构和播放链路。

---

## File Structure

- Create: `src/core/mediaLibrary/syncResilience.js`
- Create: `tests/media-library/sync-resilience.test.js`
- Modify: `src/core/mediaLibrary/syncNotifications.js`
- Modify: `tests/media-library/sync-notifications.test.js`
- Modify: `src/core/mediaLibrary/importSync.js`
- Modify: `src/core/mediaLibrary/streamingSync.js`
- Modify: `src/core/mediaLibrary/runtimeRegistry.js`
- Modify: `src/core/mediaLibrary/providers/webdav.js`
- Modify: `src/core/mediaLibrary/providers/smb.js`
- Modify: `src/core/mediaLibrary/providers/onedrive.js`
- Modify: `tests/media-library/import-sync.test.js`
- Modify: `tests/media-library/streaming-sync-coordinator.test.js`
- Modify: `tests/media-library/webdav-provider.test.js`
- Modify: `tests/media-library/smb-bridge.test.js`
- Modify: `tests/media-library/onedrive-provider.test.js`
- Modify: `tests/media-library/webdav-runtime.test.js`

### Task 1: Finished count and live progress copy

**Files:**
- Modify: `tests/media-library/sync-notifications.test.js`
- Modify: `src/core/mediaLibrary/syncNotifications.js`

**Interfaces:**
- Produces: `buildFinishedMessage({ committedCount, removedCount, totalCount })` caps committed at total.
- Produces: `buildProgressMessage({ ..., currentPath })` appends ` · ${currentPath}`.
- Produces: `showSyncProgress` forwards `currentPath`.

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Implement copy**
- [ ] **Step 3: Verify tests pass**
- [ ] **Step 4: Commit**

### Task 2: Network failure guard

**Files:**
- Create: `tests/media-library/sync-resilience.test.js`
- Create: `src/core/mediaLibrary/syncResilience.js`

**Interfaces:**
- Produces: `isNetworkLikeError(error)`
- Produces: `createNetworkFailureGuard({ consecutiveFailureLimit = 5 })` with `recordSuccess()` / `recordFailure(error)`
- Produces: `createMediaLibraryNetworkUnavailableError()`
- Produces: `createTimeoutSignal(timeoutMs)` `{ signal, clear }`
- Produces: timeout constants 15000 / 15000 / 45000

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Implement helper**
- [ ] **Step 3: Verify tests pass**
- [ ] **Step 4: Commit**

### Task 3: Provider enumerate hooks and hydrate network errors

**Files:**
- Modify: webdav/smb/onedrive providers and their tests

**Interfaces:**
- `streamEnumerateSelection(connection, selection, onBatch, options = {})`
- `options.shouldDescendDirectory({ pathOrUri, modifiedTime })`
- `options.onDirectory({ pathOrUri })`
- hydrate / metadata download rethrows network-like errors

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Implement hooks and rethrow**
- [ ] **Step 3: Verify tests pass**
- [ ] **Step 4: Commit**

### Task 4: Streaming sync resilience

**Files:**
- Modify: `src/core/mediaLibrary/streamingSync.js`
- Modify: `tests/media-library/streaming-sync-coordinator.test.js`

**Interfaces:**
- Reuse previous ready item when hydrate fails or degrades.
- 5 consecutive network failures throw `MEDIA_LIBRARY_NETWORK_UNAVAILABLE` and `showSyncFailed`.
- Progress includes `currentPath`.
- Finished counts: committed this run vs discovered this run.

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Implement**
- [ ] **Step 3: Verify tests pass**
- [ ] **Step 4: Commit**

### Task 5: Incremental checkpoints, skip unchanged dirs, counts, pause

**Files:**
- Modify: `src/core/mediaLibrary/importSync.js`
- Modify: `src/core/mediaLibrary/runtimeRegistry.js`
- Modify: `tests/media-library/import-sync.test.js`
- Modify: `tests/media-library/webdav-runtime.test.js`

**Interfaces:**
- Finished notification uses `processedCount` / `discoveredCount`.
- Pass `jobControl` into incremental; pause throws `MEDIA_IMPORT_JOB_PAUSED`.
- Checkpoint snapshot after each batch (`isComplete: false`).
- Pass `shouldDescendDirectory` using `modifiedTime > lastIncrementalCutoff`.
- Progress updates per item/directory with `currentPath`.
- Incremental errors call `showSyncFailed`.
- WebDAV fetch/download timeouts.

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Implement**
- [ ] **Step 3: Verify tests pass**
- [ ] **Step 4: Commit**
