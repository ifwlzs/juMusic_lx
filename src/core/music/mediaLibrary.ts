import { buildLyricInfo } from './utils'
import { parseLyric } from './local'
import { invalidateCache, upsertCacheEntry } from '@/core/mediaLibrary/cache'
import { resolveConnectionCredential } from '@/core/mediaLibrary/credentials'
import { resolvePlayableResource } from '@/core/mediaLibrary/playbackResolver'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { mkdir, temporaryDirectoryPath, unlink, downloadFile } from '@/utils/fs'
import { readLyric, readPic } from '@/utils/localMediaMetadata'
import { downloadSmbFile } from '@/utils/nativeModules/smb'

const MEDIA_LIBRARY_CACHE_DIR = `${temporaryDirectoryPath}/media-library`
const pendingPlayableFilePaths = new Map<string, Promise<string>>()

const getCacheFilePath = (musicInfo: LX.Music.MusicInfoRemoteFile) => {
  return `${MEDIA_LIBRARY_CACHE_DIR}/${encodeURIComponent(musicInfo.meta.mediaLibrary!.sourceItemId)}.${musicInfo.meta.ext ?? 'mp3'}`
}

const buildWebdavDownloadUrl = (rootPathOrUri: string, remotePathOrUri: string) => {
  if (/^https?:\/\//i.test(remotePathOrUri)) return remotePathOrUri

  try {
    const rootUrl = new URL(rootPathOrUri)
    if (remotePathOrUri.startsWith('/')) return new URL(remotePathOrUri, `${rootUrl.protocol}//${rootUrl.host}`).toString()
    const normalizedRoot = rootPathOrUri.endsWith('/') ? rootPathOrUri : `${rootPathOrUri}/`
    return new URL(remotePathOrUri, normalizedRoot).toString()
  } catch {
    return remotePathOrUri
  }
}

const buildWebdavHeaders = (credential: LX.MediaLibrary.ConnectionCredential | null) => {
  if (!credential?.username) return undefined
  const auth = Buffer.from(`${credential.username}:${credential.password ?? ''}`).toString('base64')
  return {
    Authorization: `Basic ${auth}`,
  }
}

const downloadRemoteFile = async(musicInfo: LX.Music.MusicInfoRemoteFile, targetPath: string) => {
  const connection = ((await mediaLibraryRepository.getConnections()) as LX.MediaLibrary.SourceConnection[])
    .find(item => item.connectionId === musicInfo.meta.mediaLibrary!.connectionId)
  if (!connection) throw new Error('media library connection not found')

  const credential = await resolveConnectionCredential(connection, mediaLibraryRepository) as LX.MediaLibrary.ConnectionCredential | null
  const remotePathOrUri = musicInfo.meta.mediaLibrary!.remotePathOrUri

  if (musicInfo.source == 'webdav') {
    const remoteUrl = buildWebdavDownloadUrl(connection.rootPathOrUri, remotePathOrUri)
    const headers = buildWebdavHeaders(credential)
    await downloadFile(remoteUrl, targetPath, headers ? { headers } : {}).promise
    return targetPath
  }

  if (!credential?.host || !credential?.share) {
    throw new Error('media library smb credential incomplete')
  }
  await downloadSmbFile({
    host: credential.host,
    share: credential.share,
    username: credential.username,
    password: credential.password,
    remotePath: remotePathOrUri,
    localPath: targetPath,
  })
  return targetPath
}

const resolveLocalPlayableFilePath = async(musicInfo: LX.Music.MusicInfoRemoteFile, isRefresh: boolean) => {
  const pendingKey = `${musicInfo.meta.mediaLibrary!.sourceItemId}__${isRefresh ? 'refresh' : 'default'}`
  const pendingTask = pendingPlayableFilePaths.get(pendingKey)
  if (pendingTask) return pendingTask

  const task = (async() => {
    await mkdir(MEDIA_LIBRARY_CACHE_DIR).catch(() => null)

    const cacheEntry = await mediaLibraryRepository.findCacheBySourceItemId(musicInfo.meta.mediaLibrary!.sourceItemId)
    const sourceItem = {
      providerType: musicInfo.meta.mediaLibrary!.providerType,
      sourceItemId: musicInfo.meta.mediaLibrary!.sourceItemId,
      versionToken: musicInfo.meta.mediaLibrary!.versionToken,
      pathOrUri: musicInfo.meta.mediaLibrary!.remotePathOrUri,
    }

    const result = await resolvePlayableResource({
      sourceItem,
      cacheEntry: isRefresh ? null : cacheEntry,
      invalidateCacheEntry: async(entry) => {
        await invalidateCache(entry, unlink, mediaLibraryRepository)
      },
      downloadToCache: async() => {
        const localFilePath = getCacheFilePath(musicInfo)
        await downloadRemoteFile(musicInfo, localFilePath)
        await upsertCacheEntry(mediaLibraryRepository, {
          cacheId: `cache__${musicInfo.meta.mediaLibrary!.sourceItemId}`,
          sourceItemId: musicInfo.meta.mediaLibrary!.sourceItemId,
          versionToken: musicInfo.meta.mediaLibrary!.versionToken,
          localFilePath,
        })
        return localFilePath
      },
    })

    return result.url.replace(/^file:\/\//, '')
  })()

  pendingPlayableFilePaths.set(pendingKey, task)
  return task.finally(() => {
    pendingPlayableFilePaths.delete(pendingKey)
  })
}

export const getMusicUrl = async({ musicInfo, isRefresh }: {
  musicInfo: LX.Music.MusicInfoRemoteFile
  isRefresh: boolean
}) => {
  const filePath = await resolveLocalPlayableFilePath(musicInfo, isRefresh)
  return `file://${filePath}`
}

export const getLyricInfo = async({ musicInfo, isRefresh }: {
  musicInfo: LX.Music.MusicInfoRemoteFile
  isRefresh: boolean
}) => {
  const filePath = await resolveLocalPlayableFilePath(musicInfo, isRefresh)
  const lyric = await readLyric(filePath).catch(() => null)
  if (lyric) return buildLyricInfo(parseLyric(lyric))
  return buildLyricInfo({ lyric: '' })
}

export const getPicUrl = async({ musicInfo, isRefresh }: {
  musicInfo: LX.Music.MusicInfoRemoteFile
  isRefresh: boolean
}) => {
  const filePath = await resolveLocalPlayableFilePath(musicInfo, isRefresh)
  const pic = await readPic(filePath).catch(() => null)
  if (!pic) return ''
  return pic.startsWith('/') ? `file://${pic}` : pic
}
