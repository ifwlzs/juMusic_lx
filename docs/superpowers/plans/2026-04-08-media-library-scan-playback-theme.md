# Media Library Scan And Playback Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize remote media-library scanning, add cooperative scan prioritization, make remote first-play seek wait for uncached targets, and finish the approved play-detail/theme polish.

**Architecture:** Keep the existing persisted media-library job queue, but extend each job with runtime ownership, heartbeat, pause request, and resume metadata so different JS runtimes stop stealing active work. Add a small pending-seek coordinator on the player progress path, and keep play-detail colors/theme customization inside the current setting and theme pipelines.

**Tech Stack:** React Native 0.73, TypeScript/JavaScript mixed codebase, Node built-in test runner, existing setting store and theme builder

---

### Task 1: Harden Remote Scan Queue Ownership And Conflict Handling

**Files:**
- Modify: `src/core/mediaLibrary/jobs.js`
- Modify: `src/core/mediaLibrary/jobQueue.ts`
- Modify: `src/core/mediaLibrary/importSync.js`
- Modify: `src/core/mediaLibrary/streamingSync.js`
- Modify: `src/core/mediaLibrary/repository.js`
- Modify: `src/types/mediaLibrary.d.ts`
- Modify: `tests/media-library/import-jobs.test.js`
- Modify: `tests/media-library/streaming-sync-coordinator.test.js`

- [ ] **Step 1: Write failing queue/state tests**

Add tests for:
- running jobs with fresh `runtimeOwnerId` + `heartbeatAt` are not blindly requeued
- stale running jobs are recovered back to `queued`
- `current_first` conflict strategy marks the active job `pause_requested` and inserts the new job ahead of normal queued work
- paused jobs resume only after their target priority job completes

- [ ] **Step 2: Run the focused queue tests and verify RED**

Run:

```bash
node --test tests/media-library/import-jobs.test.js
```

Expected:
- at least one new assertion fails because owner/heartbeat/pause behavior does not exist yet

- [ ] **Step 3: Implement queue ownership and pause metadata**

Add these persisted fields to import jobs:

```ts
runtimeOwnerId?: string | null
heartbeatAt?: number | null
pauseRequestedAt?: number | null
resumeAfterJobId?: string | null
```

Update the queue so it:
- generates one runtime owner id per queue instance
- only requeues `running` jobs whose heartbeat is stale
- keeps fresh foreign-owned `running` jobs untouched
- can enqueue with conflict mode `continue_previous` or `current_first`
- marks active jobs as pause-requested and resumes paused jobs after the priority job finishes

- [ ] **Step 4: Extend streaming sync to cooperate with pause requests**

Pass job-control callbacks from `jobQueue.ts` into `updateImportRule()` and `runRemoteStreamingSync()` so remote scans can:
- heartbeat while running
- stop on pause request between enumerate/hydrate/commit work units
- preserve previous visible lists and snapshots when pausing before completion

- [ ] **Step 5: Run the queue and coordinator tests and verify GREEN**

Run:

```bash
node --test tests/media-library/import-jobs.test.js tests/media-library/streaming-sync-coordinator.test.js
```

Expected:
- all focused tests pass

### Task 2: Add Scan Conflict Choice To Media Source Manager

**Files:**
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx`
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`

- [ ] **Step 1: Write failing UI contract tests**

Add string/file-content assertions for:
- paused state copy
- conflict-choice copy
- OD label copy in user-visible lightweight source text

- [ ] **Step 2: Run the new contract test and verify RED**

Run:

```bash
node --test tests/media-library/media-source-copy.test.js
```

Expected:
- fail because the new copy and conflict choice flow are not wired yet

- [ ] **Step 3: Implement conflict-choice prompt and paused rendering**

Make the media source manager:
- detect active remote work before enqueuing a new remote scan
- offer `继续之前的扫描` vs `当前扫描优先`
- pass the selected mode into `enqueueImportRuleSyncJob()`
- render `paused` state in rule cards

Also rename light user-facing OneDrive shorthand to `OD`.

- [ ] **Step 4: Run the contract tests and verify GREEN**

Run:

```bash
node --test tests/media-library/media-source-copy.test.js
```

Expected:
- pass

### Task 3: Make Remote First-Play Seek Wait For Data

**Files:**
- Create: `src/core/mediaLibrary/pendingSeek.js`
- Modify: `src/core/music/mediaLibrary.ts`
- Modify: `src/core/init/player/playProgress.ts`
- Modify: `src/store/player/state.ts`
- Modify: `src/store/player/action.ts`
- Modify: `src/types/player.d.ts`
- Add Test: `tests/media-library/pending-seek.test.js`

- [ ] **Step 1: Write failing pending-seek tests**

Cover:
- remote uncached seek stores a `pendingSeekTime`
- UI progress jumps immediately to the requested time
- actual `seekTo()` is deferred until buffered coverage reaches the target
- later seeks replace earlier pending targets

- [ ] **Step 2: Run the pending-seek tests and verify RED**

Run:

```bash
node --test tests/media-library/pending-seek.test.js
```

Expected:
- fail because there is no pending seek coordinator

- [ ] **Step 3: Implement the pending seek coordinator**

Add a helper that decides:
- immediate local seek
- remote seek that must wait
- retry / clear behavior when playback becomes ready or buffered progress advances

Wire it into `playProgress.ts` so the player state can show the requested time without letting audio continue from the old offset.

- [ ] **Step 4: Run the pending-seek tests and verify GREEN**

Run:

```bash
node --test tests/media-library/pending-seek.test.js
```

Expected:
- pass

### Task 4: Finish Play Detail Overlay And Theme Color Customization

**Files:**
- Modify: `src/components/PageContent.tsx`
- Modify: `src/components/common/StatusBar.tsx`
- Modify: `src/screens/PlayDetail/index.tsx`
- Modify: `src/screens/PlayDetail/palette.ts`
- Modify: `src/screens/PlayDetail/Vertical/Lyric.tsx`
- Modify: `src/screens/PlayDetail/Horizontal/Lyric.tsx`
- Modify: `src/config/defaultSetting.ts`
- Modify: `src/config/setting.ts`
- Modify: `src/types/app_setting.d.ts`
- Modify: `src/theme/themes/index.ts`
- Modify: `src/screens/Home/Views/Setting/settings/Theme/index.tsx`
- Create: `src/screens/Home/Views/Setting/settings/Theme/CustomColors.tsx`
- Add Test: `tests/play-detail/theme-customization.test.js`
- Modify: `tests/play-detail/foreground-colors.test.js`

- [ ] **Step 1: Write failing play-detail/theme tests**

Cover:
- play detail can force white status bar icons/text
- play-detail background overlay uses a deeper gray treatment
- dark theme active lyric defaults to white
- light/dark theme color overrides are read from settings
- current line / unplayed line / translation / romanized lyric colors can be resolved separately

- [ ] **Step 2: Run the play-detail/theme tests and verify RED**

Run:

```bash
node --test tests/play-detail/foreground-colors.test.js tests/play-detail/theme-customization.test.js
```

Expected:
- fail because the new overlay, status bar override, and custom color settings do not exist yet

- [ ] **Step 3: Implement play-detail overlay, palette resolver, and settings**

Add:
- stronger gray overlay for `playDetailEmby`
- a `forceLightContent` prop on the shared status bar
- theme-setting keys for light/dark primary and lyric color slots
- a resolver that falls back to existing theme tones when custom colors are unset
- a minimal theme settings entry that edits both light and dark color groups

- [ ] **Step 4: Run the play-detail/theme tests and verify GREEN**

Run:

```bash
node --test tests/play-detail/foreground-colors.test.js tests/play-detail/theme-customization.test.js
```

Expected:
- pass

### Task 5: Final Verification And Integration

**Files:**
- Modify: implementation files above only

- [ ] **Step 1: Run the combined regression suite**

Run:

```bash
node --test tests/media-library/import-jobs.test.js tests/media-library/streaming-sync-coordinator.test.js tests/media-library/pending-seek.test.js tests/media-library/media-source-copy.test.js tests/play-detail/foreground-colors.test.js tests/play-detail/theme-customization.test.js
```

- [ ] **Step 2: Run a native compile sanity check**

Run:

```bash
cd android
./gradlew.bat :app:compileDebugJavaWithJavac
```

- [ ] **Step 3: Inspect diff scope**

Run:

```bash
git diff --stat
git status --short
```

Ensure the diff stays within:
- media-library queue/sync files
- player progress / play-detail files
- theme setting files
- related tests and lang updates

- [ ] **Step 4: Merge back to `main` and push**

After verification:
- commit on feature branch
- merge into `main`
- push `main` to GitHub
