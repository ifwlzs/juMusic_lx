import { memo } from 'react'
import { View } from 'react-native'

// import Title from './components/Title'
import { createStyle } from '@/utils/tools'
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import PlayInfo from './PlayInfo'
import ControlBtn from './ControlBtn'
import AudioVisualizer from '@/components/common/AudioVisualizer'
import { marginLeftRaw } from '../constant'


export default memo(() => {
  return (
    <View style={styles.container} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_player}>
      {/* 中文注释：横屏空间更紧，频谱柱压低高度放在控制按钮上方。 */}
      <AudioVisualizer variant="bars" style={styles.visualizer} />
      <ControlBtn />
      <PlayInfo />
    </View>
  )
})

const styles = createStyle({
  container: {
    flexShrink: 0,
    flexGrow: 1,
    marginLeft: marginLeftRaw,
    // paddingRight: 15,
    // backgroundColor: 'rgba(0,0,0,0.1)',
  },
  visualizer: {
    height: 30,
    marginBottom: 2,
  },
})
