const test = require('node:test')
const assert = require('node:assert/strict')
const { createPlaybackHarness, deferred } = require('./helpers/playbackHarness')

// 中文注释：验收实际原生当前轨道、URL、应用选曲与清理后的队列，而非只检查某个 API 被调用。
const assertPlaying = (h, id) => {
  const track = h.native.queue[h.native.index]
  assert.equal(h.state.playMusicInfo.musicInfo.id, id)
  assert.equal(track?.musicId, id, '原生当前轨道必须与应用选曲一致')
  assert.equal(track?.url, h.urlFor(id))
  assert.deepEqual(h.native.queue.map(item => item.musicId), [id])
  assert.equal(h.globals.lx.playerTrackId, track.id)
  assert.equal(h.native.state, 'Playing')
  assert.equal(h.native.rate, 1.5)
}

test('WebDAV 缓存命中时手动下一首实际播放 B', async() => {
  const h = await createPlaybackHarness()
  await h.core.playNext()
  await h.advance()
  assertPlaying(h, 'B')
  assert.equal(h.calls.some(call => call.name === 'download'), false)
})

test('WebDAV 自动连续播放 A → B → C，每次选中实际文件', async() => {
  const h = await createPlaybackHarness()
  await h.finish()
  assertPlaying(h, 'B')
  await h.finish()
  assertPlaying(h, 'C')
})

test('WebDAV 手动上一首从 A 循环到 C', async() => {
  const h = await createPlaybackHarness()
  await h.core.playPrev()
  await h.advance()
  assertPlaying(h, 'C')
})

test('WebDAV 下一首等待下载时停止旧曲，完成后播放 B', async() => {
  const h = await createPlaybackHarness({ cached: ['A', 'C'] })
  const download = h.holdDownload('B')
  await h.core.playNext()
  await h.advance()
  assert.notEqual(h.native.state, 'Playing', '等待 B 的文件时不能继续播放 A')
  download.resolve()
  await h.advance()
  assertPlaying(h, 'B')
})

test('快速跳过下载中的 B，迟到的 B 不会覆盖 C', async() => {
  const h = await createPlaybackHarness({ cached: ['A', 'C'] })
  const download = h.holdDownload('B')
  await h.core.playNext()
  await h.advance()
  await h.core.playNext()
  await h.advance()
  download.resolve()
  await h.advance()
  assertPlaying(h, 'C')
  assert.equal(h.calls.some(call => call.name === 'play' && call.args[0] === 'B'), false)
})

test('曲终清零不向旧曲或新曲发送 seek(0)', async() => {
  const h = await createPlaybackHarness()
  await h.finish()
  assert.deepEqual(h.calls.filter(call => call.name === 'seek'), [], '曲终显示清零不能重播仍在原生队列的歌曲')
})

test('同曲刷新请求乱序返回时，只使用最新资源', async() => {
  const h = await createPlaybackHarness({ playing: false })
  const old = deferred()
  const latest = deferred()
  let count = 0
  // 中文注释：模块已加载，通过原导出对象替换外部取链边界，保留真实请求归属逻辑。
  const musicApi = h.load('src/core/music/index.ts')
  musicApi.getMusicUrl = () => (++count === 1 ? old.promise : latest.promise)
  h.core.setMusicUrl(h.songs[0], true)
  await h.flush()
  h.core.setMusicUrl(h.songs[0], true)
  await h.flush()
  old.resolve('file:///old-A.mp3')
  await h.advance()
  assert.equal(h.calls.some(call => call.name === 'play'), false, '旧请求不能提前起播或清除新请求的加载状态')
  assert.notEqual(h.globals.lx.gettingUrlId, '')
  latest.resolve(h.urlFor('A'))
  await h.advance()
  assertPlaying(h, 'A')
})

test('原生加入 B 期间选择 C，B 不会被迟到任务播放', async() => {
  const h = await createPlaybackHarness({ playing: false })
  const adding = deferred()
  let blocked = false
  h.setNativeHook(async(name, tracks) => {
    if (name === 'add' && tracks[0]?.musicId === 'B' && !blocked) { blocked = true; await adding.promise }
  })
  await h.core.playNext()
  await h.advance()
  assert.equal(blocked, true)
  await h.core.playNext()
  adding.resolve()
  await h.advance()
  assertPlaying(h, 'C')
  assert.equal(h.calls.some(call => call.name === 'play' && call.args[0] === 'B'), false)
})

test('WebDAV 自动下一首等待下载时，迟到的旧曲结束事件不会跳过 B', async() => {
  const h = await createPlaybackHarness({ cached: ['A', 'C'] })
  const download = h.holdDownload('B')
  await h.finish()
  await h.emitNative('PlaybackQueueEnded', { track: 0, position: 180 })
  await h.advance()
  assert.equal(h.state.playMusicInfo.musicInfo.id, 'B')
  download.resolve()
  await h.advance()
  assertPlaying(h, 'B')
})

test('下载期间停止播放，文件稍后完成也不会自动开播', async() => {
  const h = await createPlaybackHarness({ cached: ['A', 'C'] })
  const download = h.holdDownload('B')
  await h.core.playNext()
  await h.advance()
  await h.core.stop()
  await h.advance()
  download.resolve()
  await h.advance()
  assert.equal(h.calls.some(call => call.name === 'play'), false)
  assert.equal(h.globals.lx.gettingUrlId, '')
})

test('下载期间停止后再播放，恢复选中的 B 而不是原生残留的 A', async() => {
  const h = await createPlaybackHarness({ cached: ['A', 'C'] })
  const download = h.holdDownload('B')
  await h.core.playNext()
  await h.advance()
  await h.core.stop()
  await h.advance()
  download.resolve()
  await h.advance()
  h.core.play()
  await h.advance()
  assertPlaying(h, 'B')
})

test('下载下一首期间点击播放，不会恢复原生残留的旧曲', async() => {
  const h = await createPlaybackHarness({ cached: ['A', 'C'] })
  const download = h.holdDownload('B')
  await h.core.playNext()
  await h.advance()
  h.core.play()
  await h.advance()
  assert.equal(h.calls.some(call => call.name === 'play' && call.args[0] === 'A'), false)
  download.resolve()
  await h.advance()
  assertPlaying(h, 'B')
})

test('暂停旧曲的原生调用尚未返回时停止，不会再启动下一首请求', async() => {
  const h = await createPlaybackHarness()
  const pausing = deferred()
  let held = false
  h.setNativeHook(async name => {
    if (name === 'pause' && !held) { held = true; await pausing.promise }
  })
  const next = h.core.playNext()
  await h.flush()
  await h.core.stop()
  await h.advance()
  pausing.resolve()
  await next
  await h.advance()
  assert.equal(h.calls.some(call => call.name === 'play'), false)
  assert.equal(h.calls.some(call => call.name === 'add'), false)
})

test('原生切换失败不会伪造当前轨道，也不阻塞下一次切歌', async() => {
  const h = await createPlaybackHarness()
  let shouldFail = true
  h.setNativeHook(async name => {
    if (name === 'skip' && shouldFail) { shouldFail = false; throw new Error('native skip failed') }
  })
  await h.core.playNext()
  await h.advance()
  assert.equal(h.globals.lx.playerTrackId, h.native.queue[h.native.index].id)
  assert.equal(h.native.state, 'Paused')
  await h.core.playNext()
  await h.advance()
  assertPlaying(h, 'C')
})

test('B 正在播放时收到迟到的 A 曲终事件，不会再次切歌', async() => {
  const h = await createPlaybackHarness()
  await h.core.playNext()
  await h.advance()
  await h.emitNative('PlaybackQueueEnded', { track: 0, position: 180 })
  await h.advance()
  assertPlaying(h, 'B')
})

test('点击播放后立即暂停，迟到的轨道核对不会覆盖暂停指令', async() => {
  const h = await createPlaybackHarness({ playing: false })
  h.core.play()
  await h.core.pause()
  await h.advance()
  assert.equal(h.native.state, 'Paused')
  assert.equal(h.calls.some(call => call.name === 'play'), false)
})
