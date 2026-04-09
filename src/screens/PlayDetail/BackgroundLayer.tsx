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

const renderVignetteBandStack = (resolvedConfig: ResolvedPlayDetailBackgroundConfig) => (
  <View pointerEvents="none" style={styles.absoluteFill}>
    {resolvedConfig.vignetteBands.flatMap((band, index) => [
      <View
        key={`vignette-top:${index}`}
        style={[
          styles.absoluteFill,
          {
            left: band.inset,
            right: band.inset,
            top: band.inset,
            bottom: undefined,
            height: band.thickness,
            backgroundColor: resolvedConfig.vignetteColor,
            opacity: band.opacity,
          },
        ]}
      />,
      <View
        key={`vignette-right:${index}`}
        style={[
          styles.absoluteFill,
          {
            left: undefined,
            right: band.inset,
            top: band.inset,
            bottom: band.inset,
            width: band.thickness,
            backgroundColor: resolvedConfig.vignetteColor,
            opacity: band.opacity,
          },
        ]}
      />,
      <View
        key={`vignette-bottom:${index}`}
        style={[
          styles.absoluteFill,
          {
            left: band.inset,
            right: band.inset,
            top: undefined,
            bottom: band.inset,
            height: band.thickness,
            backgroundColor: resolvedConfig.vignetteColor,
            opacity: band.opacity,
          },
        ]}
      />,
      <View
        key={`vignette-left:${index}`}
        style={[
          styles.absoluteFill,
          {
            left: band.inset,
            right: undefined,
            top: band.inset,
            bottom: band.inset,
            width: band.thickness,
            backgroundColor: resolvedConfig.vignetteColor,
            opacity: band.opacity,
          },
        ]}
      />,
    ])}
  </View>
)

export default function PlayDetailBackgroundLayer({ source, resolvedConfig, children }: Props) {
  return (
    <View style={styles.container}>
      {resolvedConfig.blurLayers.map((layer, index) => (
        <ImageBackground
          key={`blur-layer:${index}`}
          style={[styles.absoluteFill, { opacity: layer.opacity }]}
          source={source}
          resizeMode="stretch"
          blurRadius={layer.blurRadius}
          imageStyle={{
            transform: [{ scaleX: layer.scale }, { scaleY: layer.scale }],
          }}
        />
      ))}
      <View
        pointerEvents="none"
        style={[
          styles.absoluteFill,
          {
            backgroundColor: resolvedConfig.brightnessOverlayColor,
            opacity: resolvedConfig.imageBrightnessOverlayOpacity,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.absoluteFill,
          { backgroundColor: resolvedConfig.colorMask },
        ]}
      />
      {renderVignetteBandStack(resolvedConfig)}
      <View style={styles.content}>{children}</View>
    </View>
  )
}
