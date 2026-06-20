import type { MusicDetailSection, MusicDetailSectionItem } from './buildDetailSections'

type MediaLibraryInfo = NonNullable<(LX.Music.MusicInfoLocal | LX.Music.MusicInfoRemoteFile)['meta']['mediaLibrary']>
type CacheOrigin = NonNullable<LX.MediaLibrary.MediaCache['cacheOrigin']>
type PrefetchState = NonNullable<LX.MediaLibrary.MediaCache['prefetchState']>

const CACHE_LABELS = {
  status: 'music_detail_cache_status',
  origin: 'music_detail_cache_origin',
  prefetchState: 'music_detail_cache_prefetch_state',
  path: 'music_detail_cache_path',
  fileSize: 'music_detail_cache_file_size',
  createdAt: 'music_detail_cache_created_at',
  lastAccessAt: 'music_detail_cache_last_access_at',
} as const

const CACHE_STATUS_VALUES = {
  notCached: 'music_detail_cache_status_not_cached',
  cached: 'music_detail_cache_status_cached',
  stale: 'music_detail_cache_status_stale',
} as const

const CACHE_ORIGIN_VALUES: Record<CacheOrigin, string> = {
  play: 'music_detail_cache_origin_play',
  prefetch: 'music_detail_cache_origin_prefetch',
}

const PREFETCH_STATE_VALUES: Record<PrefetchState, string> = {
  queued: 'music_detail_cache_prefetch_state_queued',
  running: 'music_detail_cache_prefetch_state_running',
  ready: 'music_detail_cache_prefetch_state_ready',
  failed: 'music_detail_cache_prefetch_state_failed',
}

const hasMediaLibraryMeta = (meta: LX.Music.MusicInfo['meta']): meta is (LX.Music.MusicInfoLocal | LX.Music.MusicInfoRemoteFile)['meta'] => {
  // 只有本地与远端文件歌曲的 meta 可能带媒体库索引信息，用类型守卫避免在线歌曲误取字段。
  return 'mediaLibrary' in meta
}

const getMediaLibraryInfo = (musicInfo: LX.Music.MusicInfo): MediaLibraryInfo | undefined => {
  // 缓存状态只对媒体库歌曲有意义，本地或在线普通歌曲不生成缓存分组。
  if (!hasMediaLibraryMeta(musicInfo.meta)) return undefined
  return musicInfo.meta.mediaLibrary
}

const pushItem = (items: MusicDetailSectionItem[], key: string, label: string, value: unknown) => {
  // 详情页只展示有值字段，避免把缺失的缓存元数据渲染成空行。
  if (value === null || value === undefined || value === '') return
  items.push({ key, label, value: String(value) })
}

const resolveCacheStatus = (mediaLibrary: MediaLibraryInfo, cacheEntry?: LX.MediaLibrary.MediaCache | null) => {
  if (!cacheEntry) return CACHE_STATUS_VALUES.notCached
  // versionToken 是媒体库缓存失效的最小判定依据：不一致说明本地缓存对应旧版本文件。
  return cacheEntry.versionToken === mediaLibrary.versionToken
    ? CACHE_STATUS_VALUES.cached
    : CACHE_STATUS_VALUES.stale
}

const formatCacheOrigin = (origin?: CacheOrigin) => {
  if (!origin) return ''
  return CACHE_ORIGIN_VALUES[origin] ?? origin
}

const formatPrefetchState = (state?: PrefetchState) => {
  if (!state) return ''
  return PREFETCH_STATE_VALUES[state] ?? state
}

export const formatMusicDetailCacheFileSize = (size?: number | null) => {
  // 文件大小只做显示格式化，不读取文件系统，避免详情页产生额外 I/O。
  if (typeof size != 'number' || !Number.isFinite(size) || size < 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export const formatMusicDetailCacheTimestamp = (timestamp?: number | null) => {
  // 缓存时间戳来自索引记录，页面仅转成本机区域设置下的可读时间。
  if (typeof timestamp != 'number' || !Number.isFinite(timestamp) || timestamp < 0) return ''
  return new Date(timestamp).toLocaleString()
}

export const buildMusicDetailCacheSection = (
  musicInfo: LX.Music.MusicInfo,
  cacheEntry?: LX.MediaLibrary.MediaCache | null,
): MusicDetailSection | null => {
  const mediaLibrary = getMediaLibraryInfo(musicInfo)
  if (!mediaLibrary?.sourceItemId) return null

  const items: MusicDetailSectionItem[] = []
  pushItem(items, 'cacheStatus', CACHE_LABELS.status, resolveCacheStatus(mediaLibrary, cacheEntry))

  if (cacheEntry) {
    // 缓存详情全部来自索引记录，只读展示来源、预加载状态、路径、大小与访问时间。
    pushItem(items, 'cacheOrigin', CACHE_LABELS.origin, formatCacheOrigin(cacheEntry.cacheOrigin))
    pushItem(items, 'prefetchState', CACHE_LABELS.prefetchState, formatPrefetchState(cacheEntry.prefetchState))
    pushItem(items, 'localFilePath', CACHE_LABELS.path, cacheEntry.localFilePath)
    pushItem(items, 'cachedFileSize', CACHE_LABELS.fileSize, formatMusicDetailCacheFileSize(cacheEntry.cachedFileSize))
    pushItem(items, 'createdAt', CACHE_LABELS.createdAt, formatMusicDetailCacheTimestamp(cacheEntry.createdAt))
    pushItem(items, 'lastAccessAt', CACHE_LABELS.lastAccessAt, formatMusicDetailCacheTimestamp(cacheEntry.lastAccessAt))
  }

  return items.length ? { key: 'cache', items } : null
}
