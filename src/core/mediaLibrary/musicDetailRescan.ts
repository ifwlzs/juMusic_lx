export type MusicDetailMediaLibraryInfo = NonNullable<(LX.Music.MusicInfoLocal | LX.Music.MusicInfoRemoteFile)['meta']['mediaLibrary']>

export interface FindMusicDetailRescanRuleOptions {
  mediaLibrary: MusicDetailMediaLibraryInfo
  sourceListId?: string | null
  lists?: LX.List.MyListInfo[]
  rules: LX.MediaLibrary.ImportRule[]
}

export const normalizeRescanPathOrUri = (pathOrUri: string | null | undefined): string => {
  // 重新扫描只需要与导入规则做同源路径比较；去掉空白和末尾斜杠即可保持与导入扫描的最小一致性。
  const value = String(pathOrUri ?? '').trim()
  if (!value) return ''
  if (value === '/') return '/'
  return value.replace(/\/+$/, '')
}

const isWithinRescanDirectory = (pathOrUri: string, directoryPathOrUri: string): boolean => {
  // 目录命中允许歌曲本身等于目录路径，也允许歌曲位于目录子路径下，避免 /Album2 误命中 /Album。
  const normalizedPath = normalizeRescanPathOrUri(pathOrUri)
  const normalizedDirectory = normalizeRescanPathOrUri(directoryPathOrUri)
  if (!normalizedPath || !normalizedDirectory) return false
  if (normalizedDirectory === '/') return normalizedPath.startsWith('/')
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`)
}

export const isSourcePathCoveredByRule = (pathOrUri: string | null | undefined, rule: LX.MediaLibrary.ImportRule): boolean => {
  // 覆盖判断复用导入规则的目录 + 散选歌曲语义，用于确定“当前歌曲”应提交哪条规则重新扫描。
  const normalizedPath = normalizeRescanPathOrUri(pathOrUri)
  if (!normalizedPath) return false

  const directories = Array.isArray(rule.directories) ? rule.directories : []
  if (directories.some(directory => isWithinRescanDirectory(normalizedPath, directory.pathOrUri))) return true

  const tracks = Array.isArray(rule.tracks) ? rule.tracks : []
  return tracks.some(track => normalizeRescanPathOrUri(track.pathOrUri) === normalizedPath)
}

const getGeneratedMediaSourceRuleId = (sourceListId: string | null | undefined, lists: LX.List.MyListInfo[]): string | null => {
  // sourceListId 来自详情入口；只有生成媒体列表携带 ruleId 时才把它作为优先候选。
  if (!sourceListId) return null
  const currentList = lists.find(list => list.id === sourceListId)
  if (!currentList || !('mediaSource' in currentList) || !currentList.mediaSource?.generated) return null
  return currentList.mediaSource.ruleId ?? null
}

export const findMusicDetailRescanRule = ({
  mediaLibrary,
  sourceListId = null,
  lists = [],
  rules,
}: FindMusicDetailRescanRuleOptions): LX.MediaLibrary.ImportRule | null => {
  // 只在当前媒体库连接内找规则，避免同路径但不同账号 / provider 的规则被误提交。
  const sourcePath = normalizeRescanPathOrUri(mediaLibrary.remotePathOrUri)
  if (!mediaLibrary.connectionId || !sourcePath) return null

  const connectionRules = rules.filter(rule => rule.connectionId === mediaLibrary.connectionId)
  const preferredRuleId = getGeneratedMediaSourceRuleId(sourceListId, lists)
  const preferredRule = preferredRuleId
    ? connectionRules.find(rule => rule.ruleId === preferredRuleId)
    : null

  // 当前生成列表规则必须确实覆盖当前歌曲；不覆盖时回退到路径匹配，防止旧列表状态误导重新扫描。
  if (preferredRule && isSourcePathCoveredByRule(sourcePath, preferredRule)) return preferredRule
  return connectionRules.find(rule => isSourcePathCoveredByRule(sourcePath, rule)) ?? null
}
