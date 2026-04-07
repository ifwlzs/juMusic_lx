const { NativeModules } = require('react-native')

const { MediaLibrarySyncServiceModule } = NativeModules

async function call(method, ...args) {
  if (typeof MediaLibrarySyncServiceModule?.[method] !== 'function') return false
  return MediaLibrarySyncServiceModule[method](...args)
}

module.exports = {
  startBackgroundSync() {
    return call('startBackgroundSync')
  },
  stopBackgroundSync() {
    return call('stopBackgroundSync')
  },
}
