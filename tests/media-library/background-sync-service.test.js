const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('android media library sync host uses a foreground headless task service', () => {
  const manifestFile = readFile('android/app/src/main/AndroidManifest.xml')
  const packageFile = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationPackage.java')
  const serviceFile = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncTaskService.java')
  const moduleFile = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncServiceModule.java')
  const helperFile = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/medialibrarysync/MediaLibrarySyncNotificationHelper.java')

  assert.match(serviceFile, /extends HeadlessJsTaskService/)
  assert.match(serviceFile, /MediaLibrarySyncHeadlessTask/)
  assert.match(serviceFile, /startForeground\(/)
  assert.match(serviceFile, /getReactNativeHost\(\)/)

  assert.match(moduleFile, /startBackgroundSync/)
  assert.match(moduleFile, /stopBackgroundSync/)
  assert.match(moduleFile, /startForegroundService|startService/)

  assert.match(helperFile, /CHANNEL_ID/)
  assert.match(helperFile, /NOTIFICATION_ID/)
  assert.match(helperFile, /NotificationCompat\.Builder/)

  assert.match(packageFile, /new MediaLibrarySyncServiceModule/)
  assert.match(manifestFile, /MediaLibrarySyncTaskService/)
  assert.match(manifestFile, /foregroundServiceType="dataSync"/)
})

test('js media library sync registers a headless task and requests native background execution', () => {
  const indexFile = readFile('index.js')
  const registerFile = readFile('src/core/mediaLibrary/registerBackgroundTask.js')
  const taskFile = readFile('src/core/mediaLibrary/backgroundSyncTask.js')
  const queueFile = readFile('src/core/mediaLibrary/jobQueue.ts')
  const bridgeFile = readFile('src/utils/nativeModules/mediaLibrarySyncService.js')

  assert.match(indexFile, /registerBackgroundTask/)
  assert.match(registerFile, /registerHeadlessTask/)
  assert.match(registerFile, /MediaLibrarySyncHeadlessTask/)

  assert.match(taskFile, /runMediaLibrarySyncHeadlessTask/)
  assert.match(taskFile, /ensureMediaLibraryJobQueue/)
  assert.match(taskFile, /stopBackgroundSync/)

  assert.match(bridgeFile, /startBackgroundSync/)
  assert.match(bridgeFile, /stopBackgroundSync/)

  assert.match(queueFile, /startBackgroundSync/)
  assert.match(queueFile, /ensureMediaLibraryJobQueue/)
})
