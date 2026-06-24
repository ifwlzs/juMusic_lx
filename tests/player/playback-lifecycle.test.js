const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('player update options stop playback when the Android app is closed', () => {
  const playerUtilsFile = readFile('src/plugins/player/utils.ts')

  assert.match(playerUtilsFile, /stopWithApp:\s*true/)
  assert.doesNotMatch(playerUtilsFile, /\/\/\s*stopWithApp:\s*true/)
})

test('playback service keeps decisive play states even while a transient track or URL resolution is active', () => {
  const serviceFile = readFile('src/plugins/player/service.ts')

  assert.doesNotMatch(serviceFile, /if\s*\(\s*global\.lx\.gettingUrlId\s*\|\|\s*isTempId\(\)\s*\)\s*return/)
  assert.match(serviceFile, /const shouldIgnoreTransientState =[\s\S]*TPState\.Playing[\s\S]*TPState\.Paused[\s\S]*TPState\.Stopped/)
  assert.match(serviceFile, /if\s*\(\s*shouldIgnoreTransientState\s*\)\s*return/)
})

test('player stop does not advance to the next track after stopping playback', () => {
  const playerUtilsFile = readFile('src/plugins/player/utils.ts')
  const playerCoreFile = readFile('src/core/player/player.ts')
  const setStopBlock = playerUtilsFile.slice(
    playerUtilsFile.indexOf('export const setStop = async() => {'),
    playerUtilsFile.indexOf('export const setLoop = async'),
  )

  assert.match(setStopBlock, /export const setStop = async\(\) => \{\s*[\s\S]*TrackPlayer\.stop\(\)/)
  assert.doesNotMatch(setStopBlock, /skipToNext\(\)/)
  assert.match(playerCoreFile, /export const stop = async\(\) => \{\s*[\s\S]*await setStop\(\)/)
})

test('player reapplies configured playback rate after loading a concrete track', () => {
  const playListFile = readFile('src/plugins/player/playList.ts')
  const handlePlayMusicBlock = playListFile.slice(
    playListFile.indexOf('const handlePlayMusic = async'),
    playListFile.indexOf('let playPromise = Promise.resolve()'),
  )

  assert.match(playListFile, /settingState\.setting\['player\.playbackRate'\]/)
  assert.match(handlePlayMusicBlock, /TrackPlayer\.skip\(/)
  assert.match(handlePlayMusicBlock, /TrackPlayer\.setRate\(\s*settingState\.setting\['player\.playbackRate'\]\s*\)/)
  assert.ok(
    handlePlayMusicBlock.indexOf("TrackPlayer.setRate(settingState.setting['player.playbackRate'])") >
      handlePlayMusicBlock.indexOf('TrackPlayer.skip('),
    '倍速应在切到真实资源后重新应用，避免 stop/skip 或远端缓存加载把底层 rate 重置为 1',
  )
})


// 中文注释：锁定依赖安装后的 native 补丁契约，避免 Android audio offload 再次绕过倍速输出能力检查。
test('dependency install patches TrackPlayer audio offload to require playback-speed support', () => {
  const packageJson = JSON.parse(readFile('package.json'))
  const dependencyPatchFile = readFile('dependencies-patch.js')

  assert.equal(typeof packageJson.scripts.postinstall, 'string')
  assert.match(packageJson.scripts.postinstall, /node\s+dependencies-patch\.js/)
  assert.match(dependencyPatchFile, /react-native-track-player[\s\S]*MusicManager\.java/)
  assert.match(dependencyPatchFile, /setIsSpeedChangeSupportRequired\(true\)/)
  assert.match(
    dependencyPatchFile,
    /倍速[\s\S]*(音频卸载|offload)[\s\S]*提前结束|提前结束[\s\S]*(音频卸载|offload)[\s\S]*倍速/,
    '依赖补丁必须说明 audio offload 与非 1x 倍速可能导致媒体时间提前结束的原因',
  )

  const { applyTextPatch, patches } = require(path.resolve(__dirname, '../../dependencies-patch.js'))
  const trackPlayerPatch = patches.find(patch => /react-native-track-player[\\/]android[\\/]src[\\/]main[\\/]java[\\/]com[\\/]guichaguri[\\/]trackplayer[\\/]service[\\/]MusicManager\.java$/.test(patch.filePath))
  assert.ok(trackPlayerPatch, 'postinstall 应包含 TrackPlayer MusicManager.java 补丁')

  const source = `                .setIsGaplessSupportRequired(true)
                .build())`
  const patched = applyTextPatch(source, trackPlayerPatch)
  assert.match(patched, /setIsGaplessSupportRequired\(true\)[\s\S]*setIsSpeedChangeSupportRequired\(true\)[\s\S]*\.build\(\)/)
  assert.equal(applyTextPatch(patched, trackPlayerPatch), patched, '依赖补丁必须可重复执行，避免 npm install 后重复插入')
})
