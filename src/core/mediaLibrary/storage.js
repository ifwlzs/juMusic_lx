const storage = require('../../plugins/storage')
const { storageDataPrefix } = require('../../config/constant')
const { createKeyBuilder, createMediaLibraryRepository } = require('./repository.js')

const mediaLibraryKeys = createKeyBuilder(storageDataPrefix.mediaLibrary)

const mediaLibraryRepository = createMediaLibraryRepository({
  get: storage.getData,
  set: storage.saveData,
  remove: storage.removeData,
}, mediaLibraryKeys)

module.exports = {
  mediaLibraryKeys,
  mediaLibraryRepository,
}
