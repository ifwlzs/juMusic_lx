const notificationBridge = require('../../utils/nativeModules/mediaLibrarySyncNotification.js')

function appendCurrentPath(message, currentPath = '') {
  const pathText = String(currentPath || '').trim()
  return pathText ? `${message} · ${pathText}` : message
}

function buildProgressMessage({
  phase = 'sync',
  discoveredCount = 0,
  committedCount = 0,
  totalCount = 0,
  currentPath = '',
} = {}) {
  switch (phase) {
    case 'enumerate':
      return appendCurrentPath(
        discoveredCount > 0
          ? `正在扫描远端媒体 ${discoveredCount}`
          : '正在扫描远端媒体',
        currentPath,
      )
    case 'hydrate':
      return appendCurrentPath(
        totalCount > 0
          ? `正在补全歌曲信息 ${committedCount}/${totalCount}`
          : '正在补全歌曲信息',
        currentPath,
      )
    case 'commit':
      return appendCurrentPath(
        totalCount > 0
          ? `正在导入歌曲 ${committedCount}/${totalCount}`
          : '正在导入歌曲',
        currentPath,
      )
    case 'reconcile_delete':
      return '正在处理源端删除'
    default:
      return appendCurrentPath('正在同步远端媒体', currentPath)
  }
}

function buildFinishedMessage({ committedCount = 0, removedCount = 0, totalCount = 0 } = {}) {
  const safeCommitted = totalCount > 0
    ? Math.min(Number(committedCount) || 0, Number(totalCount) || 0)
    : (Number(committedCount) || 0)
  const countText = totalCount > 0 ? `${safeCommitted}/${totalCount}` : `${safeCommitted}`
  return removedCount > 0
    ? `已更新 ${countText} 首歌曲，移除 ${removedCount} 首`
    : `已更新 ${countText} 首歌曲`
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
      discoveredCount = 0,
      committedCount = 0,
      totalCount = 0,
      currentPath = '',
    } = {}) {
      return callBridge(
        'showSyncProgress',
        `媒体库同步: ${connectionName}`,
        buildProgressMessage({ phase, discoveredCount, committedCount, totalCount, currentPath }),
      )
    },
    async showSyncFinished({
      connectionName = '媒体库',
      committedCount = 0,
      removedCount = 0,
      totalCount = 0,
    } = {}) {
      return callBridge(
        'showSyncFinished',
        `媒体库同步完成: ${connectionName}`,
        buildFinishedMessage({ committedCount, removedCount, totalCount }),
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
  buildFinishedMessage,
  buildProgressMessage,
  createMediaLibrarySyncNotifications,
}
