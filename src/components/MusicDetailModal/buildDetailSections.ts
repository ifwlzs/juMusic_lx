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
  disabled: boolean
}

const LABELS = {
  name: 'music_detail_name',
  artist: 'music_detail_artist',
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
  unavailableReason: 'music_detail_unavailable_reason',
} as const

const STATUS_LABELS: Record<NonNullable<LX.Music.MusicInfo['meta']['mediaLibrary']>['unavailableReason'], string> = {
  connection_removed: 'music_detail_unavailable_connection_removed',
  rule_removed: 'music_detail_unavailable_rule_removed',
}

const COPY_TEXT_LABELS = {
  name: '歌名',
  artist: '歌手',
  album: '专辑',
  interval: '时长',
  source: '来源',
  path: '路径',
  ext: '扩展名',
  fileName: '文件名',
  modifiedTime: '修改时间',
  versionToken: '版本标识',
  connectionId: '连接ID',
  sourceItemId: '源项目ID',
  aggregateSongId: '聚合歌曲ID',
  preferredSourceItemId: '首选源项目ID',
  providerType: '提供方类型',
  unavailableReason: '状态',
} as const

const COPY_TEXT_STATUS_VALUES: Record<NonNullable<LX.Music.MusicInfo['meta']['mediaLibrary']>['unavailableReason'], string> = {
  connection_removed: '连接已移除',
  rule_removed: '规则已移除',
}

const COPY_TEXT_SOURCE_VALUES: Record<string, string> = {
  source_real_local: '本地',
  source_real_webdav: 'WebDAV',
  source_real_smb: 'SMB',
  source_real_onedrive: 'OneDrive',
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

const getResolvedSource = (musicInfo: LX.Music.MusicInfo) => {
  return getMediaLibraryInfo(musicInfo)?.providerType ?? musicInfo.source
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
  pushItem(items, 'artist', LABELS.artist, musicInfo.singer)
  pushItem(items, 'album', LABELS.album, musicInfo.meta.albumName)
  pushItem(items, 'interval', LABELS.interval, musicInfo.interval)
  // 来源显示优先使用媒体库 providerType，保证远端缓存歌曲仍展示真实提供方而不是当前 musicInfo.source。
  pushItem(items, 'source', LABELS.source, getSourceDisplayKey(getResolvedSource(musicInfo)))
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
    label: LABELS.unavailableReason,
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
  // full 文本按固定中文摘要输出，便于直接复制到聊天或工单；同时继续保持字段顺序稳定与无空行。
  const sections = buildMusicDetailSections(musicInfo)
  const copyLabelByKey: Record<string, string> = {
    name: COPY_TEXT_LABELS.name,
    artist: COPY_TEXT_LABELS.artist,
    album: COPY_TEXT_LABELS.album,
    interval: COPY_TEXT_LABELS.interval,
    source: COPY_TEXT_LABELS.source,
    path: COPY_TEXT_LABELS.path,
    ext: COPY_TEXT_LABELS.ext,
    fileName: COPY_TEXT_LABELS.fileName,
    modifiedTime: COPY_TEXT_LABELS.modifiedTime,
    versionToken: COPY_TEXT_LABELS.versionToken,
    connectionId: COPY_TEXT_LABELS.connectionId,
    sourceItemId: COPY_TEXT_LABELS.sourceItemId,
    aggregateSongId: COPY_TEXT_LABELS.aggregateSongId,
    preferredSourceItemId: COPY_TEXT_LABELS.preferredSourceItemId,
    providerType: COPY_TEXT_LABELS.providerType,
    status: COPY_TEXT_LABELS.unavailableReason,
  }
  const statusValueByKey: Record<string, string> = {
    [STATUS_LABELS.connection_removed]: COPY_TEXT_STATUS_VALUES.connection_removed,
    [STATUS_LABELS.rule_removed]: COPY_TEXT_STATUS_VALUES.rule_removed,
  }
  for (const section of sections) {
    for (const item of section.items) {
      let resolvedValue = item.value
      if (item.key == 'status') resolvedValue = statusValueByKey[item.value] ?? item.value
      if (item.key == 'source' || item.key == 'providerType') {
        // section 数据继续保留 i18n key，但 full 复制文本要转成可读文案，避免把内部 key 暴露给用户。
        resolvedValue = COPY_TEXT_SOURCE_VALUES[item.value] ?? item.value
      }
      lines.push(`${copyLabelByKey[item.key] ?? item.label}：${resolvedValue}`)
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
    { key: 'name', label: 'music_detail_copy_name', disabled: false },
    { key: 'name_with_artist', label: 'music_detail_copy_name_with_artist', disabled: false },
    { key: 'full', label: 'music_detail_copy_full', disabled: false },
    { key: 'path', label: 'music_detail_copy_path', disabled: !path },
  ]
}
