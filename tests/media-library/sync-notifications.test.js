const test = require('node:test')
const assert = require('node:assert/strict')

const notificationBridgePath = require.resolve('../../src/utils/nativeModules/mediaLibrarySyncNotification.js')
require.cache[notificationBridgePath] = {
  id: notificationBridgePath,
  filename: notificationBridgePath,
  loaded: true,
  exports: {
    showSyncProgress() {
      return false
    },
    showSyncFinished() {
      return false
    },
    showSyncFailed() {
      return false
    },
    clearSyncNotification() {
      return false
    },
  },
}

const {
  buildProgressMessage,
  buildFinishedMessage,
} = require('../../src/core/mediaLibrary/syncNotifications.js')

test('buildProgressMessage reports streaming discovery and commit progress', () => {
  assert.equal(
    buildProgressMessage({ phase: 'hydrate', discoveredCount: 20, committedCount: 3, totalCount: 20 }),
    '正在补全歌曲信息 3/20',
  )
  assert.equal(
    buildProgressMessage({ phase: 'commit', discoveredCount: 20, committedCount: 7, totalCount: 20 }),
    '正在导入歌曲 7/20',
  )
})

test('buildFinishedMessage reports committed and removed counts', () => {
  assert.equal(
    buildFinishedMessage({ committedCount: 12, removedCount: 2, totalCount: 15 }),
    '已更新 12/15 首歌曲，移除 2 首',
  )
})
