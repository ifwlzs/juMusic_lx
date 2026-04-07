const notificationBridge = require('../../utils/nativeModules/mediaLibrarySyncNotification.js')

function buildProgressMessage({ phase = 'sync', committedCount = 0, totalCount = 0 }) {
  switch (phase) {
    case 'enumerate':
      return '正在扫描远端媒体'
    case 'hydrate':
      return totalCount > 0
        ? `正在补全歌曲信息 ${committedCount}/${totalCount}`
        : '正在补全歌曲信息'
    case 'commit':
      return totalCount > 0
        ? `正在导入歌曲 ${committedCount}/${totalCount}`
        : '正在导入歌曲'
    case 'reconcile_delete':
      return '正在处理源端删除'
    default:
      return '正在同步远端媒体'
  }
}

function createMediaLibrarySyncNotifications({ bridge = notificationBridge } = {}) {
  async function callBridge(method, ...args) {
    if (typeof bridge?.[method] !== 'function') return false
    try {
      return await bridge[method](...args)
    } catch {
      return false
    }
  }

  return {
    async showSyncProgress({
      connectionName = '媒体库',
      phase = 'sync',
      committedCount = 0,
      totalCount = 0,
    } = {}) {
      return callBridge(
        'showSyncProgress',
        `媒体库同步: ${connectionName}`,
        buildProgressMessage({ phase, committedCount, totalCount }),
      )
    },
    async showSyncFinished({
      connectionName = '媒体库',
      committedCount = 0,
      totalCount = 0,
    } = {}) {
      const countText = totalCount > 0 ? `${committedCount}/${totalCount}` : `${committedCount}`
      return callBridge(
        'showSyncFinished',
        `媒体库同步完成: ${connectionName}`,
        `已更新 ${countText} 首歌曲`,
      )
    },
    async showSyncFailed({
      connectionName = '媒体库',
      errorMessage = '同步失败',
    } = {}) {
      return callBridge(
        'showSyncFailed',
        `媒体库同步失败: ${connectionName}`,
        String(errorMessage || '同步失败'),
      )
    },
    async clear() {
      return callBridge('clearSyncNotification')
    },
  }
}

module.exports = {
  createMediaLibrarySyncNotifications,
}
