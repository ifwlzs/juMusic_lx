// import { useEffect, useState } from 'react'
import { StyleSheet, View, type ImageStyle, type ViewStyle } from 'react-native'
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
  useThemeOverlayColor?: boolean
  overlayOpacity?: number
  tintThemeColorKey?: string
  tintOpacity?: number
}

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
    blurRadius: Math.max(scaleSizeAbsHR(36), 18),
    imageStyle: { transform: [{ scaleX: 1.16 }, { scaleY: 1.08 }] },
    tintThemeColorKey: 'c-primary-background-active',
    tintOpacity: 0.16,
    overlayStyle: {
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
    },
  },
}

export default ({ children, backgroundVariant = 'default' }: Props) => {
  const theme = useTheme()
  const windowSize = useWindowSize()
  const pic = useBgPic()
  const bgConfig = backgroundConfigs[backgroundVariant]
  const overlayStyle = useMemo(() => {
    const resolvedOverlayStyle = bgConfig.useThemeOverlayColor
      ? { ...bgConfig.overlayStyle, backgroundColor: theme['c-content-background'], opacity: bgConfig.overlayOpacity }
      : bgConfig.overlayStyle
    return { ...StyleSheet.absoluteFillObject, ...resolvedOverlayStyle }
  }, [bgConfig, theme])
  const tintOverlayStyle = useMemo(() => {
    if (!bgConfig.tintThemeColorKey || !bgConfig.tintOpacity) return null
    const tintColor = theme[bgConfig.tintThemeColorKey as keyof typeof theme]
    return {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: tintColor,
      opacity: bgConfig.tintOpacity,
    }
  }, [bgConfig, theme])
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
        resizeMode="cover"
      >
        {tintOverlayStyle ? <View style={tintOverlayStyle}></View> : null}
        <View style={overlayStyle}></View>
      </ImageBackground>
      <View style={{ flex: 1, flexDirection: 'column', backgroundColor: theme['c-main-background'] }}>
        {children}
      </View>
    </View>
  ), [children, overlayStyle, theme, tintOverlayStyle, windowSize.height, windowSize.width])
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
          {tintOverlayStyle ? <View style={tintOverlayStyle}></View> : null}
          <View style={overlayStyle}></View>
        </ImageBackground>
        <View style={{ flex: 1, flexDirection: 'column' }}>
          {children}
        </View>
      </View>
    )
  }, [bgConfig.blurRadius, bgConfig.imageStyle, bgConfig.resizeMode, children, overlayStyle, pic, theme, tintOverlayStyle, windowSize.height, windowSize.width])

  return (
    <>
      <SizeView />
      {pic ? picComponent : themeComponent}
    </>
  )
}
