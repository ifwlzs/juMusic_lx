# OneDrive Background Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OneDrive media-library imports keep running reliably after the app goes to the background on Android.

**Architecture:** Add an Android foreground `HeadlessJsTaskService` that owns remote media-library sync execution, then hook the persisted JS import queue to request that service whenever a remote sync job is queued. Reuse the existing media-library notification channel and queue persistence so background execution resumes the same job stream instead of introducing a second sync pipeline.

**Tech Stack:** React Native 0.73, Android native modules/services (Java), Headless JS, persisted media-library job queue, Node built-in test runner

---

### Task 1: Add Android Background Sync Host

**Files:**
- Create: `android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncTaskService.java`
- Create: `android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncServiceModule.java`
- Create: `android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationHelper.java`
- Modify: `android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationModule.java`
- Modify: `android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationPackage.java`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] Add a failing regression test that expects a dedicated headless sync service, a service control native module, and manifest registration for a foreground media-library sync service.
- [ ] Run the targeted media-library test file and verify it fails because the service/module/manifest wiring does not exist yet.
- [ ] Implement the helper/service/module wiring with these boundaries:
  - `MediaLibrarySyncNotificationHelper` owns notification channel/id/constants and foreground notification creation.
  - `MediaLibrarySyncTaskService` extends `HeadlessJsTaskService`, starts in foreground, returns a `HeadlessJsTaskConfig` keyed by `MediaLibrarySyncHeadlessTask`, and overrides `getReactNativeHost()` to use `MainApplication`.
  - `MediaLibrarySyncServiceModule` exposes `startBackgroundSync()` and `stopBackgroundSync()` to JS.
  - `AndroidManifest.xml` registers the service with `android:foregroundServiceType="dataSync"`.
- [ ] Re-run the targeted test and verify it passes.

### Task 2: Route Remote Queue Work Through Headless JS

**Files:**
- Create: `src/core/mediaLibrary/backgroundSyncTask.js`
- Create: `src/core/mediaLibrary/registerBackgroundTask.js`
- Create: `src/utils/nativeModules/mediaLibrarySyncService.js`
- Modify: `index.js`
- Modify: `src/core/mediaLibrary/jobQueue.ts`

- [ ] Add a failing regression test that expects the JS bundle to register `MediaLibrarySyncHeadlessTask`, expose a headless task runner, and request the native background sync service when remote media-library jobs are queued.
- [ ] Run the targeted test file and verify it fails for the expected missing registration/bridge symbols.
- [ ] Implement the minimal JS integration:
  - `backgroundSyncTask.js` exports the headless task key plus a `runMediaLibrarySyncHeadlessTask()` runner that drains the existing queue and always stops the native service in `finally`.
  - `registerBackgroundTask.js` registers the headless task with `AppRegistry`.
  - `index.js` imports the registration side-effect before app bootstrap.
  - `jobQueue.ts` exports a queue-drain helper and requests native background execution for non-local sync jobs while keeping the existing persisted queue semantics.
- [ ] Re-run the targeted test and verify it passes.

### Task 3: Keep Media-Library Notifications and Queue Behavior Coherent

**Files:**
- Modify: `tests/media-library/auto-sync.test.js`
- Modify: `tests/media-library/streaming-sync-coordinator.test.js`
- Modify: `src/core/mediaLibrary/jobQueue.ts`
- Modify: `src/core/mediaLibrary/syncNotifications.js`

- [ ] Add or extend tests so they verify the background runner reuses the current notification bridge and does not create a second import pipeline.
- [ ] Run the focused streaming/queue/auto-sync test set and verify at least one test fails before the final glue changes land.
- [ ] Finish the queue glue so remote jobs still use the same persisted queue, the headless task drains it end-to-end, and completion/failure paths leave the notification/service state clean.
- [ ] Re-run the focused media-library background-sync tests and verify they all pass.

### Task 4: Full Verification

**Files:**
- Modify: `tests/media-library/auto-sync.test.js`
- Modify: `tests/media-library/streaming-sync-coordinator.test.js`
- Modify: `tests/media-library/onedrive-auth-setup.test.js`

- [ ] Run `node --test tests/media-library/auto-sync.test.js tests/media-library/streaming-sync-coordinator.test.js tests/media-library/import-jobs.test.js tests/media-library/onedrive-auth-setup.test.js`.
- [ ] Run `git diff --stat` and verify the change set is limited to the Android sync host, JS bridge, and regression tests above.
- [ ] If verification passes, proceed to branch-finishing workflow for commit/push/package follow-up.
