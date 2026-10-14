const { stopBackgroundSync } = require('../../utils/nativeModules/mediaLibrarySyncService.js')

const MEDIA_LIBRARY_SYNC_HEADLESS_TASK = 'MediaLibrarySyncHeadlessTask'

async function waitUntilMediaLibraryQueueIdle({
  ensureProcessing,
  hasActiveJobs,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  idlePollMs = 500,
} = {}) {
  do {
    await ensureProcessing?.()
    if (!await hasActiveJobs?.()) return
    await wait(idlePollMs)
  } while (true)
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
