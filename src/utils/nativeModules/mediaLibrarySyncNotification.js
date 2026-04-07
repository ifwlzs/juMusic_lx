const { NativeModules } = require('react-native')

const { MediaLibrarySyncNotificationModule } = NativeModules

async function call(method, ...args) {
  if (typeof MediaLibrarySyncNotificationModule?.[method] !== 'function') return false
  return MediaLibrarySyncNotificationModule[method](...args)
}

module.exports = {
  showSyncProgress(title, message) {
    return call('showSyncProgress', title, message)
  },
  showSyncFinished(title, message) {
    return call('showSyncFinished', title, message)
  },
  showSyncFailed(title, message) {
    return call('showSyncFailed', title, message)
  },
  clearSyncNotification() {
    return call('clearSyncNotification')
  },
}
