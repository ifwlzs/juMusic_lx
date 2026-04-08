import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { View, PanResponder } from 'react-native'
import { useDrag } from '@/utils/hooks'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
// import { scaleSizeW } from '@/utils/pixelRatio'
// import { AppColors } from '@/theme'

export interface ProgressColors {
  track: string
  buffered: string
  played: string
  playedDragging: string
  dragPreview: string
  thumb: string
}

const DefaultBar = memo(({ color }: { color: string }) => {
  return <View style={{
    ...styles.progressBar,
    backgroundColor: color,
    position: 'absolute',
    width: '100%',
    left: 0,
    top: 0,
  }}></View>
})

const BufferedBar = memo(({ progress, color }: { progress: number, color: string }) => {
  return <View style={{ ...styles.progressBar, backgroundColor: color, position: 'absolute', width: `${progress * 100}%`, left: 0, top: 0 }}></View>
})

const PreassBar = memo(({ onDragState, setDragProgress, onSetProgress }: {
  onDragState: (drag: boolean) => void
  setDragProgress: (progress: number) => void
  onSetProgress: (progress: number) => void
}) => {
  const {
    onLayout,
    onDragStart,
    onDragEnd,
    onDrag,
  } = useDrag(onSetProgress, onDragState, setDragProgress)
  // const handlePress = useCallback((event: GestureResponderEvent) => {
  //   onPress(event.nativeEvent.locationX)
  // }, [onPress])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (evt, gestureState) => true,
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => true,

      // onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        onDrag(gestureState.dx)
      },
      onPanResponderGrant: (evt, gestureState) => {
        // console.log(evt.nativeEvent.locationX, gestureState)
        onDragStart(gestureState.dx, evt.nativeEvent.locationX)
      },
      onPanResponderRelease: () => {
        onDragEnd()
      },
      // onPanResponderTerminate: (evt, gestureState) => {
      //   onDragEnd()
      // },
    }),
  ).current

  return <View onLayout={onLayout} style={styles.pressBar} {...panResponder.panHandlers} />
})


export const ProgressPlain = ({ progress, duration, buffered, paddingTop, colors }: {
  progress: number
  duration: number
  buffered: number
  paddingTop?: number
  colors?: ProgressColors
}) => {
  // const { progress } = usePlayTimeBuffer()
  const theme = useTheme()
  const progressColors = colors ?? {
    track: 'transparent',
    buffered: theme['c-primary-light-600-alpha-900'],
    played: theme['c-primary-alpha-900'],
    playedDragging: theme['c-primary-light-200-alpha-900'],
    dragPreview: theme['c-primary-light-100-alpha-800'],
    thumb: theme['c-primary-light-100'],
  }
  // console.log(progress)
  const progressStr: `${number}%` = `${progress * 100}%`

  const durationRef = useRef(duration)
  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  return (
    <View style={{ ...styles.progress, paddingTop }}>
      <View style={{ flex: 1 }}>
        <DefaultBar color={progressColors.track} />
        <BufferedBar progress={buffered} color={progressColors.buffered} />
        <View style={{ ...styles.progressBar, backgroundColor: progressColors.played, width: progressStr, position: 'absolute', left: 0, top: 0 }} />
      </View>
      <View style={styles.pressBar} />
    </View>
  )
}

const Progress = ({ progress, duration, buffered, paddingTop, colors }: {
  progress: number
  duration: number
  buffered: number
  paddingTop?: number
  colors?: ProgressColors
}) => {
  // const { progress } = usePlayTimeBuffer()
  const theme = useTheme()
  const progressColors = colors ?? {
    track: 'transparent',
    buffered: theme['c-primary-light-600-alpha-900'],
    played: theme['c-primary-alpha-900'],
    playedDragging: theme['c-primary-light-200-alpha-900'],
    dragPreview: theme['c-primary-light-100-alpha-800'],
    thumb: theme['c-primary-light-100'],
  }
  const [draging, setDraging] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)
  // console.log(progress)
  const progressStr: `${number}%` = `${progress * 100}%`

  const durationRef = useRef(duration)
  useEffect(() => {
    durationRef.current = duration
  }, [duration])
  const onSetProgress = useCallback((progress: number) => {
    global.app_event.setProgress(progress * durationRef.current)
  }, [])

  return (
    <View style={{ ...styles.progress, paddingTop }}>
      <View style={{ flex: 1 }}>
        <DefaultBar color={progressColors.track} />
        <BufferedBar progress={buffered} color={progressColors.buffered} />
        {
          draging
            ? (
                <>
                  <View style={{ ...styles.progressBar, backgroundColor: progressColors.playedDragging, width: progressStr, position: 'absolute', left: 0, top: 0 }} />
                  <View style={{ ...styles.progressBar, backgroundColor: progressColors.dragPreview, width: `${dragProgress * 100}%`, position: 'absolute', left: 0, top: 0 }} />
                </>
              ) : (
                <View style={{ ...styles.progressBar, backgroundColor: progressColors.played, width: progressStr, position: 'absolute', left: 0, top: 0 }} />
              )
        }
      </View>
      <PreassBar onDragState={setDraging} setDragProgress={setDragProgress} onSetProgress={onSetProgress} />
      {/* <View style={{ ...styles.progressBar, height: '100%', width: progressStr }}><Pressable style={styles.progressDot}></Pressable></View> */}
    </View>
  )
}


// const progressContentPadding = 9
// const progressHeight = 3
const styles = createStyle({
  progress: {
    flex: 1,
    // backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 1,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  pressBar: {
    position: 'absolute',
    // backgroundColor: 'rgba(0,0,0,0.5)',
    left: 0,
    top: 0,
    // height: progressContentPadding * 2 + progressHeight,
    height: '100%',
    width: '100%',
  },
})

export default Progress
