import { isInitialized, initial as playerInitial, setPause, setPlay, setResource, setStop, initTrackInfo } from '@/plugins/player'
import { getCurrentTrack } from '@/plugins/player/playList'
import {
  setStatusText,
} from '@/core/player/playStatus'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import {
  getList,
  setPlayMusicInfo,
  setMusicInfo,
  setPlayListId,
} from '@/core/player/playInfo'
import {
  clearPlayedList,
  addPlayedList,
  removePlayedList,
} from '@/core/player/playedList'
import {
  clearTempPlayeList,
  removeTempPlayList,
} from '@/core/player/tempPlayList'
import { getMusicUrl, getPicPath, getLyricInfo } from '@/core/music'
import { requestMsg } from '@/utils/message'
import { getRandom } from '@/utils/common'
import { filterList } from './utils'
import BackgroundTimer from 'react-native-background-timer'
import { checkIgnoringBatteryOptimization, checkNotificationPermission, debounceBackgroundTimer } from '@/utils/tools'
import { LIST_IDS } from '@/config/constant'
import { addListMusics, removeListMusics } from '@/core/list'
import { addDislikeInfo } from '@/core/dislikeList'
import { playbackAnalyticsRuntime } from '@/core/mediaLibrary/playbackAnalyticsRuntime'

// import { checkMusicFileAvailable } from '@renderer/utils/music'

const createDelayNextTimeout = (delay: number) => {
  let timeout: number | null
  const clearDelayNextTimeout = () => {
    // console.log(this.timeout)
    if (timeout) {
      BackgroundTimer.clearTimeout(timeout)
      timeout = null
    }
  }

  const addDelayNextTimeout = () => {
    clearDelayNextTimeout()
    timeout = BackgroundTimer.setTimeout(() => {
      timeout = null
      if (global.lx.isPlayedStop) return
      console.log('delay next timeout timeout', delay)
      void playNext(true)
    }, delay)
  }

  return {
    clearDelayNextTimeout,
    addDelayNextTimeout,
  }
}
const { addDelayNextTimeout, clearDelayNextTimeout } = createDelayNextTimeout(5000)
const { addDelayNextTimeout: addLoadTimeout, clearDelayNextTimeout: clearLoadTimeout } = createDelayNextTimeout(100000)

const resolveListTypeSnapshot = (listId: string | null): LX.MediaLibrary.PlaybackListType => {
  if (!listId) return 'unknown'
  if (listId === LIST_IDS.DEFAULT) return 'default'
  if (listId === LIST_IDS.LOVE) return 'love'
  if (listId === LIST_IDS.TEMP || listId === LIST_IDS.PLAY_LATER) return 'temp'
  return 'unknown'
}

const createGettingUrlId = (musicInfo: LX.Music.MusicInfo | LX.Download.ListItem) => {
  const tInfo = 'progress' in musicInfo ? musicInfo.metadata.musicInfo.meta.toggleMusicInfo : musicInfo.meta.toggleMusicInfo
  return `${musicInfo.id}_${tInfo?.id ?? ''}`
}
// 中文注释：请求号区分同曲刷新，选曲快照区分 A → B → A；旧曲的 Playing 状态不能使新请求失效。
let musicUrlRequestId = 0
let loadingPlayMusicInfo: typeof playerState.playMusicInfo | null = null
// 中文注释：播放意图覆盖初始化、暂停和防抖等待，stop 必须连尚未开始取链的任务一起取消。
let playIntentId = 0

let cancelDelayRetry: (() => void) | null = null
const delayRetry = async(musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, isRefresh: boolean, isCurrentRequest: () => boolean): Promise<string | null> => {
  // if (cancelDelayRetry) cancelDelayRetry()
  return new Promise<string | null>((resolve, reject) => {
    const time = getRandom(2, 6)
    setStatusText(global.i18n.t('player__getting_url_delay_retry', { time }))
    const tiemout = setTimeout(() => {
      getMusicPlayUrl(musicInfo, isRefresh, isCurrentRequest, true).then((result) => {
        if (cancelDelayRetry === cancel) cancelDelayRetry = null
        resolve(result)
      }).catch(async(err: any) => {
        if (cancelDelayRetry === cancel) cancelDelayRetry = null
        reject(err)
      })
    }, time * 1000)
    const cancel = () => {
      clearTimeout(tiemout)
      if (cancelDelayRetry === cancel) cancelDelayRetry = null
      resolve(null)
    }
    cancelDelayRetry = cancel
  })
}
const getMusicPlayUrl = async(musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, isRefresh: boolean, isCurrentRequest: () => boolean, isRetryed = false): Promise<string | null> => {
  // 中文注释：重试与换源也属于原请求，过期后不得再启动网络请求或覆盖新歌的状态。
  if (!isCurrentRequest()) return null
  // this.musicInfo.url = await getMusicPlayUrl(targetSong, type)
  setStatusText(global.i18n.t('player__getting_url'))
  addLoadTimeout()

  // const type = getPlayType(settingState.setting['player.isPlayHighQuality'], musicInfo)
  let toggleMusicInfo = ('progress' in musicInfo ? musicInfo.metadata.musicInfo : musicInfo).meta.toggleMusicInfo

  return (toggleMusicInfo ? getMusicUrl({
    musicInfo: toggleMusicInfo,
    isRefresh,
    allowToggleSource: false,
  }) : Promise.reject(new Error('not found'))).catch(async() => {
    if (!isCurrentRequest()) return null
    return getMusicUrl({
      musicInfo,
      isRefresh,
      onToggleSource(mInfo) {
        if (!isCurrentRequest()) return
        setStatusText(global.i18n.t('toggle_source_try'))
      },
    })
  }).then(url => {
    if (!isCurrentRequest()) return null

    return url
  }).catch(async err => {
    // console.log('err', err.message)
    if (!isCurrentRequest() ||
      err.message == requestMsg.cancelRequest) return null

    if (err.message == requestMsg.tooManyRequests) return delayRetry(musicInfo, isRefresh, isCurrentRequest)

    if (!isRetryed) return getMusicPlayUrl(musicInfo, isRefresh, isCurrentRequest, true)

    throw err
  })
}

export const setMusicUrl = (musicInfo: LX.Music.MusicInfo | LX.Download.ListItem, isRefresh?: boolean) => {
  const playMusicInfo = playerState.playMusicInfo
  if (musicInfo.id != playMusicInfo.musicInfo?.id) return
  const gettingUrlId = createGettingUrlId(musicInfo)
  if (!isRefresh && loadingPlayMusicInfo === playMusicInfo && global.lx.gettingUrlId === gettingUrlId) return
  if (cancelDelayRetry) cancelDelayRetry()
  const requestId = ++musicUrlRequestId
  loadingPlayMusicInfo = playMusicInfo
  global.lx.gettingUrlId = gettingUrlId
  // 中文注释：守卫一直传到原生开播，不能在 URL 返回后仅靠歌曲 id 判断过期任务。
  const isCurrentRequest = () => requestId === musicUrlRequestId && playMusicInfo === playerState.playMusicInfo && !global.lx.isPlayedStop
  void getMusicPlayUrl(musicInfo, !!isRefresh, isCurrentRequest).then(async(url) => {
    if (!url || !isCurrentRequest()) return
    await setResource(musicInfo, url, 0, isCurrentRequest)
  }).catch((err: any) => {
    if (!isCurrentRequest()) return
    console.log(err)
    setStatusText(err.message as string)
    global.app_event.error()
    addDelayNextTimeout()
  }).finally(() => {
    if (requestId === musicUrlRequestId) {
      loadingPlayMusicInfo = null
      global.lx.gettingUrlId = ''
      clearLoadTimeout()
    }
  })
}

// 恢复上次播放的状态
const handleRestorePlay = async(restorePlayInfo: LX.Player.SavedPlayInfo) => {
  const musicInfo = playerState.playMusicInfo.musicInfo
  if (!musicInfo) return

  setTimeout(() => {
    global.app_event.setProgress(settingState.setting['player.isSavePlayTime'] ? restorePlayInfo.time : 0, restorePlayInfo.maxTime)
  })

  const playMusicInfo = playerState.playMusicInfo

  void initTrackInfo(musicInfo, playerState.musicInfo)
  setMusicUrl(musicInfo)

  // 中文注释：守卫必须实时读 playerState.playMusicInfo，不能用上面捕获的 playMusicInfo 快照。
  // setPlayMusicInfo 是整体替换 state.playMusicInfo 对象，所以快照的 .musicInfo 永远指向
  // 恢复时那一首，`musicInfo.id != playMusicInfo.musicInfo?.id` 两边同源、恒为 false，
  // 等于没有守卫。webdav/smb/onedrive 的封面与歌词要先把整首歌下载到本地才能读内嵌数据，
  // 网络慢时耗时数秒，期间用户切歌就会被旧回调把封面歌词覆盖成上一首的。
  void getPicPath({ musicInfo, listId: playMusicInfo.listId }).then((url: string) => {
    if (
      musicInfo.id != playerState.playMusicInfo.musicInfo?.id ||
      playerState.musicInfo.pic == url ||
      playerState.loadErrorPicUrl == url
    ) return
    setMusicInfo({ pic: url })
    global.app_event.picUpdated()
  })

  void getLyricInfo({ musicInfo }).then((lyricInfo) => {
    if (musicInfo.id != playerState.playMusicInfo.musicInfo?.id) return
    setMusicInfo({
      lrc: lyricInfo.lyric,
      tlrc: lyricInfo.tlyric,
      lxlrc: lyricInfo.lxlyric,
      rlrc: lyricInfo.rlyric,
      rawlrc: lyricInfo.rawlrcInfo.lyric,
    })
    global.app_event.lyricUpdated()
  }).catch((err) => {
    console.log(err)
    if (musicInfo.id != playerState.playMusicInfo.musicInfo?.id) return
    setStatusText(global.i18n.t('lyric__load_error'))
  })

  if (settingState.setting['player.togglePlayMethod'] == 'random' && !playMusicInfo.isTempPlay) addPlayedList(playMusicInfo as LX.Player.PlayMusicInfo)
}


const playCurrentMusic = (musicInfo: LX.Player.PlayMusic, isCurrentIntent: () => boolean) => {
  if (!isCurrentIntent()) return
  setMusicUrl(musicInfo)

  void getPicPath({ musicInfo, listId: playerState.playMusicInfo.listId }).then((url: string) => {
    if (
      musicInfo.id != playerState.playMusicInfo.musicInfo?.id ||
      playerState.musicInfo.pic == url ||
      playerState.loadErrorPicUrl == url) return
    setMusicInfo({ pic: url })
    global.app_event.picUpdated()
  })

  void getLyricInfo({ musicInfo }).then((lyricInfo) => {
    if (musicInfo.id != playerState.playMusicInfo.musicInfo?.id) return
    setMusicInfo({
      lrc: lyricInfo.lyric,
      tlrc: lyricInfo.tlyric,
      lxlrc: lyricInfo.lxlyric,
      rlrc: lyricInfo.rlyric,
      rawlrc: lyricInfo.rawlrcInfo.lyric,
    })
    global.app_event.lyricUpdated()
  }).catch((err) => {
    console.log(err)
    if (musicInfo.id != playerState.playMusicInfo.musicInfo?.id) return
    setStatusText(global.i18n.t('lyric__load_error'))
  })
}

const debouncePlay = debounceBackgroundTimer((musicInfo: LX.Player.PlayMusic, isCurrentIntent: () => boolean) => {
  playCurrentMusic(musicInfo, isCurrentIntent)
}, 200)

const handlePlay = async({ immediate = false } = {}) => {
  const intentId = ++playIntentId
  const playMusicInfo = playerState.playMusicInfo
  const isCurrentIntent = () => intentId === playIntentId && playMusicInfo === playerState.playMusicInfo
  if (!isInitialized()) {
    await checkNotificationPermission()
    void checkIgnoringBatteryOptimization()
    await playerInitial({
      volume: settingState.setting['player.volume'],
      playRate: settingState.setting['player.playbackRate'],
      cacheSize: settingState.setting['player.cacheSize'] ? parseInt(settingState.setting['player.cacheSize']) : 0,
      isHandleAudioFocus: settingState.setting['player.isHandleAudioFocus'],
      isEnableAudioOffload: settingState.setting['player.isEnableAudioOffload'],
    })
  }

  if (!isCurrentIntent()) return
  global.lx.isPlayedStop &&= false
  resetRandomNextMusicInfo()

  if (global.lx.restorePlayInfo) {
    void handleRestorePlay(global.lx.restorePlayInfo)
    global.lx.restorePlayInfo = null
    return
  }

  const musicInfo = playMusicInfo.musicInfo

  if (!musicInfo) return

  if (!immediate) {
    global.lx.suppressAutoAdvance = true
    try {
      await setStop()
    } finally {
      global.lx.suppressAutoAdvance = false
    }
    global.app_event.pause()
  } else {
    // 中文注释：手动下一首等待 WebDAV 下载时先暂停旧曲；不调用 stop/seek，避免曲终重播旧资源。
    await setPause()
    global.app_event.pause()
  }
  if (!isCurrentIntent()) return

  clearDelayNextTimeout()
  clearLoadTimeout()


  if (settingState.setting['player.togglePlayMethod'] == 'random' && !playMusicInfo.isTempPlay) addPlayedList(playMusicInfo as LX.Player.PlayMusicInfo)

  if (immediate) playCurrentMusic(musicInfo, isCurrentIntent)
  else debouncePlay(musicInfo, isCurrentIntent)
}

/**
 * 播放列表内歌曲
 * @param listId 列表id
 * @param id 歌曲id
 */
export const playListById = async(
  listId: string,
  id: string,
  options: {
    entrySource?: LX.MediaLibrary.PlaybackEntrySource
    listTypeSnapshot?: LX.MediaLibrary.PlaybackListType
  } = {},
) => {
  const prevListId = playerState.playInfo.playerListId
  setPlayListId(listId)
  const musicInfo = getList(listId).find(m => m.id == id)
  if (!musicInfo) return
  if (options.entrySource) {
    playbackAnalyticsRuntime.setPendingEntryContext({
      entrySource: options.entrySource,
      listIdSnapshot: listId,
      listTypeSnapshot: options.listTypeSnapshot || resolveListTypeSnapshot(listId),
    })
  } else {
    playbackAnalyticsRuntime.setPendingEntryContext({
      entrySource: 'list_click',
      listIdSnapshot: listId,
      listTypeSnapshot: options.listTypeSnapshot || resolveListTypeSnapshot(listId),
    })
  }
  if (playerState.playMusicInfo.musicInfo && playerState.playMusicInfo.musicInfo.id !== id) {
    playbackAnalyticsRuntime.setPendingEndReason('switch_music')
  }
  setPlayMusicInfo(listId, musicInfo)
  if (settingState.setting['player.isAutoCleanPlayedList'] || prevListId != listId) clearPlayedList()
  clearTempPlayeList()
  await handlePlay()
}

/**
 * 播放列表内歌曲
 * @param listId 列表id
 * @param index 播放的歌曲位置
 */
export const playList = async(
  listId: string,
  index: number,
  options: {
    entrySource?: LX.MediaLibrary.PlaybackEntrySource
    listTypeSnapshot?: LX.MediaLibrary.PlaybackListType
  } = {},
) => {
  const prevListId = playerState.playInfo.playerListId
  setPlayListId(listId)
  const targetMusic = getList(listId)[index]
  if (!targetMusic) return
  if (options.entrySource) {
    playbackAnalyticsRuntime.setPendingEntryContext({
      entrySource: options.entrySource,
      listIdSnapshot: listId,
      listTypeSnapshot: options.listTypeSnapshot || resolveListTypeSnapshot(listId),
    })
  } else {
    playbackAnalyticsRuntime.setPendingEntryContext({
      entrySource: 'list_click',
      listIdSnapshot: listId,
      listTypeSnapshot: options.listTypeSnapshot || resolveListTypeSnapshot(listId),
    })
  }
  if (playerState.playMusicInfo.musicInfo && playerState.playMusicInfo.musicInfo.id !== targetMusic.id) {
    playbackAnalyticsRuntime.setPendingEndReason('switch_music')
  }
  setPlayMusicInfo(listId, targetMusic)
  if (settingState.setting['player.isAutoCleanPlayedList'] || prevListId != listId) clearPlayedList()
  clearTempPlayeList()
  await handlePlay()
}

const handleToggleStop = async() => {
  await stop()
  setTimeout(() => {
    setPlayMusicInfo(null, null)
  })
}


const randomNextMusicInfo = {
  info: null as LX.Player.PlayMusicInfo | null,
  // index: -1,
}
export const resetRandomNextMusicInfo = () => {
  if (randomNextMusicInfo.info) {
    randomNextMusicInfo.info = null
    // randomNextMusicInfo.index = -1
  }
}

export const getNextPlayMusicInfo = async(): Promise<LX.Player.PlayMusicInfo | null> => {
  if (playerState.tempPlayList.length) { // 如果稍后播放列表存在歌曲则直接播放改列表的歌曲
    const playMusicInfo = playerState.tempPlayList[0]
    return playMusicInfo
  }

  if (playerState.playMusicInfo.musicInfo == null) return null

  if (randomNextMusicInfo.info) return randomNextMusicInfo.info

  const playMusicInfo = playerState.playMusicInfo
  const playInfo = playerState.playInfo
  // console.log(playInfo.playerListId)
  const currentListId = playInfo.playerListId
  if (!currentListId) return null
  const currentList = getList(currentListId)

  const playedList = playerState.playedList
  if (playedList.length) { // 移除已播放列表内不存在原列表的歌曲
    let currentId: string
    if (playMusicInfo.isTempPlay) {
      const musicInfo = currentList[playInfo.playerPlayIndex]
      if (musicInfo) currentId = musicInfo.id
    } else {
      currentId = playMusicInfo.musicInfo!.id
    }
    // 从已播放列表移除播放列表已删除的歌曲
    let index
    for (index = playedList.findIndex(m => m.musicInfo.id === currentId) + 1; index < playedList.length; index++) {
      const playMusicInfo = playedList[index]
      const currentId = playMusicInfo.musicInfo.id
      if (playMusicInfo.listId == currentListId && !currentList.some(m => m.id === currentId)) {
        removePlayedList(index)
        continue
      }
      break
    }

    if (index < playedList.length) return playedList[index]
  }
  // const isCheckFile = findNum > 2 // 针对下载列表，如果超过两次都碰到无效歌曲，则过滤整个列表内的无效歌曲
  let { filteredList, playerIndex } = await filterList({ // 过滤已播放歌曲
    listId: currentListId,
    list: currentList,
    playedList,
    playerMusicInfo: currentList[playInfo.playerPlayIndex],
    isNext: true,
  })

  if (!filteredList.length) return null
  // let currentIndex: number = filteredList.indexOf(currentList[playInfo.playerPlayIndex])
  if (playerIndex == -1 && filteredList.length) playerIndex = 0
  let nextIndex = playerIndex

  let togglePlayMethod = settingState.setting['player.togglePlayMethod']
  switch (togglePlayMethod) {
    case 'listLoop':
      nextIndex = playerIndex === filteredList.length - 1 ? 0 : playerIndex + 1
      break
    case 'random':
      nextIndex = getRandom(0, filteredList.length)
      break
    case 'list':
      nextIndex = playerIndex === filteredList.length - 1 ? -1 : playerIndex + 1
      break
    case 'singleLoop':
      break
    default:
      return null
  }
  if (nextIndex < 0) return null

  const nextPlayMusicInfo = {
    musicInfo: filteredList[nextIndex],
    listId: currentListId,
    isTempPlay: false,
  }

  if (togglePlayMethod == 'random') {
    randomNextMusicInfo.info = nextPlayMusicInfo
    // randomNextMusicInfo.index = nextIndex
  }
  return nextPlayMusicInfo
}

const handlePlayNext = async(playMusicInfo: LX.Player.PlayMusicInfo) => {
  setPlayMusicInfo(playMusicInfo.listId, playMusicInfo.musicInfo, playMusicInfo.isTempPlay, playMusicInfo.analyticsContext)
  await handlePlay({ immediate: true })
}
/**
 * 下一曲
 * @param isAutoToggle 是否自动切换
 * @returns
 */
let lastAutoNextAt = 0
export const playNext = async(isAutoToggle = false): Promise<void> => {
  if (isAutoToggle) {
    const now = Date.now()
    if (now - lastAutoNextAt < 800) return
    lastAutoNextAt = now
  }
  if (!isAutoToggle) playbackAnalyticsRuntime.setPendingEndReason('manual_next')
  if (playerState.tempPlayList.length) { // 如果稍后播放列表存在歌曲则直接播放改列表的歌曲
    const playMusicInfo = playerState.tempPlayList[0]
    const analyticsContext = playMusicInfo.analyticsContext || {}
    playbackAnalyticsRuntime.setPendingEntryContext({
      entrySource: analyticsContext.entrySource || 'temp_play',
      listIdSnapshot: analyticsContext.listIdSnapshot ?? playMusicInfo.listId ?? null,
      listTypeSnapshot: analyticsContext.listTypeSnapshot || 'temp',
    })
    removeTempPlayList(0)
    await handlePlayNext(playMusicInfo)
    return
  }

  const playMusicInfo = playerState.playMusicInfo
  const playInfo = playerState.playInfo
  if (playMusicInfo.musicInfo == null) return handleToggleStop()

  // console.log(playInfo.playerListId)
  const currentListId = playInfo.playerListId
  if (!currentListId) return handleToggleStop()
  if (isAutoToggle) {
    playbackAnalyticsRuntime.setPendingEntryContext({
      entrySource: 'auto_next',
      listIdSnapshot: currentListId,
      listTypeSnapshot: resolveListTypeSnapshot(currentListId),
    })
  } else {
    playbackAnalyticsRuntime.setPendingEntryContext({
      entrySource: 'manual_next_prev',
      listIdSnapshot: currentListId,
      listTypeSnapshot: resolveListTypeSnapshot(currentListId),
    })
  }
  const currentList = getList(currentListId)

  const playedList = playerState.playedList

  if (playedList.length) { // 移除已播放列表内不存在原列表的歌曲
    let currentId: string
    if (playMusicInfo.isTempPlay) {
      const musicInfo = currentList[playInfo.playerPlayIndex]
      if (musicInfo) currentId = musicInfo.id
    } else {
      currentId = playMusicInfo.musicInfo.id
    }
    // 从已播放列表移除播放列表已删除的歌曲
    let index
    for (index = playedList.findIndex(m => m.musicInfo.id === currentId) + 1; index < playedList.length; index++) {
      const playMusicInfo = playedList[index]
      const currentId = playMusicInfo.musicInfo.id
      if (playMusicInfo.listId == currentListId && !currentList.some(m => m.id === currentId)) {
        removePlayedList(index)
        continue
      }
      break
    }

    if (index < playedList.length) {
      await handlePlayNext(playedList[index])
      return
    }
  }
  if (randomNextMusicInfo.info) {
    await handlePlayNext(randomNextMusicInfo.info)
    return
  }
  // const isCheckFile = findNum > 2 // 针对下载列表，如果超过两次都碰到无效歌曲，则过滤整个列表内的无效歌曲
  let { filteredList, playerIndex } = await filterList({ // 过滤已播放歌曲
    listId: currentListId,
    list: currentList,
    playedList,
    playerMusicInfo: currentList[playInfo.playerPlayIndex],
    isNext: true,
  })

  if (!filteredList.length) return handleToggleStop()
  // let currentIndex: number = filteredList.indexOf(currentList[playInfo.playerPlayIndex])
  if (playerIndex == -1 && filteredList.length) playerIndex = 0
  let nextIndex = playerIndex

  let togglePlayMethod = settingState.setting['player.togglePlayMethod']
  if (!isAutoToggle) {
    switch (togglePlayMethod) {
      case 'list':
      case 'singleLoop':
      case 'none':
        togglePlayMethod = 'listLoop'
    }
  }
  switch (togglePlayMethod) {
    case 'listLoop':
      nextIndex = playerIndex === filteredList.length - 1 ? 0 : playerIndex + 1
      break
    case 'random':
      nextIndex = getRandom(0, filteredList.length)
      break
    case 'list':
      nextIndex = playerIndex === filteredList.length - 1 ? -1 : playerIndex + 1
      break
    case 'singleLoop':
      break
    default:
      nextIndex = -1
      return
  }
  if (nextIndex < 0) return

  await handlePlayNext({
    musicInfo: filteredList[nextIndex],
    listId: currentListId,
    isTempPlay: false,
  })
}

/**
 * 上一曲
 */
export const playPrev = async(isAutoToggle = false): Promise<void> => {
  if (!isAutoToggle) playbackAnalyticsRuntime.setPendingEndReason('manual_prev')
  const playMusicInfo = playerState.playMusicInfo
  if (playMusicInfo.musicInfo == null) return handleToggleStop()
  const playInfo = playerState.playInfo

  const currentListId = playInfo.playerListId
  if (!currentListId) return handleToggleStop()
  playbackAnalyticsRuntime.setPendingEntryContext({
    entrySource: 'manual_next_prev',
    listIdSnapshot: currentListId,
    listTypeSnapshot: resolveListTypeSnapshot(currentListId),
  })
  const currentList = getList(currentListId)

  const playedList = playerState.playedList
  if (playedList.length) {
    let currentId: string
    if (playMusicInfo.isTempPlay) {
      const musicInfo = currentList[playInfo.playerPlayIndex]
      if (musicInfo) currentId = musicInfo.id
    } else {
      currentId = playMusicInfo.musicInfo.id
    }
    // 从已播放列表移除播放列表已删除的歌曲
    let index
    for (index = playedList.findIndex(m => m.musicInfo.id === currentId) - 1; index > -1; index--) {
      const playMusicInfo = playedList[index]
      const currentId = playMusicInfo.musicInfo.id
      if (playMusicInfo.listId == currentListId && !currentList.some(m => m.id === currentId)) {
        removePlayedList(index)
        continue
      }
      break
    }

    if (index > -1) {
      await handlePlayNext(playedList[index])
      return
    }
  }

  // const isCheckFile = findNum > 2
  let { filteredList, playerIndex } = await filterList({ // 过滤已播放歌曲
    listId: currentListId,
    list: currentList,
    playedList,
    playerMusicInfo: currentList[playInfo.playerPlayIndex],
    isNext: false,
  })
  if (!filteredList.length) return handleToggleStop()

  // let currentIndex = filteredList.indexOf(currentList[playInfo.playerPlayIndex])
  if (playerIndex == -1 && filteredList.length) playerIndex = 0
  let nextIndex = playerIndex
  if (!playMusicInfo.isTempPlay) {
    let togglePlayMethod = settingState.setting['player.togglePlayMethod']
    if (!isAutoToggle) {
      switch (togglePlayMethod) {
        case 'list':
        case 'singleLoop':
        case 'none':
          togglePlayMethod = 'listLoop'
      }
    }
    switch (togglePlayMethod) {
      case 'random':
        nextIndex = getRandom(0, filteredList.length)
        break
      case 'listLoop':
      case 'list':
        nextIndex = playerIndex === 0 ? filteredList.length - 1 : playerIndex - 1
        break
      case 'singleLoop':
        break
      default:
        nextIndex = -1
        return
    }
    if (nextIndex < 0) return
  }


  await handlePlayNext({
    musicInfo: filteredList[nextIndex],
    listId: currentListId,
    isTempPlay: false,
  })
}

/**
 * 恢复播放
 */
export const play = () => {
  const playMusicInfo = playerState.playMusicInfo
  const musicInfo = playMusicInfo.musicInfo
  if (!musicInfo || global.lx.gettingUrlId) return
  const intentId = playIntentId
  // 中文注释：停止下载后队列可能仍保留 A，而应用选中 B；恢复时必须核对原生资源归属。
  void getCurrentTrack().then(async(track) => {
    if (intentId !== playIntentId || playMusicInfo !== playerState.playMusicInfo || global.lx.gettingUrlId) return
    if (track?.musicId !== musicInfo.id) setMusicUrl(musicInfo)
    else await setPlay()
  }).catch((err: Error) => {
    if (intentId === playIntentId && playMusicInfo === playerState.playMusicInfo) setStatusText(err.message)
  })
}

/**
 * 暂停播放
 */
export const pause = async() => {
  // 中文注释：暂停优先于尚未完成的恢复播放核对，避免迟到的原生查询重新起播。
  playIntentId++
  await setPause()
}

/**
 * 停止播放
 */
export const stop = async() => {
  playbackAnalyticsRuntime.setPendingEndReason('manual_stop')
  // 中文注释：停止也结束当前加载意图，迟到的 WebDAV 下载和排队中的原生任务不能重新起播。
  musicUrlRequestId++
  playIntentId++
  loadingPlayMusicInfo = null
  global.lx.gettingUrlId = ''
  if (cancelDelayRetry) cancelDelayRetry()
  clearLoadTimeout()
  clearDelayNextTimeout()
  global.lx.suppressAutoAdvance = true
  try {
    await setStop()
  } finally {
    global.lx.suppressAutoAdvance = false
  }
  setTimeout(() => {
    global.app_event.stop()
  })
}

/**
 * 播放、暂停播放切换
 */
export const togglePlay = () => {
  global.lx.isPlayedStop &&= false
  if (playerState.isPlay) {
    void pause()
  } else {
    play()
  }
}

/**
 * 收藏当前播放的歌曲
 */
export const collectMusic = () => {
  if (!playerState.playMusicInfo.musicInfo) return
  void addListMusics(LIST_IDS.LOVE, [
    'progress' in playerState.playMusicInfo.musicInfo
      ? playerState.playMusicInfo.musicInfo.metadata.musicInfo
      : playerState.playMusicInfo.musicInfo,
  ], settingState.setting['list.addMusicLocationType'])
}

/**
 * 取消收藏当前播放的歌曲
 */
export const uncollectMusic = () => {
  if (!playerState.playMusicInfo.musicInfo) return
  void removeListMusics(LIST_IDS.LOVE, [
    'progress' in playerState.playMusicInfo.musicInfo
      ? playerState.playMusicInfo.musicInfo.metadata.musicInfo.id
      : playerState.playMusicInfo.musicInfo.id,
  ])
}

/**
 * 不喜欢当前播放的歌曲
 */
export const dislikeMusic = async() => {
  if (!playerState.playMusicInfo.musicInfo) return
  const minfo = 'progress' in playerState.playMusicInfo.musicInfo ? playerState.playMusicInfo.musicInfo.metadata.musicInfo : playerState.playMusicInfo.musicInfo
  await addDislikeInfo([{ name: minfo.name, singer: minfo.singer }])
  await playNext(true)
}

