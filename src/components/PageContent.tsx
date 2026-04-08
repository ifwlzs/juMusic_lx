// import { useEffect, useState } from 'react'
import { View, type ImageStyle, type ViewStyle } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import ImageBackground from '@/components/common/ImageBackground'
import { useWindowSize } from '@/utils/hooks'
import { useMemo } from 'react'
import { scaleSizeAbsHR } from '@/utils/pixelRatio'
import { defaultHeaders } from './common/Image'
import SizeView from './SizeView'
import { useBgPic } from '@/store/common/hook'

interface Props {
  children: React.ReactNode
  backgroundVariant?: BackgroundVariant
}

type BackgroundVariant = 'default' | 'playDetailEmby'

interface BackgroundConfig {
  resizeMode: 'cover' | 'stretch'
  blurRadius: number
  imageStyle?: ImageStyle
  overlayStyle: ViewStyle
  edgeOverlayLayers?: EdgeOverlayLayer[]
  useThemeOverlayColor?: boolean
  overlayOpacity?: number
}

interface EdgeOverlayLayer {
  paddingHorizontal: string
  paddingVertical: string
  backgroundColor: string
}

const playDetailEmbyOuterRingWidth = 4
const playDetailEmbyInnerRingWidth = 6
const playDetailEmbyOuterRingSegmentWidth = `${playDetailEmbyOuterRingWidth / 2}%`
const playDetailEmbyInnerRingSegmentWidth = `${playDetailEmbyInnerRingWidth / 2}%`
const playDetailEmbyEdgeOverlayLayers = [
  {
    paddingHorizontal: playDetailEmbyOuterRingSegmentWidth,
    paddingVertical: playDetailEmbyOuterRingSegmentWidth,
    backgroundColor: 'rgba(145, 145, 145, 0.34)',
  },
  {
    paddingHorizontal: playDetailEmbyOuterRingSegmentWidth,
    paddingVertical: playDetailEmbyOuterRingSegmentWidth,
    backgroundColor: 'rgba(145, 145, 145, 0.26)',
  },
  {
    paddingHorizontal: playDetailEmbyOuterRingSegmentWidth,
    paddingVertical: playDetailEmbyOuterRingSegmentWidth,
    backgroundColor: 'rgba(145, 145, 145, 0.2)',
  },
  {
    paddingHorizontal: playDetailEmbyOuterRingSegmentWidth,
    paddingVertical: playDetailEmbyOuterRingSegmentWidth,
    backgroundColor: 'rgba(145, 145, 145, 0.15)',
  },
  {
    paddingHorizontal: playDetailEmbyInnerRingSegmentWidth,
    paddingVertical: playDetailEmbyInnerRingSegmentWidth,
    backgroundColor: 'rgba(145, 145, 145, 0.12)',
  },
  {
    paddingHorizontal: playDetailEmbyInnerRingSegmentWidth,
    paddingVertical: playDetailEmbyInnerRingSegmentWidth,
    backgroundColor: 'rgba(145, 145, 145, 0.08)',
  },
] as const

const renderInsetEdgeOverlay = (layers: readonly EdgeOverlayLayer[], index = 0): React.ReactNode => {
  if (index >= layers.length) return <View style={{ flex: 1 }} />
  const layer = layers[index]
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: layer.backgroundColor,
        paddingHorizontal: layer.paddingHorizontal,
        paddingVertical: layer.paddingVertical,
      }}
    >
      {renderInsetEdgeOverlay(layers, index + 1)}
    </View>
  )
}

const renderPlayDetailEmbyEdgeOverlay = () => (
  <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
    {renderInsetEdgeOverlay(playDetailEmbyEdgeOverlayLayers)}
  </View>
)

const backgroundConfigs: Record<BackgroundVariant, BackgroundConfig> = {
  default: {
    resizeMode: 'cover',
    blurRadius: Math.max(scaleSizeAbsHR(18), 10),
    overlayStyle: {
      flex: 1,
      flexDirection: 'column',
    },
    useThemeOverlayColor: true,
    overlayOpacity: 0.76,
  },
  playDetailEmby: {
    resizeMode: 'stretch',
    blurRadius: Math.max(scaleSizeAbsHR(28), 24),
    imageStyle: { transform: [{ scaleX: 1.1 }, { scaleY: 1.08 }] },
    overlayStyle: {
      flex: 1,
      flexDirection: 'column',
      backgroundColor: 'rgba(0, 0, 0, 0.14)',
    },
    edgeOverlayLayers: playDetailEmbyEdgeOverlayLayers,
  },
}

export default ({ children, backgroundVariant = 'default' }: Props) => {
  const theme = useTheme()
  const windowSize = useWindowSize()
  const pic = useBgPic()
  const bgConfig = backgroundConfigs[backgroundVariant]
  const overlayStyle = useMemo(() => bgConfig.useThemeOverlayColor
    ? { ...bgConfig.overlayStyle, backgroundColor: theme['c-content-background'], opacity: bgConfig.overlayOpacity }
    : bgConfig.overlayStyle
  , [bgConfig, theme])
  const themeBackgroundProps = useMemo(() => (
    backgroundVariant === 'playDetailEmby'
      ? { resizeMode: bgConfig.resizeMode, blurRadius: bgConfig.blurRadius, imageStyle: bgConfig.imageStyle }
      : { resizeMode: 'cover' as const }
  ), [backgroundVariant, bgConfig.blurRadius, bgConfig.imageStyle, bgConfig.resizeMode])
  // const [wh, setWH] = useState<{ width: number | string, height: number | string }>({ width: '100%', height: Dimensions.get('screen').height })

  // 固定宽高度 防止弹窗键盘时大小改变导致背景被缩放
  // useEffect(() => {
  //   const onChange = () => {
  //     setWH({ width: '100%', height: '100%' })
  //   }

  //   const changeEvent = Dimensions.addEventListener('change', onChange)
  //   return () => {
  //     changeEvent.remove()
  //   }
  // }, [])
  // const handleLayout = (e: LayoutChangeEvent) => {
  //   // console.log('handleLayout', e.nativeEvent)
  //   // console.log(Dimensions.get('screen'))
  //   setWH({ width: e.nativeEvent.layout.width, height: Dimensions.get('screen').height })
  // }
  // console.log('render page content')

  const themeComponent = useMemo(() => (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <ImageBackground
        style={{ position: 'absolute', left: 0, top: 0, height: windowSize.height, width: windowSize.width, backgroundColor: theme['c-content-background'] }}
        source={theme['bg-image']}
        {...themeBackgroundProps}
      >
        {backgroundVariant === 'playDetailEmby' ? <View style={overlayStyle}></View> : null}
        {backgroundVariant === 'playDetailEmby' && bgConfig.edgeOverlayLayers ? renderPlayDetailEmbyEdgeOverlay() : null}
      </ImageBackground>
      <View style={{ flex: 1, flexDirection: 'column', backgroundColor: theme['c-main-background'] }}>
        {children}
      </View>
    </View>
  ), [backgroundVariant, bgConfig.edgeOverlayLayers, children, overlayStyle, theme, themeBackgroundProps, windowSize.height, windowSize.width])
  const picComponent = useMemo(() => {
    return (
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <ImageBackground
          style={{ position: 'absolute', left: 0, top: 0, height: windowSize.height, width: windowSize.width, backgroundColor: theme['c-content-background'] }}
          source={{ uri: pic!, headers: defaultHeaders }}
          resizeMode={bgConfig.resizeMode}
          blurRadius={bgConfig.blurRadius}
          imageStyle={bgConfig.imageStyle}
        >
          <View style={overlayStyle}></View>
          {backgroundVariant === 'playDetailEmby' && bgConfig.edgeOverlayLayers ? renderPlayDetailEmbyEdgeOverlay() : null}
        </ImageBackground>
        <View style={{ flex: 1, flexDirection: 'column' }}>
          {children}
        </View>
      </View>
    )
  }, [backgroundVariant, bgConfig.blurRadius, bgConfig.edgeOverlayLayers, bgConfig.imageStyle, bgConfig.resizeMode, children, overlayStyle, pic, theme, windowSize.height, windowSize.width])

  return (
    <>
      <SizeView />
      {pic ? picComponent : themeComponent}
    </>
  )
}
