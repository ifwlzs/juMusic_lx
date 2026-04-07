import { updateListMusics } from '@/core/list'
import { createAnalyticsRecorder } from '@/core/mediaLibrary/analytics'
import { resolvePendingSeekState, shouldWaitForRemoteSeek } from '@/core/mediaLibrary/pendingSeek'
import { setStatusText } from '@/core/player/playStatus'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { setMaxplayTime, setNowPlayTime } from '@/core/player/progress'
import { getBufferedPosition, setCurrentTime, getDuration, getPosition, setPause, setPlay } from '@/plugins/player'
import { formatPlayTime2 } from '@/utils/common'
import { savePlayInfo } from '@/utils/data'
import { throttleBackgroundTimer } from '@/utils/tools'
import BackgroundTimer from 'react-native-background-timer'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import { onScreenStateChange } from '@/utils/nativeModules/utils'
import { AppState } from 'react-native'

const delaySavePlayInfo = throttleBackgroundTimer(() => {
  void savePlayInfo({
    time: playerState.progress.nowPlayTime,
    maxTime: playerState.progress.maxPlayTime,
    listId: playerState.playMusicInfo.listId!,
    index: playerState.playInfo.playIndex,
  })
}, 2000)

const analyticsRecorder = createAnalyticsRecorder({
  async save(stats: LX.MediaLibrary.PlayStat) {
    return await mediaLibraryRepository.mergePlayStat(stats)
  },
})

export default () => {
  // const updateMusicInfo = useCommit('list', 'updateMusicInfo')

  let updateTimeout: number | null = null
  let pendingSeekTime: number | null = null
  let pendingSeekStartedAt: number | null = null
  let pendingSeekRequestId = 0
  let resumeAfterPendingSeek = false

  let isScreenOn = true

  const getAnalyticsMusicInfo = (): LX.Music.MusicInfo | null => {
    const musicInfo = playerState.playMusicInfo.musicInfo
    if (!musicInfo) return null
    return 'progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo
  }

  const getPendingSeekStatusText = () => global.i18n.t('player__buffering')

  const clearPendingSeekState = ({ clearStatusText = false } = {}) => {
    pendingSeekTime = null
    pendingSeekStartedAt = null
    resumeAfterPendingSeek = false
    if (clearStatusText && playerState.statusText == getPendingSeekStatusText()) setStatusText('')
  }

  const commitPendingSeek = async(targetTime: number) => {
    const shouldResume = resumeAfterPendingSeek
    clearPendingSeekState({ clearStatusText: true })
    await setCurrentTime(targetTime)
    setNowPlayTime(targetTime)
    analyticsRecorder.updateProgress(targetTime, playerState.isPlay, true)
    if (shouldResume) await setPlay()
  }

  const startAnalyticsSession = () => {
    const musicInfo = getAnalyticsMusicInfo()
    const mediaLibraryInfo = musicInfo?.meta.mediaLibrary
    if (!musicInfo || !mediaLibraryInfo) return

    analyticsRecorder.startSession({
      aggregateSongId: mediaLibraryInfo.aggregateSongId,
      sourceItemId: mediaLibraryInfo.sourceItemId,
      durationSec: playerState.progress.maxPlayTime || 0,
    })

    if (playerState.progress.nowPlayTime > 0) {
      analyticsRecorder.updateProgress(playerState.progress.nowPlayTime, false, true)
    }
  }

  const getCurrentTime = () => {
    let id = playerState.musicInfo.id
    void getPosition().then(async position => {
      if (id != playerState.musicInfo.id) return

      if (pendingSeekTime != null) {
        const bufferedPosition = await getBufferedPosition().catch(() => 0)
        if (id != playerState.musicInfo.id) return

        const pendingSeekState = resolvePendingSeekState({
          pendingSeekTime,
          bufferedPosition,
          waitStartedAt: pendingSeekStartedAt,
          now: Date.now(),
        })
        if ((pendingSeekState.type == 'commit' || pendingSeekState.type == 'fallback') && pendingSeekState.targetTime != null) {
          await commitPendingSeek(pendingSeekState.targetTime)
          return
        }
        if (pendingSeekState.type == 'wait' && pendingSeekState.targetTime != null) {
          setNowPlayTime(pendingSeekState.targetTime)
          analyticsRecorder.updateProgress(pendingSeekState.targetTime, playerState.isPlay, true)
          setStatusText(getPendingSeekStatusText())
          return
        }
      }

      if (position == null || Number.isNaN(position) || id != playerState.musicInfo.id) return
      setNowPlayTime(position)
      analyticsRecorder.updateProgress(position, playerState.isPlay)
      if (!playerState.isPlay) return

      if (settingState.setting['player.isSavePlayTime'] && !playerState.playMusicInfo.isTempPlay && isScreenOn) {
        delaySavePlayInfo()
      }
    })
  }
  const getMaxTime = async() => {
    setMaxplayTime(await getDuration())

    if (playerState.playMusicInfo.musicInfo && 'source' in playerState.playMusicInfo.musicInfo && !playerState.playMusicInfo.musicInfo.interval) {
      // console.log(formatPlayTime2(playProgress.maxPlayTime))

      if (playerState.playMusicInfo.listId) {
        void updateListMusics([{
          id: playerState.playMusicInfo.listId,
          musicInfo: {
            ...playerState.playMusicInfo.musicInfo,
            interval: formatPlayTime2(playerState.progress.maxPlayTime),
          },
        }])
      }
    }
  }

  const clearUpdateTimeout = () => {
    if (!updateTimeout) return
    BackgroundTimer.clearInterval(updateTimeout)
    updateTimeout = null
  }
  const startUpdateTimeout = () => {
    if (!isScreenOn) return
    clearUpdateTimeout()
    updateTimeout = BackgroundTimer.setInterval(() => {
      getCurrentTime()
    }, 1000 / settingState.setting['player.playbackRate'])
    getCurrentTime()
  }

  const setProgress = (time: number, maxTime?: number) => {
    if (!playerState.musicInfo.id) return
    const requestId = ++pendingSeekRequestId
    const musicId = playerState.musicInfo.id
    const musicInfo = getAnalyticsMusicInfo()
    const duration = maxTime ?? playerState.progress.maxPlayTime
    const shouldResumePlayback = playerState.isPlay || resumeAfterPendingSeek
    // console.log('setProgress', time, maxTime)
    setNowPlayTime(time)
    analyticsRecorder.updateProgress(time, playerState.isPlay, true)
    if (maxTime != null) setMaxplayTime(maxTime)
    void (async() => {
      const bufferedPosition = await getBufferedPosition().catch(() => duration)
      if (requestId != pendingSeekRequestId || musicId != playerState.musicInfo.id) return

      if (shouldWaitForRemoteSeek({
        musicInfo,
        targetTime: time,
        bufferedPosition,
        duration,
      })) {
        pendingSeekTime = time
        pendingSeekStartedAt = Date.now()
        resumeAfterPendingSeek = shouldResumePlayback
        setStatusText(getPendingSeekStatusText())
        if (playerState.isPlay) await setPause()
        return
      }

      clearPendingSeekState({ clearStatusText: true })
      await setCurrentTime(time)
      if (shouldResumePlayback && !playerState.isPlay) await setPlay()
    })()

    // if (!isPlay) audio.play()
  }


  const handlePlay = () => {
    void getMaxTime().then(() => {
      startAnalyticsSession()
    })
    // prevProgressStatus = 'normal'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
    startUpdateTimeout()
  }
  const handlePause = () => {
    // prevProgressStatus = 'paused'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
    // clearBufferTimeout()
    if (pendingSeekTime != null) {
      startUpdateTimeout()
      return
    }
    clearUpdateTimeout()
  }

  const handleStop = () => {
    void analyticsRecorder.finishSession()
    clearPendingSeekState({ clearStatusText: true })
    clearUpdateTimeout()
    setNowPlayTime(0)
    setMaxplayTime(0)
    // prevProgressStatus = 'none'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
  }

  const handleError = () => {
    // if (!restorePlayTime) restorePlayTime = getCurrentTime() // 记录出错的播放时间
    // console.log('handleError')
    // prevProgressStatus = 'error'
    // handleSetTaskBarState(playProgress.progress, prevProgressStatus)
    void analyticsRecorder.finishSession()
    clearPendingSeekState()
    clearUpdateTimeout()
  }


  const handleSetPlayInfo = () => {
    void analyticsRecorder.finishSession()
    clearPendingSeekState({ clearStatusText: true })
    // restorePlayTime = playProgress.nowPlayTime
    // void setCurrentTime(playerState.progress.nowPlayTime)
    // setMaxplayTime(playProgress.maxPlayTime)
    handlePause()
    if (!playerState.playMusicInfo.isTempPlay) {
      void savePlayInfo({
        time: playerState.progress.nowPlayTime,
        maxTime: playerState.progress.maxPlayTime,
        listId: playerState.playMusicInfo.listId!,
        index: playerState.playInfo.playIndex,
      })
    }
  }

  // watch(() => playerState.progress.nowPlayTime, (newValue, oldValue) => {
  //   if (settingState.setting['player.isSavePlayTime'] && !playMusicInfo.isTempPlay) {
  //     delaySavePlayInfo({
  //       time: newValue,
  //       maxTime: playerState.progress.maxPlayTime,
  //       listId: playMusicInfo.listId as string,
  //       index: playInfo.playIndex,
  //     })
  //   }
  // })
  // watch(() => playerState.progress.maxPlayTime, maxPlayTime => {
  //   if (!playMusicInfo.isTempPlay) {
  //     delaySavePlayInfo({
  //       time: playerState.progress.nowPlayTime,
  //       maxTime: maxPlayTime,
  //       listId: playMusicInfo.listId as string,
  //       index: playInfo.playIndex,
  //     })
  //   }
  // })

  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys, settings) => {
    if (keys.includes('player.playbackRate')) startUpdateTimeout()
  }

  const handleScreenStateChanged: Parameters<typeof onScreenStateChange>[0] = (state) => {
    isScreenOn = state == 'ON'
    if (isScreenOn) {
      if (playerState.isPlay) startUpdateTimeout()
    } else clearUpdateTimeout()
  }

  // 修复在某些设备上屏幕状态改变事件未触发导致的进度条未更新的问题
  AppState.addEventListener('change', (state) => {
    if (state == 'active' && !isScreenOn) handleScreenStateChanged('ON')
  })

  global.app_event.on('play', handlePlay)
  global.app_event.on('pause', handlePause)
  global.app_event.on('stop', handleStop)
  global.app_event.on('error', handleError)
  global.app_event.on('setProgress', setProgress)
  // global.app_event.on(eventPlayerNames.restorePlay, handleRestorePlay)
  // global.app_event.on('playerLoadeddata', handleLoadeddata)
  // global.app_event.on('playerCanplay', handleCanplay)
  // global.app_event.on('playerWaiting', handleWating)
  // global.app_event.on('playerEmptied', handleEmpied)
  global.app_event.on('musicToggled', handleSetPlayInfo)
  global.state_event.on('configUpdated', handleConfigUpdated)

  onScreenStateChange(handleScreenStateChanged)
}
