const test = require('node:test')
const assert = require('node:assert/strict')

const { classifyHydrationResult } = require('../../src/core/mediaLibrary/hydrationPolicy.js')
const { createReadyBatchCommitter } = require('../../src/core/mediaLibrary/batchCommitter.js')

test('classifyHydrationResult returns ready when title artist duration are complete', () => {
  const result = classifyHydrationResult({
    attempts: 1,
    metadata: {
      title: 'Song',
      artist: 'Singer',
      album: 'Album',
      durationSec: 123,
    },
    fallbackTitle: 'song.mp3',
  })

  assert.deepEqual(result, {
    state: 'ready',
    title: 'Song',
    artist: 'Singer',
    album: 'Album',
    durationSec: 123,
  })
})

test('classifyHydrationResult returns hydrating when metadata is still incomplete before retry cap', () => {
  const result = classifyHydrationResult({
    attempts: 2,
    metadata: {
      title: 'Song',
      artist: '',
      durationSec: 0,
    },
    fallbackTitle: 'song.mp3',
  })

  assert.deepEqual(result, { state: 'hydrating' })
})

test('classifyHydrationResult returns degraded after 3 failed rounds', () => {
  const result = classifyHydrationResult({
    attempts: 3,
    metadata: {
      title: '',
      artist: '',
      durationSec: 0,
    },
    fallbackTitle: 'song.mp3',
  })

  assert.deepEqual(result, {
    state: 'degraded',
    title: 'song',
    artist: '',
    album: '',
    durationSec: 0,
  })
})

test('createReadyBatchCommitter flushes immediately at max batch size', async() => {
  const flushed = []
  const scheduled = []
  const cancelled = []
  const committer = createReadyBatchCommitter({
    maxBatchSize: 3,
    maxDelayMs: 2000,
    schedule(delay, run) {
      const handle = { delay, run }
      scheduled.push(handle)
      return handle
    },
    cancel(handle) {
      cancelled.push(handle)
    },
    async onFlush(batch) {
      flushed.push(batch)
    },
  })

  await committer.push({ id: 1 })
  await committer.push({ id: 2 })
  await committer.push({ id: 3 })

  assert.equal(scheduled.length, 1)
  assert.equal(cancelled.length, 1)
  assert.deepEqual(flushed, [[{ id: 1 }, { id: 2 }, { id: 3 }]])
})

test('createReadyBatchCommitter flushes pending items after scheduled delay', async() => {
  const flushed = []
  const scheduled = []
  const committer = createReadyBatchCommitter({
    maxBatchSize: 10,
    maxDelayMs: 2000,
    schedule(delay, run) {
      const handle = { delay, run }
      scheduled.push(handle)
      return handle
    },
    cancel() {},
    async onFlush(batch) {
      flushed.push(batch)
    },
  })

  await committer.push({ id: 1 })
  await committer.push({ id: 2 })

  assert.equal(flushed.length, 0)
  assert.equal(scheduled.length, 1)

  await scheduled[0].run()

  assert.deepEqual(flushed, [[{ id: 1 }, { id: 2 }]])
})
