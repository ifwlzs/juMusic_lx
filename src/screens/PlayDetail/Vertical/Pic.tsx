import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
// import { useLayout } from '@/utils/hooks'
import { createStyle } from '@/utils/tools'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { useWindowSize } from '@/utils/hooks'
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import { useNavigationComponentDidAppear } from '@/navigation'
import { HEADER_HEIGHT } from './components/Header'
import Image from '@/components/common/Image'
import AudioVisualizer from '@/components/common/AudioVisualizer'
import SingleLineLyric from '../components/SingleLineLyric'
import { useSettingValue } from '@/store/setting/hook'
import { useStatusbarHeight } from '@/store/common/hook'
import commonState from '@/store/common/state'


export default ({ componentId, onPressLyric }: { componentId: string, onPressLyric?: () => void }) => {
  const musicInfo = usePlayerMusicInfo()
  const { width: winWidth, height: winHeight } = useWindowSize()
  const statusBarHeight = useStatusbarHeight()
  const visualizationEnable = useSettingValue('playDetail.audioVisualization.enable')
  const visualizationStyle = useSettingValue('playDetail.audioVisualization.style')

  const [animated, setAnimated] = useState(!!commonState.componentIds.playDetail)
  const [pic, setPic] = useState(musicInfo.pic)
  useEffect(() => {
    if (animated) setPic(musicInfo.pic)
  }, [musicInfo.pic, animated])

  useNavigationComponentDidAppear(componentId, () => {
    setAnimated(true)
  })
  // console.log('render pic')

  const showRing = visualizationEnable && visualizationStyle == 'ring'

  const { style, ringSize, lyricSpacing } = useMemo(() => {
    const imgWidth = Math.min(winWidth * 0.8, (winHeight - statusBarHeight - HEADER_HEIGHT) * 0.5)
    // 中文注释：环形波纹需要比封面大一圈才能露在外沿，1.5 倍留出足够的起伏空间。
    const ringSize = imgWidth * 1.5
    return {
      style: {
        width: imgWidth,
        height: imgWidth,
        borderRadius: 2,
      },
      ringSize,
      // 中文注释：环形样式下歌词必须避开波纹下半圈，否则文字会压在跳动的线条上。
      // 环形半径超出封面的部分是 (ringSize - imgWidth) / 2，再加一点余量当视觉留白。
      lyricSpacing: showRing ? (ringSize - imgWidth) / 2 + 12 : 16,
    }
  }, [showRing, statusBarHeight, winHeight, winWidth])

  return (
    <View style={styles.container}>
      {/* 中文注释：环形层锚定在封面自身而不是外层容器上。歌词加入布局流后会把封面
          向上挤，若环形仍以容器居中就不再套住封面，必须跟着封面一起移动。 */}
      <View style={styles.picWrap}>
        <View pointerEvents="none" style={[styles.ringLayer, { width: ringSize, height: ringSize }]}>
          <AudioVisualizer variant="ring" />
        </View>
        <View style={{ ...styles.content, elevation: animated ? 3 : 0 }}>
          <Image url={pic} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_pic} style={style} />
        </View>
      </View>
      <View style={{ height: lyricSpacing }} />
      <SingleLineLyric onPress={onPressLyric} />
    </View>
  )
}

const styles = createStyle({
  container: {
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor: 'rgba(0,0,0,0.1)',
  },
  content: {
    // elevation: 3,
    backgroundColor: 'rgba(0,0,0,0)',
    borderRadius: 4,
  },
  picWrap: {
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
