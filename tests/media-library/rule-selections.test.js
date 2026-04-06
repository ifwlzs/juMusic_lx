const test = require('node:test')
const assert = require('node:assert/strict')

const { removeImportSelection } = require('../../src/core/mediaLibrary/ruleSelections.js')

test('removeImportSelection removes selected directory or track from a rule draft', () => {
  const draft = {
    ruleId: 'rule_1',
    connectionId: 'conn_1',
    name: 'Rule',
    mode: 'merged',
    directories: [{
      selectionId: 'dir_1',
      kind: 'directory',
      pathOrUri: '/Albums',
      displayName: 'Albums',
    }],
    tracks: [{
      selectionId: 'track_1',
      kind: 'track',
      pathOrUri: '/Singles/lone.mp3',
      displayName: 'lone.mp3',
    }],
  }

  const afterDirectoryRemove = removeImportSelection(draft, 'dir_1')
  assert.deepEqual(afterDirectoryRemove.directories, [])
  assert.equal(afterDirectoryRemove.tracks.length, 1)

  const afterTrackRemove = removeImportSelection(draft, 'track_1')
  assert.equal(afterTrackRemove.directories.length, 1)
  assert.deepEqual(afterTrackRemove.tracks, [])
})
