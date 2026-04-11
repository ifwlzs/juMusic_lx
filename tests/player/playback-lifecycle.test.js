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
