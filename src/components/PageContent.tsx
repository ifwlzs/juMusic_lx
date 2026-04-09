import { useEffect, useMemo, useRef, useState } from 'react'
import { View, type ViewStyle } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { useSetting } from '@/store/setting/hook'
import ImageBackground from '@/components/common/ImageBackground'
import PlayDetailBackgroundLayer from '@/screens/PlayDetail/BackgroundLayer'
import {
  createGrayBiasedMaskColor,
  playDetailBackgroundDefaults,
  readPlayDetailBackgroundSetting,
  resolvePlayDetailBackgroundConfig,
} from '@/screens/PlayDetail/backgroundConfig'
import { useWindowSize } from '@/utils/hooks'
import { scaleSizeAbsHR } from '@/utils/pixelRatio'
import { extractDominantHueFromImage } from '@/utils/nativeModules/utils'
import { defaultHeaders } from './common/Image'
import SizeView from './SizeView'
import { useBgPic } from '@/store/common/hook'

interface Props {
  children: React.ReactNode
  backgroundVariant?: BackgroundVariant
}

type BackgroundVariant = 'default' | 'playDetailEmby'

interface DefaultBackgroundConfig {
  blurRadius: number
  overlayStyle: ViewStyle
  overlayOpacity: number
}

const defaultBackgroundConfig: DefaultBackgroundConfig = {
  blurRadius: Math.max(scaleSizeAbsHR(18), 10),
  overlayStyle: {
    flex: 1,
    flexDirection: 'column',
  },
  overlayOpacity: 0.76,
}

export default ({ children, backgroundVariant = 'default' }: Props) => {
  const theme = useTheme()
  const setting = useSetting()
  const windowSize = useWindowSize()
  const pic = useBgPic()
  const lastSuccessfulRecommendedMaskColorRef = useRef<string | null>(null)
  const [recommendedMaskColor, setRecommendedMaskColor] = useState<string | null>(playDetailBackgroundDefaults.maskColor)
  const playDetailBackgroundSetting = readPlayDetailBackgroundSetting(setting)

  useEffect(() => {
    let cancelled = false
    const fallbackColor = lastSuccessfulRecommendedMaskColorRef.current ?? playDetailBackgroundDefaults.maskColor

    if (backgroundVariant != 'playDetailEmby' || !pic) {
      setRecommendedMaskColor(fallbackColor)
      return
    }

    void extractDominantHueFromImage(pic).then(hue => {
      if (cancelled) return
      if (typeof hue == 'number' && Number.isFinite(hue)) {
        const nextColor = createGrayBiasedMaskColor(hue, playDetailBackgroundSetting.maskSaturation, playDetailBackgroundSetting.maskLightness)
        lastSuccessfulRecommendedMaskColorRef.current = nextColor
        setRecommendedMaskColor(nextColor)
        return
      }

      setRecommendedMaskColor(fallbackColor)
    })

    return () => {
      cancelled = true
    }
  }, [backgroundVariant, pic, playDetailBackgroundSetting.maskLightness, playDetailBackgroundSetting.maskSaturation])

  const resolvedPlayDetailBackgroundConfig = useMemo(() => resolvePlayDetailBackgroundConfig({
    setting: playDetailBackgroundSetting,
    recommendedMaskColor,
  }), [playDetailBackgroundSetting, recommendedMaskColor])

  const defaultOverlayStyle = useMemo(() => ({
    ...defaultBackgroundConfig.overlayStyle,
    backgroundColor: theme['c-content-background'],
    opacity: defaultBackgroundConfig.overlayOpacity,
  }), [theme])

  const playDetailBackgroundSource = useMemo(() => pic
    ? { uri: pic, headers: defaultHeaders }
    : null
  , [pic])

  const defaultThemeComponent = useMemo(() => (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <ImageBackground
        style={{ position: 'absolute', left: 0, top: 0, height: windowSize.height, width: windowSize.width, backgroundColor: theme['c-content-background'] }}
        source={theme['bg-image']}
        resizeMode="cover"
        blurRadius={defaultBackgroundConfig.blurRadius}
      >
        <View style={defaultOverlayStyle}></View>
      </ImageBackground>
      <View style={{ flex: 1, flexDirection: 'column', backgroundColor: theme['c-main-background'] }}>
        {children}
      </View>
    </View>
  ), [children, defaultOverlayStyle, theme, windowSize.height, windowSize.width])

  const playDetailComponent = useMemo(() => {
    if (!playDetailBackgroundSource) return defaultThemeComponent

    return (
      <PlayDetailBackgroundLayer
        source={playDetailBackgroundSource}
        resolvedConfig={resolvedPlayDetailBackgroundConfig}
      >
        <View style={{ flex: 1, flexDirection: 'column' }}>{children}</View>
      </PlayDetailBackgroundLayer>
    )
  }, [children, defaultThemeComponent, playDetailBackgroundSource, resolvedPlayDetailBackgroundConfig])

  return (
    <>
      <SizeView />
      {backgroundVariant == 'playDetailEmby' ? playDetailComponent : defaultThemeComponent}
    </>
  )
}
