const test = require('node:test')
const assert = require('node:assert/strict')

const { createLocalProvider } = require('../../src/core/mediaLibrary/providers/local.js')
const { normalizeImportSelection } = require('../../src/core/mediaLibrary/browse.js')

const createLocalFixture = () => {
  const readDir = async(path) => {
    switch (path) {
      case '/Music':
        return [
          { name: 'Albums', path: '/Music/Albums', isDirectory: true },
          { name: 'Singles', path: '/Music/Singles', isDirectory: true },
          { name: 'cover.jpg', path: '/Music/cover.jpg', isDirectory: false, size: 10, lastModified: 1 },
        ]
      case '/Music/Albums':
        return [
          { name: 'song.mp3', path: '/Music/Albums/song.mp3', isDirectory: false, size: 100, lastModified: 2 },
          { name: 'art.png', path: '/Music/Albums/art.png', isDirectory: false, size: 50, lastModified: 2 },
        ]
      case '/Music/Singles':
        return [
          { name: 'lone.mp3', path: '/Music/Singles/lone.mp3', isDirectory: false, size: 120, lastModified: 3 },
        ]
      default:
        return []
    }
  }

  const readMetadata = async(filePath) => ({
    name: filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || '',
    singer: '',
    albumName: '',
    interval: 180,
  })

  return { readDir, readMetadata }
}

test('normalizeImportSelection dedupes tracks covered by selected directories', () => {
  const selection = normalizeImportSelection({
    directories: [
      { selectionId: 'dir_1', kind: 'directory', pathOrUri: '/Music/Albums', displayName: 'Albums' },
      { selectionId: 'dir_1_dup', kind: 'directory', pathOrUri: '/Music/Albums', displayName: 'Albums' },
    ],
    tracks: [
      { selectionId: 'track_1', kind: 'track', pathOrUri: '/Music/Albums/song.mp3', displayName: 'song.mp3' },
      { selectionId: 'track_2', kind: 'track', pathOrUri: '/Music/Singles/lone.mp3', displayName: 'lone.mp3' },
    ],
  })

  assert.deepEqual(selection.directories.map(item => item.pathOrUri), ['/Music/Albums'])
  assert.deepEqual(selection.tracks.map(item => item.pathOrUri), ['/Music/Singles/lone.mp3'])
})

test('local provider browseConnection returns directories and audio files only', async() => {
  const fixture = createLocalFixture()
  const provider = createLocalProvider(fixture)

  const nodes = await provider.browseConnection({
    connectionId: 'c1',
    providerType: 'local',
    rootPathOrUri: '/Music',
  }, '/Music')

  assert.deepEqual(nodes.map(item => item.name), ['Albums', 'Singles'])
  assert.deepEqual(nodes.map(item => item.kind), ['directory', 'directory'])
})

test('local provider scanSelection merges directories and explicit tracks without duplicates', async() => {
  const fixture = createLocalFixture()
  const provider = createLocalProvider(fixture)

  const selection = normalizeImportSelection({
    directories: [
      { selectionId: 'dir_1', kind: 'directory', pathOrUri: '/Music/Albums', displayName: 'Albums' },
    ],
    tracks: [
      { selectionId: 'track_1', kind: 'track', pathOrUri: '/Music/Albums/song.mp3', displayName: 'song.mp3' },
      { selectionId: 'track_2', kind: 'track', pathOrUri: '/Music/Singles/lone.mp3', displayName: 'lone.mp3' },
    ],
  })

  const result = await provider.scanSelection({
    connectionId: 'c1',
    providerType: 'local',
    rootPathOrUri: '/Music',
  }, selection)

  assert.deepEqual(result.items.map(item => item.pathOrUri), [
    '/Music/Albums/song.mp3',
    '/Music/Singles/lone.mp3',
  ])
  assert.equal(result.summary.success, 2)
})
