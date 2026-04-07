const test = require('node:test')
const assert = require('node:assert/strict')

const { createOneDriveProvider } = require('../../src/core/mediaLibrary/providers/onedrive.js')
const { createWebdavProvider } = require('../../src/core/mediaLibrary/providers/webdav.js')
const { createSmbProvider } = require('../../src/core/mediaLibrary/providers/smb.js')

test('remote providers expose streamEnumerateSelection in addition to enumerateSelection hydrateCandidate and downloadToCache', async() => {
  const provider = createOneDriveProvider({
    async listChildren() { return { items: [], nextLink: null } },
    async getItemByPath() { return null },
    async downloadFile() {},
    async readMetadata() { return null },
  })

  assert.equal(typeof provider.streamEnumerateSelection, 'function')
  assert.equal(typeof provider.enumerateSelection, 'function')
  assert.equal(typeof provider.hydrateCandidate, 'function')
  assert.equal(typeof provider.downloadToCache, 'function')
})

test('remote providers expose enumerateSelection hydrateCandidate and downloadToCache', async() => {
  const oneDriveProvider = createOneDriveProvider({
    async listChildren() {
      return { items: [], nextLink: null }
    },
    async getItemByPath() {
      return null
    },
    async downloadFile() {},
    async readMetadata() {
      return null
    },
  })
  const webdavProvider = createWebdavProvider({
    async request() {
      return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" />`
    },
    async downloadFile() {},
    async readMetadata() {
      return null
    },
  })
  const smbProvider = createSmbProvider({
    async listDirectory() {
      return []
    },
    async readMetadata() {
      return null
    },
    async downloadFile() {},
  })

  for (const provider of [oneDriveProvider, webdavProvider, smbProvider]) {
    assert.equal(typeof provider.enumerateSelection, 'function')
    assert.equal(typeof provider.hydrateCandidate, 'function')
    assert.equal(typeof provider.downloadToCache, 'function')
  }
})
