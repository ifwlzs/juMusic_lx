import { View, StyleSheet, type ImageSourcePropType } from 'react-native'
import ImageBackground from '@/components/common/ImageBackground'
import type { ResolvedPlayDetailBackgroundConfig } from './backgroundConfig'

interface Props {
  source?: ImageSourcePropType | { uri: string, headers?: Record<string, string> } | null
  resolvedConfig: ResolvedPlayDetailBackgroundConfig
  children?: React.ReactNode
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  absoluteFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    flex: 1,
    flexDirection: 'column',
  },
})

const renderVignetteBands = (resolvedConfig: ResolvedPlayDetailBackgroundConfig) => {
  const thickness = Math.max(24, Math.round(resolvedConfig.vignetteSize / Math.max(resolvedConfig.imageContrast, 0.8)))
  const opacity = Math.min(Math.max(0.24 + (resolvedConfig.imageContrast - 1) * 0.2, 0.16), 0.72)
  const bandStyle = { backgroundColor: resolvedConfig.vignetteColor, opacity }

  return [
    <View key="vignette-top" style={[styles.absoluteFill, { bottom: undefined, height: thickness }, bandStyle]} />,
    <View key="vignette-right" style={[styles.absoluteFill, { left: undefined, width: thickness }, bandStyle]} />,
    <View key="vignette-bottom" style={[styles.absoluteFill, { top: undefined, height: thickness }, bandStyle]} />,
    <View key="vignette-left" style={[styles.absoluteFill, { right: undefined, width: thickness }, bandStyle]} />,
  ]
}

export default function PlayDetailBackgroundLayer({ source, resolvedConfig, children }: Props) {
  return (
    <View style={styles.container}>
      <ImageBackground
        style={styles.absoluteFill}
        source={source}
        resizeMode="stretch"
        blurRadius={resolvedConfig.blurRadius}
        imageStyle={{
          transform: [{ scaleX: resolvedConfig.stretchScale }, { scaleY: resolvedConfig.stretchScale }],
        }}
      >
        <View style={[styles.absoluteFill, { backgroundColor: resolvedConfig.brightnessOverlayColor, opacity: resolvedConfig.imageBrightnessOverlayOpacity }]} />
        <View style={[styles.absoluteFill, { backgroundColor: resolvedConfig.colorMask }]} />
        {renderVignetteBands(resolvedConfig)}
      </ImageBackground>
      <View style={styles.content}>{children}</View>
    </View>
  )
}
