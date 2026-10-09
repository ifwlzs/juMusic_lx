const DEFAULT_CONSECUTIVE_FAILURE_LIMIT = 5
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_DOWNLOAD_CONNECTION_TIMEOUT_MS = 15_000
const DEFAULT_DOWNLOAD_READ_TIMEOUT_MS = 45_000

const NETWORK_ERROR_RE = /network|timeout|timed out|econnreset|enotfound|eai_again|offline|failed to fetch|network request failed|aborted|etimedout|econnrefused|socket|hang up|status code 5\d\d/i

function isNetworkLikeError(error) {
  if (!error) return false
  if (error.code === 'MEDIA_LIBRARY_NETWORK_UNAVAILABLE') return true
  if (error.name === 'AbortError') return true
  const message = String(error.message || error || '')
  return NETWORK_ERROR_RE.test(message)
}

function createMediaLibraryNetworkUnavailableError(
  message = 'media library sync stopped after repeated network failures',
) {
  const error = new Error(message)
  error.code = 'MEDIA_LIBRARY_NETWORK_UNAVAILABLE'
  return error
}

function createNetworkFailureGuard({ consecutiveFailureLimit = DEFAULT_CONSECUTIVE_FAILURE_LIMIT } = {}) {
  let consecutive = 0
  const limit = Math.max(1, Number(consecutiveFailureLimit) || DEFAULT_CONSECUTIVE_FAILURE_LIMIT)

  return {
    recordSuccess() {
      consecutive = 0
    },
    recordFailure(error) {
      if (!isNetworkLikeError(error)) {
        consecutive = 0
        return
      }
      consecutive += 1
      if (consecutive >= limit) {
        throw createMediaLibraryNetworkUnavailableError()
      }
    },
  }
}

function createTimeoutSignal(timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, Math.max(1, Number(timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS))
  timer.unref?.()
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer)
    },
  }
}

module.exports = {
  DEFAULT_CONSECUTIVE_FAILURE_LIMIT,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_DOWNLOAD_CONNECTION_TIMEOUT_MS,
  DEFAULT_DOWNLOAD_READ_TIMEOUT_MS,
  isNetworkLikeError,
  createMediaLibraryNetworkUnavailableError,
  createNetworkFailureGuard,
  createTimeoutSignal,
}
