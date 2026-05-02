const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

test('ods import tool exposes one entrypoint for music dimension and play history fact loading', () => {
  const script = read('scripts/import_jumusic_ods.ps1')

  assert.match(script, /load_music_info\.py/)
  assert.match(script, /load_play_history\.py/)
  assert.match(script, /MusicRoot/)
  assert.match(script, /PlayHistoryJson/)
  assert.match(script, /DbUrl/)
  assert.match(script, /SkipMusic/)
  assert.match(script, /SkipHistory/)
  assert.match(script, /python/)
})

