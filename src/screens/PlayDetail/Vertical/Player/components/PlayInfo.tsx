import { memo } from 'react'
import { View } from 'react-native'

import Progress from '@/components/player/ProgressBar'
import Status from './Status'
import { useProgress } from '@/store/player/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { useBufferProgress } from '@/plugins/player'
import { playDetailPalette } from '../../../palette'

// const FONT_SIZE = 13

const PlayTimeCurrent = ({ timeStr }: { timeStr: string }) => {
  // console.log(timeStr)
  return <Text color={playDetailPalette.SECONDARY_TEXT}>{timeStr}</Text>
}

const PlayTimeMax = memo(({ timeStr }: { timeStr: string }) => {
  return <Text color={playDetailPalette.SECONDARY_TEXT}>{timeStr}</Text>
})

export default () => {
  const { maxPlayTimeStr, nowPlayTimeStr, progress, maxPlayTime } = useProgress()
  const buffered = useBufferProgress()

  // console.log('render playInfo')

  return (
    <>
      <View style={styles.progress}><Progress progress={progress} duration={maxPlayTime} buffered={buffered} colors={playDetailPalette.PROGRESS_COLORS} /></View>
      <View style={styles.info}>
        <PlayTimeCurrent timeStr={nowPlayTimeStr} />
        <View style={styles.status} >
          <Status />
        </View>
        <PlayTimeMax timeStr={maxPlayTimeStr} />
      </View>
    </>
  )
}


const styles = createStyle({
  progress: {
    flexGrow: 1,
    flexShrink: 0,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  info: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // alignItems: 'center',
    // backgroundColor: '#ccc',
  },
  status: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 10,
    paddingRight: 10,
  },
})
