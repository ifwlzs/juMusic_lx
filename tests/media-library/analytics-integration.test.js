const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { createAnalyticsRecorder } = require('../../src/core/mediaLibrary/analytics.js')

test('analytics recorder 在三分之一阈值时只增加一次播放次数', () => {
  const writes = []
  const recorder = createAnalyticsRecorder({
    save(stats) { writes.push(stats) },
  })

  recorder.startSession({ aggregateSongId: 'song_1', sourceItemId: 'item_1', durationSec: 300 })
  recorder.updateProgress(60, true)
  recorder.updateProgress(120, true)
  recorder.finishSession()

  assert.equal(writes.at(-1).playCount, 1)
  assert.equal(writes.at(-1).playDurationTotalSec >= 120, true)
})

test('analytics recorder 将显式 seek 视为跳转而不是累计播放时长', () => {
  const writes = []
  const recorder = createAnalyticsRecorder({
    save(stats) { writes.push(stats) },
  })

  recorder.startSession({ aggregateSongId: 'song_1', sourceItemId: 'item_1', durationSec: 300 })
  recorder.updateProgress(60, true)
  recorder.updateProgress(180, true, true)
  recorder.finishSession()

  assert.equal(writes.at(-1).playCount, 0)
  assert.equal(writes.at(-1).playDurationTotalSec, 60)
})

test('playProgress 初始化文件接入媒体库统计', () => {
  const content = fs.readFileSync(path.resolve(__dirname, '../../src/core/init/player/playProgress.ts'), 'utf8')
  assert.match(content, /mediaLibrary/i)
})
