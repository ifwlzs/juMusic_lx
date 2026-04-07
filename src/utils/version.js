import { httpGet } from '@/utils/request'
import { name, repository } from '../../package.json'
import { downloadFile, stopDownload, temporaryDirectoryPath } from '@/utils/fs'
import { getSupportedAbis, installApk } from '@/utils/nativeModules/utils'
import { APP_PROVIDER_NAME } from '@/config/constant'

const abis = [
  'arm64-v8a',
  'armeabi-v7a',
  'x86_64',
  'x86',
  'universal',
]
const DEFAULT_REPO_OWNER = 'ifwlzs'
const DEFAULT_REPO_NAME = 'juMusic_lx'
const DEFAULT_VERSION_INFO_URL = 'https://raw.githubusercontent.com/ifwlzs/juMusic_lx/main/publish/version.json'
const DEFAULT_RELEASE_DOWNLOAD_BASE_URL = 'https://github.com/ifwlzs/juMusic_lx/releases/download'

const resolveGitHubRepoInfo = () => {
  const normalizedUrl = String(repository.url ?? '')
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
  const match = normalizedUrl.match(/github\.com\/([^/]+)\/([^/]+)/i)

  if (!match) return { owner: DEFAULT_REPO_OWNER, repo: DEFAULT_REPO_NAME }
  return {
    owner: match[1],
    repo: match[2],
  }
}

const { owner: repoOwner, repo: repoName } = resolveGitHubRepoInfo()
const versionInfoUrl = repoOwner && repoName
  ? `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/publish/version.json`
  : DEFAULT_VERSION_INFO_URL
const releaseDownloadBaseUrl = repoOwner && repoName
  ? `https://github.com/${repoOwner}/${repoName}/releases/download`
  : DEFAULT_RELEASE_DOWNLOAD_BASE_URL
const address = [
  versionInfoUrl,
]


const request = async(url, retryNum = 0) => {
  return new Promise((resolve, reject) => {
    httpGet(url, {
      timeout: 10000,
    }, (err, resp, body) => {
      if (err || resp.statusCode != 200) {
        ++retryNum >= 3
          ? reject(err || new Error(resp.statusMessage || resp.statusCode))
          : request(url, retryNum).then(resolve).catch(reject)
      } else resolve(body)
    })
  })
}

const getDirectInfo = async(url) => {
  return request(url).then(info => {
    if (info.version == null) throw new Error('failed')
    return info
  })
}

export const getVersionInfo = async(index = 0) => {
  const url = address[index]
  const promise = getDirectInfo(url)

  return promise.catch(async(err) => {
    index++
    if (index >= address.length) throw err
    return getVersionInfo(index)
  })
}

const getTargetAbi = async() => {
  const supportedAbis = await getSupportedAbis()
  for (const abi of abis) {
    if (supportedAbis.includes(abi)) return abi
  }
  return abis[abis.length - 1]
}
let downloadJobId = null
const noop = (total, download) => {}
let apkSavePath

export const downloadNewVersion = async(version, onDownload = noop) => {
  const abi = await getTargetAbi()
  const url = `${releaseDownloadBaseUrl}/v${version}/${name}-v${version}-${abi}.apk`
  let savePath = temporaryDirectoryPath + '/lx-music-mobile.apk'

  if (downloadJobId) stopDownload(downloadJobId)

  const { jobId, promise } = downloadFile(url, savePath, {
    progressInterval: 500,
    connectionTimeout: 20000,
    readTimeout: 30000,
    begin({ statusCode, contentLength }) {
      onDownload(contentLength, 0)
      // switch (statusCode) {
      //   case 200:
      //   case 206:
      //     break
      //   default:
      //     onDownload(null, contentLength, 0)
      //     break
      // }
    },
    progress({ contentLength, bytesWritten }) {
      onDownload(contentLength, bytesWritten)
    },
  })
  downloadJobId = jobId
  return promise.then(() => {
    apkSavePath = savePath
    return updateApp()
  })
}

export const updateApp = async() => {
  if (!apkSavePath) throw new Error('apk Save Path is null')
  await installApk(apkSavePath, APP_PROVIDER_NAME)
}
