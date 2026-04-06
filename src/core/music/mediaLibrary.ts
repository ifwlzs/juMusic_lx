import { buildLyricInfo } from './utils'
import { parseLyric } from './local'
import { invalidateCache, upsertCacheEntry } from '@/core/mediaLibrary/cache'
import { buildMediaLibraryCacheFilePath } from '@/core/mediaLibrary/cachePath'
import { resolvePlayableResource } from '@/core/mediaLibrary/playbackResolver'
import { getMediaLibraryRuntimeRegistry } from '@/core/mediaLibrary/runtimeRegistry'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { mkdir, temporaryDirectoryPath, unlink } from '@/utils/fs'
import { readLyric, readPic } from '@/utils/localMediaMetadata'

const MEDIA_LIBRARY_CACHE_DIR = `${temporaryDirectoryPath}/media-library`
const pendingPlayableFilePaths = new Map<string, Promise<string>>()

const getCacheFilePath = (musicInfo: LX.Music.MusicInfoRemoteFile) => {
  return buildMediaLibraryCacheFilePath(
    MEDIA_LIBRARY_CACHE_DIR,
    musicInfo.meta.mediaLibrary!.sourceItemId,
    musicInfo.meta.ext ?? 'mp3',
  )
}

const downloadRemoteFile = async(musicInfo: LX.Music.MusicInfoRemoteFile, targetPath: string) => {
  const connection = ((await mediaLibraryRepository.getConnections()) as LX.MediaLibrary.SourceConnection[])
    .find(item => item.connectionId === musicInfo.meta.mediaLibrary!.connectionId)
  if (!connection) throw new Error('media library connection not found')

  const provider = getMediaLibraryRuntimeRegistry().get(musicInfo.source as LX.MediaLibrary.ProviderType)
  if (!provider?.downloadToCache) {
    throw new Error(`media library playback provider not supported: ${musicInfo.source}`)
  }

  const sourceItem = {
    providerType: musicInfo.meta.mediaLibrary!.providerType,
    sourceItemId: musicInfo.meta.mediaLibrary!.sourceItemId,
    versionToken: musicInfo.meta.mediaLibrary!.versionToken,
    pathOrUri: musicInfo.meta.mediaLibrary!.remotePathOrUri,
  }
  const downloadResult = await provider.downloadToCache(connection, sourceItem, targetPath)
  if (downloadResult?.promise) await downloadResult.promise
  return targetPath
}

const resolveLocalPlayableFilePath = async(musicInfo: LX.Music.MusicInfoRemoteFile, isRefresh: boolean) => {
  const pendingKey = `${musicInfo.meta.mediaLibrary!.sourceItemId}__${isRefresh ? 'refresh' : 'default'}`
  const pendingTask = pendingPlayableFilePaths.get(pendingKey)
  if (pendingTask) return pendingTask

  const task = (async() => {
    await mkdir(MEDIA_LIBRARY_CACHE_DIR).catch(() => null)

    const localFilePath = getCacheFilePath(musicInfo)
    let cacheEntry = await mediaLibraryRepository.findCacheBySourceItemId(musicInfo.meta.mediaLibrary!.sourceItemId)
    if (cacheEntry && cacheEntry.localFilePath !== localFilePath) {
      await invalidateCache(cacheEntry, unlink, mediaLibraryRepository)
      cacheEntry = null
    }
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
