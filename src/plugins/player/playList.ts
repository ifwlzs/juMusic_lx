import TrackPlayer, { RepeatMode, State } from 'react-native-track-player'
import BackgroundTimer from 'react-native-background-timer'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'


const list: LX.Player.Track[] = []

const defaultUserAgent = 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Mobile Safari/537.36'
const httpRxp = /^(https?:\/\/.+|\/.+)/

export const state = {
  isPlaying: false,
  prevDuration: -1,
}

const formatMusicInfo = (musicInfo: LX.Player.PlayMusic) => {
  return 'progress' in musicInfo ? {
    id: musicInfo.id,
    pic: musicInfo.metadata.musicInfo.meta.picUrl,
    name: musicInfo.metadata.musicInfo.name,
    singer: musicInfo.metadata.musicInfo.singer,
    album: musicInfo.metadata.musicInfo.meta.albumName,
  } : {
    id: musicInfo.id,
    pic: musicInfo.meta.picUrl,
    name: musicInfo.name,
    singer: musicInfo.singer,
    album: musicInfo.meta.albumName,
  }
}

const buildTracks = (musicInfo: LX.Player.PlayMusic, url?: LX.Player.Track['url'], duration?: LX.Player.Track['duration']): LX.Player.Track[] => {
  const mInfo = formatMusicInfo(musicInfo)
  const track = [] as LX.Player.Track[]
  const isShowNotificationImage = settingState.setting['player.isShowNotificationImage']
  const album = mInfo.album || undefined
  const artwork = isShowNotificationImage && mInfo.pic && httpRxp.test(mInfo.pic) ? mInfo.pic : undefined
  if (url) {
    track.push({
      id: `${mInfo.id}__//${Math.random()}__//${url}`,
      url,
      title: mInfo.name || 'Unknow',
      artist: mInfo.singer || 'Unknow',
      album,
      artwork,
      userAgent: defaultUserAgent,
      musicId: mInfo.id,
      duration,
    })
  }
  return track
  // console.log('buildTrack', musicInfo.name, url)
}
// const buildTrack = (musicInfo: LX.Player.PlayMusic, url: LX.Player.Track['url'], duration?: LX.Player.Track['duration']): LX.Player.Track => {
//   const mInfo = formatMusicInfo(musicInfo)
//   const isShowNotificationImage = settingState.setting['player.isShowNotificationImage']
//   const album = mInfo.album || undefined
//   const artwork = isShowNotificationImage && mInfo.pic && httpRxp.test(mInfo.pic) ? mInfo.pic : undefined
//   return url
//     ? {
//         id: `${mInfo.id}__//${Math.random()}__//${url}`,
//         url,
//         title: mInfo.name || 'Unknow',
//         artist: mInfo.singer || 'Unknow',
//         album,
//         artwork,
//         userAgent: defaultUserAgent,
//         musicId: `${mInfo.id}`,
//         original: { ...musicInfo },
//         duration,
//       }
//     : {
//         id: `${mInfo.id}__//${Math.random()}__//default`,
//         url: defaultUrl,
//         title: mInfo.name || 'Unknow',
//         artist: mInfo.singer || 'Unknow',
//         album,
//         artwork,
//         musicId: `${mInfo.id}`,
//         original: { ...musicInfo },
//         duration: 0,
//       }
// }

export const isTempTrack = (trackId: string) => /\/\/default$/.test(trackId)


export const getCurrentTrackId = async() => {
  const currentTrackIndex = await TrackPlayer.getCurrentTrack()
  if (currentTrackIndex == null) return
  const queue = await TrackPlayer.getQueue() as LX.Player.Track[]
  return queue[currentTrackIndex]?.id
}
export const getCurrentTrack = async() => {
  const currentTrackIndex = await TrackPlayer.getCurrentTrack()
  if (currentTrackIndex == null) return
  const queue = await TrackPlayer.getQueue() as LX.Player.Track[]
  return queue[currentTrackIndex]
}

export const updateMetaData = async(musicInfo: LX.Player.MusicInfo, isPlay: boolean, lyric?: string, force = false) => {
  if (!force && isPlay == state.isPlaying) {
    const duration = await TrackPlayer.getDuration()
    if (state.prevDuration != duration) {
      state.prevDuration = duration
      const trackInfo = await getCurrentTrack()
      if (trackInfo && musicInfo) {
        delayUpdateMusicInfo(musicInfo, lyric)
      }
    }
  } else {
    const [duration, trackInfo] = await Promise.all([TrackPlayer.getDuration(), getCurrentTrack()])
    state.prevDuration = duration
    if (trackInfo && musicInfo) {
      delayUpdateMusicInfo(musicInfo, lyric)
    }
  }
}

export const initTrackInfo = async(musicInfo: LX.Player.PlayMusic, mInfo: LX.Player.MusicInfo) => {
  delayUpdateMusicInfo(mInfo)
}


// 中文注释：原生 remove 会保留当前项，必须先选中新轨道，再清理旧项；每个异步边界都检查请求归属。
const handlePlayMusic = async(musicInfo: LX.Player.PlayMusic, url: string, time: number, isCurrentRequest: () => boolean) => {
  if (!isCurrentRequest()) return
  const tracks = buildTracks(musicInfo, url)
  const track = tracks[0]
  if (!track) return

  global.lx.suppressAutoAdvance = true
  try {
    await TrackPlayer.pause()
    if (!isCurrentRequest()) return
    await TrackPlayer.add([track])
    if (!isCurrentRequest()) return
    const queue = await TrackPlayer.getQueue() as LX.Player.Track[]
    if (!isCurrentRequest()) return
    const nextIndex = queue.findIndex(item => item.id === track.id)
    if (nextIndex < 0) throw new Error('player track missing after add')
    await TrackPlayer.skip(nextIndex)
    if (!isCurrentRequest()) return
    const previousIndexes = queue.flatMap((item, index) => item.id === track.id ? [] : [index])
    if (previousIndexes.length) await TrackPlayer.remove(previousIndexes)
    if (!isCurrentRequest()) return
    list.splice(0, list.length, track)
    await TrackPlayer.setRepeatMode(RepeatMode.Off)
    if (!isCurrentRequest()) return
    await TrackPlayer.setRate(settingState.setting['player.playbackRate'])
    if (!isCurrentRequest()) return
    if (time) await TrackPlayer.seekTo(time)
    if (!isCurrentRequest()) return
    // 中文注释：只发布原生实际选中的轨道，不能用目标 id 掩盖切换失败。
    const currentTrackId = await getCurrentTrackId()
    if (!isCurrentRequest()) return
    if (currentTrackId !== track.id) throw new Error('player track selection failed')
    global.lx.playerTrackId = currentTrackId
    if (global.lx.restorePlayInfo) {
      await TrackPlayer.pause()
      global.lx.restorePlayInfo = null
    } else {
      await TrackPlayer.play()
    }
  } finally {
    global.lx.suppressAutoAdvance = false
  }
}
let playPromise = Promise.resolve()
let actionId = Math.random()
export const playMusic = async(musicInfo: LX.Player.PlayMusic, url: string, time: number, isCurrentRequest: () => boolean = () => true) => {
  const id = actionId = Math.random()
  const playMusicInfo = playerState.playMusicInfo
  const isCurrent = () => id === actionId && playMusicInfo === playerState.playMusicInfo && musicInfo.id === playerState.playMusicInfo.musicInfo?.id && isCurrentRequest()
  // 中文注释：立即把新任务接入串行链，失败交给调用者处理，同时不阻塞后续歌曲的切换。
  const task = playPromise.then(async() => handlePlayMusic(musicInfo, url, time, isCurrent))
  playPromise = task.catch(() => {})
  return task
}

// let musicId = null
// let duration = 0
let prevArtwork: string | undefined
const updateMetaInfo = async(mInfo: LX.Player.MusicInfo, lyric?: string) => {
  console.log('updateMetaInfo', lyric)
  const isShowNotificationImage = settingState.setting['player.isShowNotificationImage']
  // const mInfo = formatMusicInfo(musicInfo)
  // console.log('+++++updateMusicPic+++++', track.artwork, track.duration)

  // if (track.musicId == musicId) {
  //   if (global.playInfo.musicInfo.img != null) artwork = global.playInfo.musicInfo.img
  //   if (track.duration != null) duration = global.playInfo.duration
  // } else {
  //   musicId = track.musicId
  //   artwork = global.playInfo.musicInfo.img
  //   duration = global.playInfo.duration || 0
  // }
  // console.log('+++++updateMetaInfo+++++', mInfo.name)
  state.isPlaying = await TrackPlayer.getState() == State.Playing
  let artwork = isShowNotificationImage ? mInfo.pic ?? prevArtwork : undefined
  if (mInfo.pic) prevArtwork = mInfo.pic
  let name: string
  let singer: string
  if (!state.isPlaying || lyric == null) {
    name = mInfo.name ?? 'Unknow'
    singer = mInfo.singer ?? 'Unknow'
  } else {
    name = lyric
    singer = `${mInfo.name}${mInfo.singer ? ` - ${mInfo.singer}` : ''}`
  }
  await TrackPlayer.updateNowPlayingMetadata({
    title: name,
    artist: singer,
    album: mInfo.album ?? undefined,
    artwork,
    duration: state.prevDuration || 0,
  }, state.isPlaying)
}


// 解决快速切歌导致的通知栏歌曲信息与当前播放歌曲对不上的问题
const debounceUpdateMetaInfoTools = {
  updateMetaPromise: Promise.resolve(),
  musicInfo: null as LX.Player.MusicInfo | null,
  debounce(fn: (musicInfo: LX.Player.MusicInfo, lyric?: string) => void | Promise<void>) {
    // let delayTimer = null
    let isDelayRun = false
    let timer: number | null = null
    let _musicInfo: LX.Player.MusicInfo | null = null
    let _lyric: string | undefined
    return (musicInfo: LX.Player.MusicInfo, lyric?: string) => {
      // console.log('debounceUpdateMetaInfoTools', musicInfo)
      if (timer) {
        BackgroundTimer.clearTimeout(timer)
        timer = null
      }
      // if (delayTimer) {
      //   BackgroundTimer.clearTimeout(delayTimer)
      //   delayTimer = null
      // }
      if (isDelayRun) {
        _musicInfo = musicInfo
        _lyric = lyric
        timer = BackgroundTimer.setTimeout(() => {
          timer = null
          let musicInfo = _musicInfo
          let lyric = _lyric
          _musicInfo = null
          _lyric = undefined
          if (!musicInfo) return
          // isDelayRun = false
          void fn(musicInfo, lyric)
        }, 500)
      } else {
        isDelayRun = true
        void fn(musicInfo, lyric)
        BackgroundTimer.setTimeout(() => {
          // delayTimer = null
          isDelayRun = false
        }, 500)
      }
    }
  },
  init() {
    return this.debounce(async(musicInfo: LX.Player.MusicInfo, lyric?: string) => {
      this.musicInfo = musicInfo
      return this.updateMetaPromise.then(() => {
        // console.log('run')
        if (this.musicInfo?.id === musicInfo.id) {
          this.updateMetaPromise = updateMetaInfo(musicInfo, lyric)
        }
      })
    })
  },
}

export const delayUpdateMusicInfo = debounceUpdateMetaInfoTools.init()

// export const delayUpdateMusicInfo = ((fn, delay = 800) => {
//   let delayTimer = null
//   let isDelayRun = false
//   let timer = null
//   let _track = null
//   return track => {
//     _track = track
//     if (timer) {
//       BackgroundTimer.clearTimeout(timer)
//       timer = null
//     }
//     if (isDelayRun) {
//       if (delayTimer) {
//         BackgroundTimer.clearTimeout(delayTimer)
//         delayTimer = null
//       }
//       timer = BackgroundTimer.setTimeout(() => {
//         timer = null
//         let track = _track
//         _track = null
//         isDelayRun = false
//         fn(track)
//       }, delay)
//     } else {
//       isDelayRun = true
//       fn(track)
//       delayTimer = BackgroundTimer.setTimeout(() => {
//         delayTimer = null
//         isDelayRun = false
//       }, 500)
//     }
//   }
// })(track => {
//   console.log('+++++delayUpdateMusicPic+++++', track.artwork)
//   updateMetaInfo(track)
// })
