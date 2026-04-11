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
