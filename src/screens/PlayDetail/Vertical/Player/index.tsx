import { memo } from 'react'
import { View } from 'react-native'

// import Title from './components/Title'
import MoreBtn from './components/MoreBtn'
import PlayInfo from './components/PlayInfo'
import ControlBtn from './components/ControlBtn'
import AudioVisualizer from '@/components/common/AudioVisualizer'
import { createStyle } from '@/utils/tools'
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'


export default memo(() => {
  return (
    <View style={styles.container} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_player}>
      {/* 中文注释：频谱柱放在进度条上方，对应 PC 版播放详情页频谱柱的位置关系。 */}
      <AudioVisualizer variant="bars" style={styles.visualizer} />
      <PlayInfo />
      <ControlBtn />
      <MoreBtn />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 0,
    width: '100%',
    // paddingTop: progressContentPadding,
    // marginTop: -progressContentPadding,
    // backgroundColor: 'rgba(0, 0, 0, .1)',
    paddingHorizontal: 15,
    paddingBottom: 15,
    paddingTop: 5,
    // backgroundColor: AppColors.primary,
    // backgroundColor: 'red',
    flexDirection: 'column',
  },
  visualizer: {
    marginBottom: 4,
  },
  status: {
    marginTop: 10,
    flexDirection: 'column',
    flex: 0,
    paddingLeft: 5,
    justifyContent: 'space-evenly',
    // backgroundColor: 'rgba(0, 0, 0, .1)',
  },
})
