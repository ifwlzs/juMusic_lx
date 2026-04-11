async function resolveDownloadResult(downloadResult, {
  operation = 'download',
  requireBytes = true,
} = {}) {
  const result = downloadResult?.promise
    ? await downloadResult.promise
    : await downloadResult

  const statusCode = Number(result?.statusCode)
  if (Number.isFinite(statusCode) && (statusCode < 200 || statusCode >= 300)) {
    throw new Error(`${operation} failed with status ${statusCode}`)
  }

  const bytesWritten = Number(result?.bytesWritten)
  if (requireBytes && Number.isFinite(bytesWritten) && bytesWritten <= 0) {
    throw new Error(`${operation} failed with empty file (${bytesWritten} bytes)`)
  }

  return result
}

module.exports = {
  resolveDownloadResult,
}
