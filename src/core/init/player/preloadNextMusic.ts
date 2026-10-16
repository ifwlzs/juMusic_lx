import { getMusicUrl } from '@/core/music'
import { createPrefetchScheduler, shouldDeferPrefetchForRemoteSync, shouldPrefetchNextTrack } from '@/core/mediaLibrary/prefetch'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { prefetchMediaLibraryTrack } from '@/core/music/mediaLibrary'
import { getNextPlayMusicInfo, resetRandomNextMusicInfo } from '@/core/player/player'
import { getDuration, getPosition } from '@/plugins/player'
import { checkUrl } from '@/utils/request'
import playerState from '@/store/player/state'
import { isCached } from '@/plugins/player/utils'
import BackgroundTimer from 'react-native-background-timer'


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
    await prefetchMediaLibraryTrack(musicInfo as LX.Music.MusicInfoRemoteFile)
  },
  async shouldDeferPrefetch() {
    const [syncRuns, importJobs] = await Promise.all([
      mediaLibraryRepository.getSyncRuns() as Promise<LX.MediaLibrary.SyncRun[]>,
      mediaLibraryRepository.getImportJobs() as Promise<LX.MediaLibrary.ImportJob[]>,
    ])
    return shouldDeferPrefetchForRemoteSync({ syncRuns, importJobs })
  },
  maxDeferMs: 5_000,
})
const preloadNextMusicUrl = async(curTime: number, { force = false } = {}) => {
  if (preloadMusicInfo.isLoading) return
  if (!force && curTime - preloadMusicInfo.preProgress < 3) return
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
  let prefetchWatchId: number | null = null

  const stopPrefetchWatch = () => {
    if (prefetchWatchId == null) return
    BackgroundTimer.clearInterval(prefetchWatchId)
    prefetchWatchId = null
  }

  const maybePrefetchByPosition = async() => {
    if (!playerState.isPlay || preloadMusicInfo.info || preloadMusicInfo.isLoading) return
    const [position, duration] = await Promise.all([getPosition(), getDuration()])
    if (!shouldPrefetchNextTrack({ durationSec: duration, positionSec: position })) return
    void preloadNextMusicUrl(position, { force: true })
  }

  const startPrefetchWatch = () => {
    if (prefetchWatchId != null) return
    prefetchWatchId = BackgroundTimer.setInterval(() => {
      void maybePrefetchByPosition()
    }, 2000)
    void maybePrefetchByPosition()
  }

  const setProgress = (time: number) => {
    if (!playerState.musicInfo.id) return
    preloadMusicInfo.preProgress = time
  }

  const handleSetPlayInfo = () => {
    resetPreloadInfo()
    prefetchScheduler.cancel()
    stopPrefetchWatch()
  }

  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys, settings) => {
    if (!keys.includes('player.togglePlayMethod')) return
    if (!preloadMusicInfo.info || preloadMusicInfo.info.isTempPlay) return
    resetRandomNextMusicInfo()
    preloadMusicInfo.info = null
    preloadMusicInfo.preProgress = playerState.progress.nowPlayTime
  }

  const handlePlayProgressChanged: typeof global.state_event.playProgressChanged = (progress) => {
    if (!shouldPrefetchNextTrack({
      durationSec: progress.maxPlayTime,
      positionSec: progress.nowPlayTime,
    })) return
    if (preloadMusicInfo.info || preloadMusicInfo.isLoading) return
    void preloadNextMusicUrl(progress.nowPlayTime, { force: true })
  }

  const handlePlaying = () => {
    if (!playerState.isPlay) return
    startPrefetchWatch()
  }

  const handlePause = () => {
    stopPrefetchWatch()
  }

  global.app_event.on('setProgress', setProgress)
  global.app_event.on('musicToggled', handleSetPlayInfo)
  global.app_event.on('playerPlaying', handlePlaying)
  global.app_event.on('pause', handlePause)
  global.app_event.on('playerPause', handlePause)
  global.state_event.on('configUpdated', handleConfigUpdated)
  global.state_event.on('playProgressChanged', handlePlayProgressChanged)
}
