const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('shouldWaitForRemoteSeek waits when the target time is ahead of the buffered remote range', () => {
  const { shouldWaitForRemoteSeek } = require('../../src/core/mediaLibrary/pendingSeek.js')

  assert.equal(shouldWaitForRemoteSeek({
    musicInfo: {
      source: 'onedrive',
      meta: {
        mediaLibrary: {
          sourceItemId: 'source_1',
        },
      },
    },
    targetTime: 120,
    bufferedPosition: 24,
    duration: 240,
  }), true)

  assert.equal(shouldWaitForRemoteSeek({
    musicInfo: {
      source: 'local',
      meta: {},
    },
    targetTime: 120,
    bufferedPosition: 24,
    duration: 240,
  }), false)
})

test('resolvePendingSeek advances immediately in UI and only commits when buffered data catches up', () => {
  const { resolvePendingSeekState } = require('../../src/core/mediaLibrary/pendingSeek.js')

  assert.deepEqual(resolvePendingSeekState({
    pendingSeekTime: 120,
    bufferedPosition: 24,
  }), {
    type: 'wait',
    targetTime: 120,
  })

  assert.deepEqual(resolvePendingSeekState({
    pendingSeekTime: 120,
    bufferedPosition: 121,
  }), {
    type: 'commit',
    targetTime: 120,
  })
})

test('resolvePendingSeek falls back to the latest buffered position after waiting too long', () => {
  const { resolvePendingSeekState } = require('../../src/core/mediaLibrary/pendingSeek.js')

  assert.deepEqual(resolvePendingSeekState({
    pendingSeekTime: 120,
    bufferedPosition: 36,
    waitStartedAt: 1_000,
    now: 13_500,
    maxWaitMs: 10_000,
  }), {
    type: 'fallback',
    targetTime: 36,
  })
})

test('play progress integration tracks pending seek state and checks buffered position before seeking', () => {
  const playProgressFile = readFile('src/core/init/player/playProgress.ts')
  const playerIndexFile = readFile('src/plugins/player/index.ts')
  const playerUtilsFile = readFile('src/plugins/player/utils.ts')

  assert.match(playProgressFile, /pendingSeekTime/)
  assert.match(playProgressFile, /getBufferedPosition/)
  assert.match(playProgressFile, /shouldWaitForRemoteSeek/)
  assert.match(playProgressFile, /resolvePendingSeekState/)
  assert.match(playerIndexFile, /getBufferedPosition/)
  assert.match(playerUtilsFile, /TrackPlayer\.getBufferedPosition\(\)/)
})
