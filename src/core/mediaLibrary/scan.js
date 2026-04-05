const { buildAggregateSongs } = require('./dedupe.js')

async function scanConnection({ repository, registry, connection, deleteLocalFile }) {
  const scanStartedAt = Date.now()
  let scannedItems = []
  let scanStatus = 'success'
  let scanSummary = ''
  let diff = null
  try {
    const provider = registry.get(connection.providerType)
    const scanResult = await provider.scanConnection(connection)
    const scanSummaryInfo = Array.isArray(scanResult) ? null : scanResult?.summary || null
    scannedItems = Array.isArray(scanResult) ? scanResult : (scanResult?.items || [])
    diff = await repository.reconcileScannedItems(connection.connectionId, scannedItems)
    const invalidatedCaches = diff?.invalidatedCaches || []

    if (invalidatedCaches.length) {
      for (const cache of invalidatedCaches) {
        if (cache.localFilePath && deleteLocalFile) {
          try {
            await deleteLocalFile(cache.localFilePath)
          } catch (error) {
            // ignore
          }
        }
      }
      const cacheIds = invalidatedCaches.map(cache => cache.cacheId)
      await repository.removeCaches(cacheIds)
    }

    const connections = await repository.getConnections()
    const allSourceItems = await repository.getAllSourceItems(connections.map(item => item.connectionId))
    const validSourceItems = allSourceItems.filter(item => item.scanStatus !== 'failed')
    await repository.saveAggregateSongs(buildAggregateSongs(validSourceItems))

    const computedSuccessCount = scannedItems.filter(item => item.scanStatus !== 'failed').length
    const successCount = scanSummaryInfo?.success ?? computedSuccessCount
    const failedCount = scanSummaryInfo?.failed ?? (scannedItems.length - successCount)
    const skippedCount = scanSummaryInfo?.skipped ?? 0
    scanSummary = `success: ${successCount}, failed: ${failedCount}, skipped: ${skippedCount}`
  } catch (error) {
    scanStatus = 'failed'
    scanSummary = `failed: ${error?.message || 'scan failed'}`
    throw error
  } finally {
    const connections = await repository.getConnections()
    const updatedConnections = connections.map(item => {
      if (item.connectionId !== connection.connectionId) return item
      return {
        ...item,
        lastScanAt: scanStartedAt,
        lastScanStatus: scanStatus,
        lastScanSummary: scanSummary,
      }
    })
    await repository.saveConnections(updatedConnections)
  }
  return diff
}

module.exports = {
  scanConnection,
}
