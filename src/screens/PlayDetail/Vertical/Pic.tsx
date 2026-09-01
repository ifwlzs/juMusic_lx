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
import { useStatusbarHeight } from '@/store/common/hook'
import commonState from '@/store/common/state'


export default ({ componentId }: { componentId: string }) => {
  const musicInfo = usePlayerMusicInfo()
  const { width: winWidth, height: winHeight } = useWindowSize()
  const statusBarHeight = useStatusbarHeight()

  const [animated, setAnimated] = useState(!!commonState.componentIds.playDetail)
  const [pic, setPic] = useState(musicInfo.pic)
  useEffect(() => {
    if (animated) setPic(musicInfo.pic)
  }, [musicInfo.pic, animated])

  useNavigationComponentDidAppear(componentId, () => {
    setAnimated(true)
  })
  // console.log('render pic')

  const { style, ringSize } = useMemo(() => {
    const imgWidth = Math.min(winWidth * 0.8, (winHeight - statusBarHeight - HEADER_HEIGHT) * 0.5)
    return {
      style: {
        width: imgWidth,
        height: imgWidth,
        borderRadius: 2,
      },
      // 中文注释：环形波纹需要比封面大一圈才能露在外沿，1.5 倍留出足够的起伏空间。
      ringSize: imgWidth * 1.5,
    }
  }, [statusBarHeight, winHeight, winWidth])

  return (
    <View style={styles.container}>
      {/* 中文注释：环形层不参与布局也不吃触摸，仅覆盖在封面外圈。 */}
      <View pointerEvents="none" style={[styles.ringLayer, { width: ringSize, height: ringSize }]}>
        <AudioVisualizer variant="ring" />
      </View>
      <View style={{ ...styles.content, elevation: animated ? 3 : 0 }}>
        <Image url={pic} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_pic} style={style} />
      </View>
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
  ringLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
