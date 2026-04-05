const { readDir } = require('../../utils/fs')
const { readMetadata } = require('../../utils/localMediaMetadata')
const { downloadSmbFile, listSmbDirectory } = require('../../utils/nativeModules/smb')
const { resolveConnectionCredential } = require('./credentials.js')
const { createProviderRegistry } = require('./providers/index.js')
const { createLocalProvider } = require('./providers/local.js')
const { createSmbProvider } = require('./providers/smb.js')
const { createWebdavProvider } = require('./providers/webdav.js')
const { mediaLibraryRepository } = require('./storage.js')
const { buildWebdavHeaders, buildWebdavUrl } = require('./webdav.js')

async function createSmbConnectionInfo(connection, repository) {
  const credential = await resolveConnectionCredential(connection, repository)
  if (!credential?.host || !credential?.share) throw new Error('media library smb credential incomplete')
  return {
    host: credential.host,
    share: credential.share,
    username: credential.username,
    password: credential.password,
  }
}

function createMediaLibraryRuntimeRegistry(repository = mediaLibraryRepository) {
  const localProvider = createLocalProvider({
    readDir,
    readMetadata,
  })
  const smbProvider = createSmbProvider({
    async listDirectory(connection, pathOrUri) {
      const smbConnection = await createSmbConnectionInfo(connection, repository)
      return listSmbDirectory({
        ...smbConnection,
        path: pathOrUri,
      })
    },
    async readMetadata() {
      return null
    },
    async downloadFile(connection, remotePathOrUri, localPath) {
      const smbConnection = await createSmbConnectionInfo(connection, repository)
      return downloadSmbFile({
        ...smbConnection,
        remotePath: remotePathOrUri,
        localPath,
      })
    },
  })
  const webdavProvider = createWebdavProvider({
    async request(connection, { method = 'PROPFIND', depth = '1', pathOrUri }) {
      const credential = await resolveConnectionCredential(connection, repository)
      const requestUrl = buildWebdavUrl(connection.rootPathOrUri, pathOrUri)
      let response
      try {
        response = await fetch(requestUrl, {
          method,
          headers: {
            Depth: String(depth),
            'Content-Type': 'application/xml; charset=utf-8',
            ...buildWebdavHeaders(credential),
          },
        })
      } catch (error) {
        throw new Error(`webdav request ${method} ${requestUrl} failed: ${error?.message || error}`)
      }
      const text = await response.text()
      if (!response.ok) throw new Error(text || `webdav request ${method} ${requestUrl} failed: ${response.status}`)
      return text
    },
    async downloadFile() {
      return null
    },
  })

  return createProviderRegistry([
    localProvider,
    smbProvider,
    webdavProvider,
  ])
}

let runtimeRegistry

function getMediaLibraryRuntimeRegistry() {
  if (!runtimeRegistry) runtimeRegistry = createMediaLibraryRuntimeRegistry()
  return runtimeRegistry
}

module.exports = {
  createMediaLibraryRuntimeRegistry,
  getMediaLibraryRuntimeRegistry,
}
