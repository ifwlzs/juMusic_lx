import { StyleSheet, TouchableOpacity } from 'react-native'
import { navigations } from '@/navigation'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { scaleSizeH } from '@/utils/pixelRatio'
import commonState from '@/store/common/state'
import playerState from '@/store/player/state'
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import Image from '@/components/common/Image'
import { useCallback } from 'react'
import { setLoadErrorPicUrl, setMusicInfo } from '@/core/player/playInfo'

const PIC_HEIGHT = scaleSizeH(46)

const styles = StyleSheet.create({
  image: {
    width: PIC_HEIGHT,
    height: PIC_HEIGHT,
    borderRadius: 2,
  },
})

export default ({ isHome }: { isHome: boolean }) => {
  const musicInfo = usePlayerMusicInfo()
  const handlePress = () => {
    // console.log('')
    // console.log(playMusicInfo)
    if (!musicInfo.id) return
    const targetComponentId = isHome ? commonState.componentIds.home! : commonState.componentIds.songlistDetail!
    navigations.pushPlayDetailScreen(targetComponentId)

    // toast(global.i18n.t('play_detail_todo_tip'), 'long')
  }

  const handleLongPress = () => {
    const playMusicInfo = playerState.playMusicInfo.musicInfo
    const fullMusicInfo = playMusicInfo && 'progress' in playMusicInfo ? playMusicInfo.metadata.musicInfo : playMusicInfo
    const targetComponentId = isHome ? commonState.componentIds.home : commonState.componentIds.songlistDetail
    // 歌曲详情页需要标准歌曲对象；下载列表项要先还原到 metadata.musicInfo，展示态 musicInfo 只保留封面、歌名等字段。
    if (!musicInfo.id || !fullMusicInfo || !targetComponentId) return
    navigations.pushMusicDetailScreen(targetComponentId, {
      musicInfo: fullMusicInfo,
      sourceListId: playerState.playMusicInfo.listId,
    })
  }

  const handleError = useCallback((url: string | number) => {
    setLoadErrorPicUrl(url as string)
    setMusicInfo({
      pic: null,
    })
  }, [])

  return (
    <TouchableOpacity onLongPress={handleLongPress} onPress={handlePress} activeOpacity={0.7} >
      <Image url={musicInfo.pic} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_pic} style={styles.image} onError={handleError} />
    </TouchableOpacity>
  )
}


// const styles = StyleSheet.create({
//   playInfoImg: {

//   },
// })
