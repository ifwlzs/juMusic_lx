import musicSdk from '@/utils/musicSdk'
import { toOldMusicInfo } from '@/utils'
import { openUrl } from '@/utils/tools'

// 统一读取媒体库附加信息，供列表菜单、搜索结果和详情页入口共同判断内部详情目标。
export const getMusicDetailMediaLibraryInfo = (musicInfo: LX.Music.MusicInfo) => {
  return 'mediaLibrary' in musicInfo.meta ? musicInfo.meta.mediaLibrary : undefined
}

// 本地歌曲与媒体库歌曲都进入应用内详情页；在线音源继续保留外链详情。
export const isInternalMusicDetailTarget = (musicInfo: LX.Music.MusicInfo) => {
  return !!(musicInfo.source == 'local' || getMusicDetailMediaLibraryInfo(musicInfo))
}

// 在线音源详情 URL 继续通过 SDK 生成，调用方只负责在需要外链时打开。
export const getExternalMusicSourceDetailUrl = (minfo: LX.Music.MusicInfo) => {
  return musicSdk[minfo.source as LX.OnlineSource]?.getMusicDetailPageUrl(toOldMusicInfo(minfo)) ?? ''
}

// 统一打开在线音源外链详情；无 URL 时静默返回，保持既有详情菜单行为。
export const handleShowMusicSourceDetail = async(musicInfo: LX.Music.MusicInfo) => {
  const url = getExternalMusicSourceDetailUrl(musicInfo)
  if (!url) return
  void openUrl(url)
}
