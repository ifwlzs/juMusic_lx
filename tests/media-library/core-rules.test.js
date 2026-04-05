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

test('shouldMergeSongs 在标题或歌手缺失时保持保守不合并', () => {
  assert.equal(shouldMergeSongs(
    { title: '', artist: '周杰伦', durationSec: 299 },
    { title: '', artist: '周杰伦', durationSec: 300 },
  ), false)

  assert.equal(shouldMergeSongs(
    { title: '七里香', artist: '', durationSec: 299 },
    { title: '七里香', artist: '', durationSec: 300 },
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

test('buildAggregateSongs 对同一逻辑聚合在不同输入顺序下生成稳定 aggregateSongId', () => {
  const firstOrder = buildAggregateSongs([
    {
      sourceItemId: 'local_1',
      providerType: 'local',
      title: '七里香',
      artist: '周杰伦',
      durationSec: 300,
    },
    {
      sourceItemId: 'dav_1',
      providerType: 'webdav',
      title: '七里香 ',
      artist: '周杰伦',
      durationSec: 299,
    },
  ])
  const secondOrder = buildAggregateSongs([
    {
      sourceItemId: 'dav_1',
      providerType: 'webdav',
      title: '七里香 ',
      artist: '周杰伦',
      durationSec: 299,
    },
    {
      sourceItemId: 'local_1',
      providerType: 'local',
      title: '七里香',
      artist: '周杰伦',
      durationSec: 300,
    },
  ])

  assert.equal(firstOrder.length, 1)
  assert.equal(secondOrder.length, 1)
  assert.equal(firstOrder[0].aggregateSongId, secondOrder[0].aggregateSongId)
})

test('buildAggregateSongs 对多项重叠时长输入也保持稳定分组和 aggregateSongId', () => {
  const firstOrder = buildAggregateSongs([
    {
      sourceItemId: 'a_300',
      providerType: 'local',
      title: '七里香',
      artist: '周杰伦',
      durationSec: 300,
    },
    {
      sourceItemId: 'a_302',
      providerType: 'webdav',
      title: '七里香',
      artist: '周杰伦',
      durationSec: 302,
    },
    {
      sourceItemId: 'a_304',
      providerType: 'smb',
      title: '七里香',
      artist: '周杰伦',
      durationSec: 304,
    },
  ])
  const secondOrder = buildAggregateSongs([
    {
      sourceItemId: 'a_304',
      providerType: 'smb',
      title: '七里香',
      artist: '周杰伦',
      durationSec: 304,
    },
    {
      sourceItemId: 'a_300',
      providerType: 'local',
      title: '七里香',
      artist: '周杰伦',
      durationSec: 300,
    },
    {
      sourceItemId: 'a_302',
      providerType: 'webdav',
      title: '七里香',
      artist: '周杰伦',
      durationSec: 302,
    },
  ])

  assert.deepEqual(
    firstOrder.map(song => ({ id: song.aggregateSongId, count: song.sourceCount })),
    secondOrder.map(song => ({ id: song.aggregateSongId, count: song.sourceCount })),
  )
})

test('buildAggregateSongs 在稳定代表项未变时保持 aggregateSongId 不变', () => {
  const baseSongs = buildAggregateSongs([
    {
      sourceItemId: 'local_1',
      providerType: 'local',
      title: '七里香',
      artist: '周杰伦',
      durationSec: 300,
    },
  ])
  const expandedSongs = buildAggregateSongs([
    {
      sourceItemId: 'local_1',
      providerType: 'local',
      title: '七里香',
      artist: '周杰伦',
      durationSec: 300,
    },
    {
      sourceItemId: 'dav_1',
      providerType: 'webdav',
      title: '七里香 ',
      artist: '周杰伦',
      durationSec: 299,
    },
  ])

  assert.equal(baseSongs.length, 1)
  assert.equal(expandedSongs.length, 1)
  assert.equal(expandedSongs[0].preferredSourceItemId, 'local_1')
  assert.equal(expandedSongs[0].aggregateSongId, baseSongs[0].aggregateSongId)
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

test('播放进度的大幅前跳按 seek 处理而不是累计为已听时长', () => {
  const session = createPlaySession({ durationSec: 300 })
  updatePlaySession(session, { currentSec: 20, isPlaying: true })
  updatePlaySession(session, { currentSec: 220, isPlaying: true })

  assert.equal(session.incrementCount, 0)
  assert.equal(session.shouldIncrementPlayCount, false)
})

test('显式标记 seek 时，前跳整整三分之一也不计入播放次数', () => {
  const session = createPlaySession({ durationSec: 300 })
  updatePlaySession(session, { currentSec: 100, isPlaying: true, isSeek: true })

  assert.equal(session.incrementCount, 0)
  assert.equal(session.shouldIncrementPlayCount, false)
  assert.equal(session.listenedSec, 0)
})

test('显式标记 seek 时，较小的手动跳转也不累计已听时长', () => {
  const session = createPlaySession({ durationSec: 90 })
  updatePlaySession(session, { currentSec: 10, isPlaying: true })
  updatePlaySession(session, { currentSec: 30, isPlaying: true, isSeek: true })

  assert.equal(session.incrementCount, 0)
  assert.equal(session.shouldIncrementPlayCount, false)
  assert.equal(session.listenedSec, 10)
})

test('暂停时的显式 seek 在恢复播放后不会把跳过区间记入已听时长', () => {
  const session = createPlaySession({ durationSec: 300 })
  updatePlaySession(session, { currentSec: 40, isPlaying: true })
  updatePlaySession(session, { currentSec: 90, isPlaying: false, isSeek: true })
  updatePlaySession(session, { currentSec: 120, isPlaying: true })

  assert.equal(session.listenedSec, 70)
  assert.equal(session.incrementCount, 0)
  assert.equal(session.shouldIncrementPlayCount, false)
})

test('normalizeText 清理空格并统一小写', () => {
  assert.equal(normalizeText('  Jay Chou  '), 'jay chou')
})
