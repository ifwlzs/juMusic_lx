const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { AUTO_SYNC_COOLDOWN_MS, shouldStartAutoSync, runEligibleMediaLibraryAutoSync } = require('../../src/core/mediaLibrary/autoSync.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('shouldStartAutoSync requires one day since the last successful sync', () => {
  const now = 1_000_000

  assert.equal(shouldStartAutoSync({ lastSyncFinishedAt: now - AUTO_SYNC_COOLDOWN_MS + 1 }, now), false)
  assert.equal(shouldStartAutoSync({ lastSyncFinishedAt: now - AUTO_SYNC_COOLDOWN_MS }, now), true)
  assert.equal(shouldStartAutoSync({ lastSyncFinishedAt: null }, now), true)
})

test('runEligibleMediaLibraryAutoSync enqueues only stale remote rules and tags them as auto', async() => {
  const calls = []
  const now = 2_000_000

  const result = await runEligibleMediaLibraryAutoSync({
    repository: {
      async getConnections() {
        return [
          { connectionId: 'conn_remote', providerType: 'onedrive', lastScanAt: now - (3 * AUTO_SYNC_COOLDOWN_MS), lastScanStatus: 'success' },
          { connectionId: 'conn_fresh', providerType: 'webdav', lastScanAt: now - 1_000, lastScanStatus: 'success' },
          { connectionId: 'conn_failed', providerType: 'smb', lastScanAt: now - 1_000, lastScanStatus: 'failed' },
          { connectionId: 'conn_local', providerType: 'local', lastScanAt: now - (3 * AUTO_SYNC_COOLDOWN_MS), lastScanStatus: 'success' },
        ]
      },
      async getImportRules() {
        return [
          { ruleId: 'rule_remote', connectionId: 'conn_remote', lastSyncAt: now - AUTO_SYNC_COOLDOWN_MS, lastSyncStatus: 'success' },
          { ruleId: 'rule_fresh', connectionId: 'conn_fresh', lastSyncAt: now - 1_000, lastSyncStatus: 'success' },
          { ruleId: 'rule_failed', connectionId: 'conn_failed', lastSyncAt: now - 1_000, lastSyncStatus: 'failed' },
          { ruleId: 'rule_local', connectionId: 'conn_local', lastSyncAt: now - AUTO_SYNC_COOLDOWN_MS, lastSyncStatus: 'success' },
        ]
      },
    },
    enqueueImportRuleSyncJob: async(job) => {
      calls.push(job)
      return job
    },
    now: () => now,
    trigger: 'boot',
  })

  assert.deepEqual(calls, [
    { connectionId: 'conn_remote', ruleId: 'rule_remote', triggerSource: 'auto', syncMode: 'incremental' },
    { connectionId: 'conn_failed', ruleId: 'rule_failed', triggerSource: 'auto', syncMode: 'incremental' },
  ])
  assert.deepEqual(result, calls)
})

test('runEligibleMediaLibraryAutoSync skips fresh queued/running jobs for the same rule and only re-enqueues stale runs', async() => {
  const calls = []
  const now = 3_000_000

  const result = await runEligibleMediaLibraryAutoSync({
    repository: {
      async getConnections() {
        return [
          { connectionId: 'conn_free', providerType: 'onedrive', lastScanAt: now - (3 * AUTO_SYNC_COOLDOWN_MS), lastScanStatus: 'success' },
          { connectionId: 'conn_queued', providerType: 'webdav', lastScanAt: now - (3 * AUTO_SYNC_COOLDOWN_MS), lastScanStatus: 'success' },
          { connectionId: 'conn_running', providerType: 'smb', lastScanAt: now - (3 * AUTO_SYNC_COOLDOWN_MS), lastScanStatus: 'success' },
          { connectionId: 'conn_stale', providerType: 'onedrive', lastScanAt: now - (3 * AUTO_SYNC_COOLDOWN_MS), lastScanStatus: 'success' },
        ]
      },
      async getImportRules() {
        return [
          { ruleId: 'rule_free', connectionId: 'conn_free', lastSyncAt: now - AUTO_SYNC_COOLDOWN_MS, lastSyncStatus: 'success' },
          { ruleId: 'rule_queued', connectionId: 'conn_queued', lastSyncAt: now - AUTO_SYNC_COOLDOWN_MS, lastSyncStatus: 'success' },
          { ruleId: 'rule_running', connectionId: 'conn_running', lastSyncAt: now - AUTO_SYNC_COOLDOWN_MS, lastSyncStatus: 'success' },
          { ruleId: 'rule_stale', connectionId: 'conn_stale', lastSyncAt: now - AUTO_SYNC_COOLDOWN_MS, lastSyncStatus: 'success' },
        ]
      },
      async getImportJobs() {
        return [
          {
            jobId: 'job_queued',
            type: 'import_rule_sync',
            connectionId: 'conn_queued',
            ruleId: 'rule_queued',
            status: 'queued',
            createdAt: now - 1000,
            startedAt: null,
            finishedAt: null,
            heartbeatAt: null,
          },
          {
            jobId: 'job_running',
            type: 'import_rule_sync',
            connectionId: 'conn_running',
            ruleId: 'rule_running',
            status: 'running',
            createdAt: now - 2000,
            startedAt: now - 1500,
            finishedAt: null,
            heartbeatAt: now - 5000,
          },
          {
            jobId: 'job_stale',
            type: 'import_rule_sync',
            connectionId: 'conn_stale',
            ruleId: 'rule_stale',
            status: 'running',
            createdAt: now - 2000,
            startedAt: now - 1500,
            finishedAt: null,
            heartbeatAt: now - 60_000,
          },
        ]
      },
    },
    enqueueImportRuleSyncJob: async(job) => {
      calls.push(job)
      return job
    },
    now: () => now,
  })

  assert.deepEqual(calls, [
    { connectionId: 'conn_free', ruleId: 'rule_free', triggerSource: 'auto', syncMode: 'incremental' },
    { connectionId: 'conn_stale', ruleId: 'rule_stale', triggerSource: 'auto', syncMode: 'incremental' },
  ])
  assert.deepEqual(result, calls)
})

test('media library init and settings page trigger eligible auto sync checks', () => {
  const initFile = readFile('src/core/init/mediaLibrary.ts')
  const settingsFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx')

  assert.match(initFile, /triggerEligibleMediaLibraryAutoSync/)
  assert.match(settingsFile, /triggerEligibleMediaLibraryAutoSync/)
})

test('sync notification bridge is wired into JS wrapper and Android package registration', () => {
  const wrapperFile = readFile('src/utils/nativeModules/mediaLibrarySyncNotification.js')
  const notificationsFile = readFile('src/core/mediaLibrary/syncNotifications.js')
  const mainApplicationFile = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java')
  const packageFile = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationPackage.java')
  const moduleFile = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationModule.java')

  assert.match(wrapperFile, /NativeModules/)
  assert.match(wrapperFile, /MediaLibrarySyncNotificationModule/)
  assert.match(notificationsFile, /showSyncProgress/)
  assert.match(notificationsFile, /showSyncFinished/)
  assert.match(notificationsFile, /showSyncFailed/)
  assert.match(mainApplicationFile, /MediaLibrarySyncNotificationPackage/)
  assert.match(mainApplicationFile, /packages\.add\(new MediaLibrarySyncNotificationPackage\(\)\)/)
  assert.match(packageFile, /new MediaLibrarySyncNotificationModule/)
  assert.match(moduleFile, /showSyncProgress/)
  assert.match(moduleFile, /showSyncFinished/)
  assert.match(moduleFile, /showSyncFailed/)
})
