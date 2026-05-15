// 这里把歌曲详情页需要展示的分组和复制文本统一收口为纯函数，方便后续 UI 直接复用且便于测试。

export type MusicDetailCopyAction = 'name' | 'name_with_artist' | 'full' | 'path'

export interface MusicDetailSectionItem {
  key: string
  label: string
  value: string
}

export interface MusicDetailSection {
  key: 'basic' | 'file' | 'media_library' | 'status'
  items: MusicDetailSectionItem[]
}

export interface MusicDetailCopyActionItem {
  key: MusicDetailCopyAction
  label: string
  disabled?: boolean
}

const LABELS = {
  name: 'music_detail_name',
  singer: 'music_detail_singer',
  album: 'music_detail_album',
  interval: 'music_detail_interval',
  source: 'music_detail_source',
  path: 'music_detail_path',
  ext: 'music_detail_ext',
  fileName: 'music_detail_file_name',
  modifiedTime: 'music_detail_modified_time',
  versionToken: 'music_detail_version_token',
  connectionId: 'music_detail_connection_id',
  sourceItemId: 'music_detail_source_item_id',
  aggregateSongId: 'music_detail_aggregate_song_id',
  preferredSourceItemId: 'music_detail_preferred_source_item_id',
  providerType: 'music_detail_provider_type',
  status: 'music_detail_status',
} as const

const STATUS_LABELS: Record<NonNullable<LX.Music.MusicInfo['meta']['mediaLibrary']>['unavailableReason'], string> = {
  connection_removed: 'music_detail_unavailable_connection_removed',
  rule_removed: 'music_detail_unavailable_rule_removed',
}

const hasMediaLibrary = (musicInfo: LX.Music.MusicInfo) => {
  return 'mediaLibrary' in musicInfo.meta && !!musicInfo.meta.mediaLibrary
}

const getMediaLibraryInfo = (musicInfo: LX.Music.MusicInfo) => {
  return hasMediaLibrary(musicInfo) ? musicInfo.meta.mediaLibrary : undefined
}

const getSourceDisplayKey = (source: unknown) => {
  return `source_real_${String(source)}`
}

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

const pushItem = (items: MusicDetailSectionItem[], key: string, label: string, value: unknown) => {
  const text = formatValue(value)
  if (!text) return
  items.push({ key, label, value: text })
}

const buildBasicSection = (musicInfo: LX.Music.MusicInfo) => {
  const items: MusicDetailSectionItem[] = []
  // 基础信息按阅读顺序固定输出，便于后续 UI 与复制文本保持一致。
  pushItem(items, 'name', LABELS.name, musicInfo.name)
  pushItem(items, 'singer', LABELS.singer, musicInfo.singer)
  pushItem(items, 'album', LABELS.album, musicInfo.meta.albumName)
  pushItem(items, 'interval', LABELS.interval, musicInfo.interval)
  pushItem(items, 'source', LABELS.source, getSourceDisplayKey(musicInfo.source))
  return items
}

const buildFileSection = (musicInfo: LX.Music.MusicInfo) => {
  const items: MusicDetailSectionItem[] = []
  const mediaLibrary = getMediaLibraryInfo(musicInfo)
  // 文件分组首项统一抽象为 path，避免 UI 层再分辨 filePath / remotePathOrUri 两种不同字段名。
  if (mediaLibrary) {
    pushItem(items, 'path', LABELS.path, mediaLibrary.remotePathOrUri)
    pushItem(items, 'fileName', LABELS.fileName, mediaLibrary.fileName)
    pushItem(items, 'modifiedTime', LABELS.modifiedTime, mediaLibrary.modifiedTime)
    pushItem(items, 'versionToken', LABELS.versionToken, mediaLibrary.versionToken)
  } else {
    if ('filePath' in musicInfo.meta) pushItem(items, 'path', LABELS.path, musicInfo.meta.filePath)
    if ('ext' in musicInfo.meta) pushItem(items, 'ext', LABELS.ext, musicInfo.meta.ext)
  }
  return items
}

const buildMediaLibrarySection = (musicInfo: LX.Music.MusicInfo) => {
  const mediaLibrary = getMediaLibraryInfo(musicInfo)
  const items: MusicDetailSectionItem[] = []
  if (!mediaLibrary) return items
  // 归档信息只展示能定位到媒体库条目的字段，必要时保留首选源条目但不强制输出空值。
  pushItem(items, 'connectionId', LABELS.connectionId, mediaLibrary.connectionId)
  pushItem(items, 'sourceItemId', LABELS.sourceItemId, mediaLibrary.sourceItemId)
  pushItem(items, 'aggregateSongId', LABELS.aggregateSongId, mediaLibrary.aggregateSongId)
  pushItem(items, 'preferredSourceItemId', LABELS.preferredSourceItemId, mediaLibrary.preferredSourceItemId)
  pushItem(items, 'providerType', LABELS.providerType, getSourceDisplayKey(mediaLibrary.providerType))
  return items
}

const buildStatusSection = (musicInfo: LX.Music.MusicInfo) => {
  const mediaLibrary = getMediaLibraryInfo(musicInfo)
  const items: MusicDetailSectionItem[] = []
  if (!mediaLibrary?.unavailableReason) return items
  // 状态字段需要映射成可读文本，避免把内部枚举值直接暴露给 UI 或复制文本。
  items.push({
    key: 'status',
    label: LABELS.status,
    value: STATUS_LABELS[mediaLibrary.unavailableReason],
  })
  return items
}

export const buildMusicDetailSections = (musicInfo: LX.Music.MusicInfo): MusicDetailSection[] => {
  const sections: MusicDetailSection[] = []
  const basic = buildBasicSection(musicInfo)
  if (basic.length) sections.push({ key: 'basic', items: basic })
  const file = buildFileSection(musicInfo)
  if (file.length) sections.push({ key: 'file', items: file })
  const mediaLibrary = buildMediaLibrarySection(musicInfo)
  if (mediaLibrary.length) sections.push({ key: 'media_library', items: mediaLibrary })
  const status = buildStatusSection(musicInfo)
  if (status.length) sections.push({ key: 'status', items: status })
  return sections
}

const getNameWithArtist = (musicInfo: LX.Music.MusicInfo) => {
  if (!musicInfo.singer) return musicInfo.name
  return `${musicInfo.singer} - ${musicInfo.name}`
}

const getFullTextLines = (musicInfo: LX.Music.MusicInfo) => {
  const lines: string[] = []
  // full 文本按分组顺序拼接，缺失字段不输出空行，避免复制时混入无意义空白。
  const sections = buildMusicDetailSections(musicInfo)
  for (const section of sections) {
    for (const item of section.items) {
      lines.push(`${item.label}：${item.value}`)
    }
  }
  return lines
}

export const buildMusicDetailCopyText = (action: MusicDetailCopyAction, musicInfo: LX.Music.MusicInfo) => {
  switch (action) {
    case 'name':
      return musicInfo.name
    case 'name_with_artist':
      return getNameWithArtist(musicInfo)
    case 'path':
      // 路径复制要尊重数据来源：媒体库优先复制远端路径，本地歌曲复制本地文件路径。
      return getMediaLibraryInfo(musicInfo)?.remotePathOrUri ?? ('filePath' in musicInfo.meta ? musicInfo.meta.filePath : '')
    case 'full':
      return getFullTextLines(musicInfo).join('\n')
    default:
      return ''
  }
}

export const getMusicDetailCopyActions = (musicInfo: LX.Music.MusicInfo): MusicDetailCopyActionItem[] => {
  const path = buildMusicDetailCopyText('path', musicInfo)
  return [
    { key: 'name', label: '复制歌名' },
    { key: 'name_with_artist', label: '复制歌手+歌名' },
    { key: 'full', label: '复制完整详情' },
    { key: 'path', label: '复制路径', disabled: !path },
  ]
}
