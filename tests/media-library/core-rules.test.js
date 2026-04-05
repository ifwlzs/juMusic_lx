const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizeText } = require('../../src/core/mediaLibrary/normalize.js')
const { shouldMergeSongs, buildAggregateSongs } = require('../../src/core/mediaLibrary/dedupe.js')
const { buildLocalVersionToken, didVersionChange } = require('../../src/core/mediaLibrary/versionToken.js')
const { createPlaySession, updatePlaySession } = require('../../src/core/mediaLibrary/playStats.js')

test('shouldMergeSongs 仅合并标题+歌手+时长容差内的歌曲', () => {
  assert.equal(shouldMergeSongs(
    { title: '七里香', artist: '周杰伦', durationSec: 299 },
    { title: '七里香 ', artist: '周杰伦', durationSec: 300 },
  ), true)

  assert.equal(shouldMergeSongs(
    { title: '七里香 (Live)', artist: '周杰伦', durationSec: 336 },
    { title: '七里香', artist: '周杰伦', durationSec: 300 },
  ), false)
})

test('buildLocalVersionToken 使用路径、大小和修改时间构造版本', () => {
  assert.equal(
    buildLocalVersionToken({
      pathOrUri: '/music/qilixiang.mp3',
      fileSize: 123,
      modifiedTime: 1700000000000,
    }),
    '/music/qilixiang.mp3__123__1700000000000',
  )
  assert.equal(didVersionChange('v1', 'v2'), true)
})

test('buildAggregateSongs 默认生成去重后的总曲库视图', () => {
  const songs = buildAggregateSongs([
    {
      sourceItemId: 'local_1',
      providerType: 'local',
      title: '七里香',
      artist: '周杰伦',
      album: '七里香',
      durationSec: 300,
    },
    {
      sourceItemId: 'dav_1',
      providerType: 'webdav',
      title: '七里香 ',
      artist: '周杰伦',
      album: '七里香',
      durationSec: 299,
    },
    {
      sourceItemId: 'smb_1',
      providerType: 'smb',
      title: '夜曲',
      artist: '周杰伦',
      album: '十一月的萧邦',
      durationSec: 244,
    },
  ])

  assert.equal(songs.length, 2)
  assert.equal(songs[0].sourceCount, 2)
  assert.equal(songs[0].preferredSourceItemId, 'local_1')
})

test('播放三分之一后只计一次完整播放', () => {
  const session = createPlaySession({ durationSec: 300 })
  updatePlaySession(session, { currentSec: 80, isPlaying: true })
  assert.equal(session.shouldIncrementPlayCount, false)

  updatePlaySession(session, { currentSec: 120, isPlaying: true })
  assert.equal(session.shouldIncrementPlayCount, true)

  updatePlaySession(session, { currentSec: 220, isPlaying: true })
  assert.equal(session.incrementCount, 1)
})

test('normalizeText 清理空格并统一小写', () => {
  assert.equal(normalizeText('  Jay Chou  '), 'jay chou')
})
