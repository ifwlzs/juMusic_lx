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
  action: MusicDetailCopyAction
  label: string
  disabled?: boolean
}

const LABELS = {
  name: '歌名',
  singer: '歌手',
  album: '专辑',
  interval: '时长',
  source: '来源',
  filePath: '文件路径',
  ext: '文件扩展名',
  remotePathOrUri: '远端路径',
  fileName: '文件名',
  modifiedTime: '修改时间',
  versionToken: '版本标识',
  connectionId: '连接ID',
  sourceItemId: '源项目ID',
  aggregateSongId: '聚合歌曲ID',
  preferredSourceItemId: '首选源项目ID',
  providerType: '提供方类型',
  status: '状态',
} as const

const STATUS_LABELS: Record<NonNullable<LX.Music.MusicInfo['meta']['mediaLibrary']>['unavailableReason'], string> = {
  connection_removed: '连接已移除',
  rule_removed: '规则已移除',
}

const hasMediaLibrary = (musicInfo: LX.Music.MusicInfo) => {
  return 'mediaLibrary' in musicInfo.meta && !!musicInfo.meta.mediaLibrary
}

const getMediaLibraryInfo = (musicInfo: LX.Music.MusicInfo) => {
  return hasMediaLibrary(musicInfo) ? musicInfo.meta.mediaLibrary : undefined
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
  pushItem(items, 'source', LABELS.source, musicInfo.source)
  return items
}

const buildFileSection = (musicInfo: LX.Music.MusicInfo) => {
  const items: MusicDetailSectionItem[] = []
  const mediaLibrary = getMediaLibraryInfo(musicInfo)
  // 本地歌曲只展示本地文件路径和扩展名；媒体库歌曲优先展示远端路径和归档字段，避免把来源混在一起。
  if (mediaLibrary) {
    pushItem(items, 'remotePathOrUri', LABELS.remotePathOrUri, mediaLibrary.remotePathOrUri)
    pushItem(items, 'fileName', LABELS.fileName, mediaLibrary.fileName)
    pushItem(items, 'modifiedTime', LABELS.modifiedTime, mediaLibrary.modifiedTime)
    pushItem(items, 'versionToken', LABELS.versionToken, mediaLibrary.versionToken)
  } else {
    if ('filePath' in musicInfo.meta) pushItem(items, 'filePath', LABELS.filePath, musicInfo.meta.filePath)
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
  pushItem(items, 'providerType', LABELS.providerType, mediaLibrary.providerType)
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
    { action: 'name', label: '复制歌名' },
    { action: 'name_with_artist', label: '复制歌手+歌名' },
    { action: 'full', label: '复制完整详情' },
    { action: 'path', label: '复制路径', disabled: !path },
  ]
}
