const { stopBackgroundSync } = require('../../utils/nativeModules/mediaLibrarySyncService.js')

const MEDIA_LIBRARY_SYNC_HEADLESS_TASK = 'MediaLibrarySyncHeadlessTask'

async function runMediaLibrarySyncHeadlessTask() {
  const { ensureMediaLibraryJobQueue } = require('./jobQueue')

  try {
    await ensureMediaLibraryJobQueue()
  } finally {
    try {
      await stopBackgroundSync()
    } catch {}
  }
}

module.exports = {
  MEDIA_LIBRARY_SYNC_HEADLESS_TASK,
  runMediaLibrarySyncHeadlessTask,
}
