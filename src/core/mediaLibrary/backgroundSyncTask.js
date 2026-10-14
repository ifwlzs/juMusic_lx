const { stopBackgroundSync } = require('../../utils/nativeModules/mediaLibrarySyncService.js')

const MEDIA_LIBRARY_SYNC_HEADLESS_TASK = 'MediaLibrarySyncHeadlessTask'

async function waitUntilMediaLibraryQueueIdle({
  ensureProcessing,
  hasActiveJobs,
} = {}) {
  do {
    await ensureProcessing?.()
  } while (await hasActiveJobs?.())
}

async function runMediaLibrarySyncHeadlessTask() {
  const {
    ensureMediaLibraryJobQueue,
    hasActiveMediaLibrarySyncJobs,
  } = require('./jobQueue')

  try {
    await waitUntilMediaLibraryQueueIdle({
      ensureProcessing: ensureMediaLibraryJobQueue,
      hasActiveJobs: hasActiveMediaLibrarySyncJobs,
    })
  } finally {
    try {
      await stopBackgroundSync()
    } catch {}
  }
}

module.exports = {
  MEDIA_LIBRARY_SYNC_HEADLESS_TASK,
  runMediaLibrarySyncHeadlessTask,
  waitUntilMediaLibraryQueueIdle,
}
