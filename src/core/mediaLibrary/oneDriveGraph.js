const { downloadFile: downloadFileToPath } = require('../../utils/fs')
const {
  getOneDriveBusinessAccessToken,
  getOneDriveBusinessAccount,
} = require('../../utils/nativeModules/oneDriveAuth')

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'
const DRIVE_ITEM_SELECT_FIELDS = ['name', 'size', 'file', 'folder', 'parentReference', 'eTag', 'lastModifiedDateTime', 'audio']

function normalizePathOrUri(pathOrUri = '') {
  const value = String(pathOrUri || '').trim()
  if (!value) return '/'
  if (value === '/') return '/'
  return value.replace(/\/+$/, '')
}

function encodeGraphPath(pathOrUri = '') {
  const normalized = normalizePathOrUri(pathOrUri)
  if (normalized === '/') return ''
  return `/${normalized.split('/').filter(Boolean).map(segment => encodeURIComponent(segment)).join('/')}`
}

function buildDriveItemUrl(pathOrUri = '', selectFields = null) {
  const encodedPath = encodeGraphPath(pathOrUri)
  const baseUrl = encodedPath
    ? `${GRAPH_BASE_URL}/me/drive/root:${encodedPath}`
    : `${GRAPH_BASE_URL}/me/drive/root`

  if (!Array.isArray(selectFields) || !selectFields.length) return baseUrl
  return `${baseUrl}?$select=${selectFields.join(',')}`
}

function buildChildrenUrl(pathOrUri = '') {
  const encodedPath = encodeGraphPath(pathOrUri)
  const baseUrl = encodedPath
    ? `${GRAPH_BASE_URL}/me/drive/root:${encodedPath}:/children`
    : `${GRAPH_BASE_URL}/me/drive/root/children`

  return `${baseUrl}?$select=${DRIVE_ITEM_SELECT_FIELDS.join(',')}`
}

async function requestGraphJson(requestUrl, accessToken, fetchImpl) {
  let response
  try {
    response = await fetchImpl(requestUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  } catch (error) {
    throw new Error(`onedrive graph request failed: ${error?.message || error}`)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `onedrive graph request failed: ${response.status}`)
  }

  return response.json()
}

function createOneDriveGraphClient({
  fetchImpl = fetch,
  downloadFile = downloadFileToPath,
  getAccessToken = getOneDriveBusinessAccessToken,
  getCurrentAccount = getOneDriveBusinessAccount,
  resolveConnectionCredential = async() => null,
} = {}) {
  const authorize = async connection => {
    const credential = await resolveConnectionCredential(connection)
    const currentAccount = await getCurrentAccount()
    if (!currentAccount?.homeAccountId) throw new Error('onedrive business account not signed in')
    if (credential?.accountId && currentAccount.homeAccountId !== credential.accountId) {
      throw new Error('onedrive business account mismatch')
    }

    const accessToken = await getAccessToken()
    if (!accessToken) throw new Error('onedrive business access token unavailable')
    return {
      accessToken,
      credential,
      currentAccount,
    }
  }

  return {
    async listChildren(connection, pathOrUri, nextLink = null) {
      const { accessToken } = await authorize(connection)
      const payload = await requestGraphJson(nextLink || buildChildrenUrl(pathOrUri), accessToken, fetchImpl)
      return {
        items: payload?.value || [],
        nextLink: payload?.['@odata.nextLink'] || null,
      }
    },
    async getItemByPath(connection, pathOrUri) {
      const { accessToken } = await authorize(connection)
      return requestGraphJson(buildDriveItemUrl(pathOrUri, DRIVE_ITEM_SELECT_FIELDS), accessToken, fetchImpl)
    },
    async downloadFile(connection, pathOrUri, localPath) {
      const { accessToken } = await authorize(connection)
      const item = await requestGraphJson(buildDriveItemUrl(pathOrUri), accessToken, fetchImpl)
      const downloadUrl = item?.['@microsoft.graph.downloadUrl']
      if (downloadUrl) return downloadFile(downloadUrl, localPath)
      return downloadFile(`${buildDriveItemUrl(pathOrUri)}/content`, localPath, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    },
  }
}

module.exports = {
  GRAPH_BASE_URL,
  createOneDriveGraphClient,
  encodeGraphPath,
}
