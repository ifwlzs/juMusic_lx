const { AppRegistry } = require('react-native')
const { MEDIA_LIBRARY_SYNC_HEADLESS_TASK, runMediaLibrarySyncHeadlessTask } = require('./backgroundSyncTask.js')

function registerBackgroundTask(appRegistry = AppRegistry) {
  if (global.__lxMediaLibrarySyncHeadlessTaskRegistered) return false

  appRegistry.registerHeadlessTask(
    MEDIA_LIBRARY_SYNC_HEADLESS_TASK,
    () => runMediaLibrarySyncHeadlessTask,
  )
  global.__lxMediaLibrarySyncHeadlessTaskRegistered = true
  return true
}

registerBackgroundTask()

module.exports = {
  registerBackgroundTask,
}
