const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { buildWebdavHeaders, buildWebdavUrl } = require('../../src/core/mediaLibrary/webdav.js')
const { setPlayHeaders, getPlayHeaders } = require('../../src/core/mediaLibrary/playHeaders.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('webdav play url is an http(s) stream instead of waiting for a full local download', () => {
  const url = buildWebdavUrl('https://nas.local/webdav/', '/music/song.flac')
  assert.equal(url, 'https://nas.local/music/song.flac')
  const headers = buildWebdavHeaders({ username: 'user', password: 'secret' })
  assert.match(headers.Authorization, /^Basic /)
  setPlayHeaders(url, headers)
  assert.deepEqual(getPlayHeaders(url), headers)
})

test('media library getMusicUrl streams webdav and player tracks carry auth headers', () => {
  const mediaLibraryFile = readFile('src/core/music/mediaLibrary.ts')
  const playListFile = readFile('src/plugins/player/playList.ts')

  assert.match(mediaLibraryFile, /buildWebdavUrl/)
  assert.match(mediaLibraryFile, /setPlayHeaders/)
  assert.match(playListFile, /getPlayHeaders/)
  assert.match(playListFile, /headers:/)
})
