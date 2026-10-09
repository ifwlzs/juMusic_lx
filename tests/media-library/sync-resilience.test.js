const test = require('node:test')
const assert = require('node:assert/strict')

const {
  isNetworkLikeError,
  createNetworkFailureGuard,
  createMediaLibraryNetworkUnavailableError,
  createTimeoutSignal,
} = require('../../src/core/mediaLibrary/syncResilience.js')

test('isNetworkLikeError recognizes timeout abort and fetch failures', () => {
  assert.equal(isNetworkLikeError(new Error('webdav request PROPFIND timed out')), true)
  assert.equal(isNetworkLikeError({ name: 'AbortError', message: 'The operation was aborted' }), true)
  assert.equal(isNetworkLikeError(new Error('Network request failed')), true)
  assert.equal(isNetworkLikeError(new Error('metadata empty')), false)
})

test('createNetworkFailureGuard trips after consecutive network failures', () => {
  const guard = createNetworkFailureGuard({ consecutiveFailureLimit: 3 })
  guard.recordFailure(new Error('timed out'))
  guard.recordFailure(new Error('network request failed'))
  assert.throws(
    () => guard.recordFailure(new Error('failed to fetch')),
    error => error?.code === 'MEDIA_LIBRARY_NETWORK_UNAVAILABLE',
  )
})

test('createNetworkFailureGuard resets after a success', () => {
  const guard = createNetworkFailureGuard({ consecutiveFailureLimit: 3 })
  guard.recordFailure(new Error('timed out'))
  guard.recordFailure(new Error('timed out'))
  guard.recordSuccess()
  guard.recordFailure(new Error('timed out'))
  guard.recordFailure(new Error('timed out'))
  assert.doesNotThrow(() => guard.recordFailure(new Error('metadata empty')))
})

test('createTimeoutSignal aborts after the timeout', async() => {
  const { signal, clear } = createTimeoutSignal(20)
  try {
    await new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
    assert.fail('expected abort')
  } catch (error) {
    assert.equal(error.name, 'AbortError')
  } finally {
    clear()
  }
})

test('createMediaLibraryNetworkUnavailableError uses a stable code', () => {
  const error = createMediaLibraryNetworkUnavailableError()
  assert.equal(error.code, 'MEDIA_LIBRARY_NETWORK_UNAVAILABLE')
})
