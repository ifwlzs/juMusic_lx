const { readDir, downloadFile: downloadFileToPath, temporaryDirectoryPath, unlink } = require('../../utils/fs')
const { readMetadata } = require('../../utils/localMediaMetadata')
const { downloadSmbFile, listSmbDirectory } = require('../../utils/nativeModules/smb')
const { getOneDriveBusinessAccessToken, getOneDriveBusinessAccount } = require('../../utils/nativeModules/oneDriveAuth')
const { resolveConnectionCredential } = require('./credentials.js')
const { resolveDownloadResult } = require('./downloadResult.js')
const { createOneDriveGraphClient } = require('./oneDriveGraph.js')
const { createProviderRegistry } = require('./providers/index.js')
const { createLocalProvider } = require('./providers/local.js')
const { createOneDriveProvider } = require('./providers/onedrive.js')
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

function getTempFileExtension(pathOrUri = '') {
  const normalized = String(pathOrUri || '').split(/[?#]/)[0]
  const extensionIndex = normalized.lastIndexOf('.')
  if (extensionIndex < 0) return ''
  return normalized.slice(extensionIndex).replace(/[^.\w-]/g, '')
}

function buildTempMetadataPath(pathOrUri = '') {
  return `${temporaryDirectoryPath}/media_library_scan_${Date.now()}_${Math.random().toString(36).slice(2)}${getTempFileExtension(pathOrUri)}`
}

async function readRemoteMetadataViaTemp(pathOrUri, downloadToPath) {
  const tempFilePath = buildTempMetadataPath(pathOrUri)
  try {
    const downloadResult = await downloadToPath(tempFilePath)
    await resolveDownloadResult(downloadResult, {
      operation: 'media library metadata download',
    })
    return await readMetadata(tempFilePath)
  } finally {
    try {
      await unlink(tempFilePath)
    } catch {}
  }
}

function createMediaLibraryRuntimeRegistry(repository = mediaLibraryRepository) {
  const oneDriveGraphClient = createOneDriveGraphClient({
    downloadFile: downloadFileToPath,
    getAccessToken: getOneDriveBusinessAccessToken,
    getCurrentAccount: getOneDriveBusinessAccount,
    resolveConnectionCredential(connection) {
      return resolveConnectionCredential(connection, repository)
    },
  })
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
    async readMetadata(pathOrUri, connection) {
      return readRemoteMetadataViaTemp(pathOrUri, async localPath => {
        const smbConnection = await createSmbConnectionInfo(connection, repository)
        return downloadSmbFile({
          ...smbConnection,
          remotePath: pathOrUri,
          localPath,
        })
      })
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
    async downloadFile(connection, remotePathOrUri, localPath) {
      const credential = await resolveConnectionCredential(connection, repository)
      const requestUrl = buildWebdavUrl(connection.rootPathOrUri, remotePathOrUri)
      return downloadFileToPath(requestUrl, localPath, {
        headers: {
          ...buildWebdavHeaders(credential),
        },
      })
    },
    readMetadata,
    createTempFilePath(fileName) {
      const extension = getTempFileExtension(fileName)
      return `${temporaryDirectoryPath}/media_library_webdav_${Date.now()}_${Math.random().toString(36).slice(2)}${extension}`
    },
    removeTempFile: unlink,
  })
  const oneDriveProvider = createOneDriveProvider({
    async listChildren(connection, pathOrUri, nextLink = null) {
      return oneDriveGraphClient.listChildren({
        ...connection,
        providerType: 'onedrive',
      }, pathOrUri, nextLink)
    },
    async getItemByPath(connection, pathOrUri) {
      return oneDriveGraphClient.getItemByPath({
        ...connection,
        providerType: 'onedrive',
      }, pathOrUri)
    },
    async downloadFile(connection, remotePathOrUri, localPath) {
      return oneDriveGraphClient.downloadFile({
        ...connection,
        providerType: 'onedrive',
      }, remotePathOrUri, localPath)
    },
    readMetadata,
    createTempFilePath(fileName) {
      const extension = getTempFileExtension(fileName)
      return `${temporaryDirectoryPath}/media_library_onedrive_${Date.now()}_${Math.random().toString(36).slice(2)}${extension}`
    },
    removeTempFile: unlink,
  })

  return createProviderRegistry([
    localProvider,
    smbProvider,
    webdavProvider,
    oneDriveProvider,
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
