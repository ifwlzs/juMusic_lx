const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { getPlayerRetryStatusTextKey } = require('../../src/core/player/retryStatus.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('getPlayerRetryStatusTextKey keeps URL-expired wording for online sources', () => {
  assert.equal(getPlayerRetryStatusTextKey({
    source: 'kw',
    meta: {},
  }), 'player__refresh_url')
})

test('getPlayerRetryStatusTextKey uses media-library wording for remote library sources', () => {
  assert.equal(getPlayerRetryStatusTextKey({
    source: 'webdav',
    meta: {
      mediaLibrary: {
        providerType: 'webdav',
      },
    },
  }), 'player__retry_media_file')

  assert.equal(getPlayerRetryStatusTextKey({
    source: 'onedrive',
    meta: {
      mediaLibrary: {
        providerType: 'onedrive',
      },
    },
  }), 'player__retry_media_file')
})

test('player event uses the retry-status helper and language packs include remote media wording', () => {
  const playerEventFile = readFile('src/core/init/player/playerEvent.ts')
  const zhCn = readFile('src/lang/zh-cn.json')
  const enUs = readFile('src/lang/en-us.json')
  const zhTw = readFile('src/lang/zh-tw.json')

  assert.match(playerEventFile, /getPlayerRetryStatusTextKey/)
  assert.match(playerEventFile, /setStatusText\(global\.i18n\.t\(getPlayerRetryStatusTextKey\(/)
  assert.match(zhCn, /"player__retry_media_file"\s*:/)
  assert.match(enUs, /"player__retry_media_file"\s*:/)
  assert.match(zhTw, /"player__retry_media_file"\s*:/)
})
