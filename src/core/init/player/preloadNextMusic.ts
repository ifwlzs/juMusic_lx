import { getMusicUrl } from '@/core/music'
import { createPrefetchScheduler } from '@/core/mediaLibrary/prefetch'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { prefetchMediaLibraryTrack } from '@/core/music/mediaLibrary'
import { getNextPlayMusicInfo, resetRandomNextMusicInfo } from '@/core/player/player'
import { checkUrl } from '@/utils/request'
import playerState from '@/store/player/state'
import { isCached } from '@/plugins/player/utils'


const preloadMusicInfo = {
  isLoading: false,
  preProgress: 0,
  info: null as LX.Player.PlayMusicInfo | null,
}
const resetPreloadInfo = () => {
  preloadMusicInfo.preProgress = 0
  preloadMusicInfo.info = null
  preloadMusicInfo.isLoading = false
}
const prefetchScheduler = createPrefetchScheduler({
  async ensureCached(musicInfo) {
    if (!musicInfo || 'progress' in musicInfo) return
    if (musicInfo.source !== 'webdav' && musicInfo.source !== 'smb' && musicInfo.source !== 'onedrive') return
    await prefetchMediaLibraryTrack(musicInfo)
  },
  async shouldDeferPrefetch() {
    const runs = (await mediaLibraryRepository.getSyncRuns()) as LX.MediaLibrary.SyncRun[]
    return runs.some(run => run.status === 'running' && (run.phase === 'enumerate' || run.phase === 'hydrate'))
  },
})
const preloadNextMusicUrl = async(curTime: number) => {
  if (preloadMusicInfo.isLoading || curTime - preloadMusicInfo.preProgress < 3) return
  preloadMusicInfo.isLoading = true
  console.log('preload next music url')
  const info = await getNextPlayMusicInfo()
  if (info) {
    preloadMusicInfo.info = info
    if (!('progress' in info.musicInfo) && (info.musicInfo.source == 'webdav' || info.musicInfo.source == 'smb' || info.musicInfo.source == 'onedrive')) {
      await prefetchScheduler.onTrackStarted(playerState.playMusicInfo.musicInfo, info.musicInfo)
      preloadMusicInfo.isLoading = false
      return
    }
    const url = await getMusicUrl({ musicInfo: info.musicInfo }).catch(() => '')
    if (url) {
      console.log('preload url', url)
      const [cached, available] = await Promise.all([isCached(url), checkUrl(url).then(() => true).catch(() => false)])
      if (!cached && !available) {
        const url = await getMusicUrl({ musicInfo: info.musicInfo, isRefresh: true }).catch(() => '')
        console.log('preload url refresh', url)
      }
    }
  }
  preloadMusicInfo.isLoading = false
}

export default () => {
  const setProgress = (time: number) => {
    if (!playerState.musicInfo.id) return
    preloadMusicInfo.preProgress = time
  }

  const handleSetPlayInfo = () => {
    resetPreloadInfo()
    prefetchScheduler.cancel()
  }

  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys, settings) => {
    if (!keys.includes('player.togglePlayMethod')) return
    if (!preloadMusicInfo.info || preloadMusicInfo.info.isTempPlay) return
    resetRandomNextMusicInfo()
    preloadMusicInfo.info = null
    preloadMusicInfo.preProgress = playerState.progress.nowPlayTime
  }

  const handlePlayProgressChanged: typeof global.state_event.playProgressChanged = (progress) => {
    const duration = progress.maxPlayTime
    if (duration > 10 && duration - progress.nowPlayTime < 10 && !preloadMusicInfo.info) {
      void preloadNextMusicUrl(progress.nowPlayTime)
    }
  }

  global.app_event.on('setProgress', setProgress)
  global.app_event.on('musicToggled', handleSetPlayInfo)
  global.state_event.on('configUpdated', handleConfigUpdated)
  global.state_event.on('playProgressChanged', handlePlayProgressChanged)
}
