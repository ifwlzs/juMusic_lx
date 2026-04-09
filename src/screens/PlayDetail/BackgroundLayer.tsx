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

const renderLinearVignetteOverlay = (resolvedConfig: ResolvedPlayDetailBackgroundConfig) => (
  <View pointerEvents="none" style={styles.absoluteFill}>
    {resolvedConfig.linearVignetteSlices.map((slice, index) => (
      <View
        key={`vignette-top:${index}`}
        style={[
          styles.absoluteFill,
          {
            left: 0,
            right: 0,
            top: slice.inset,
            bottom: undefined,
            height: slice.thickness,
            backgroundColor: resolvedConfig.vignetteColor,
            opacity: slice.opacity,
          },
        ]}
      />
    ))}
    {resolvedConfig.linearVignetteSlices.map((slice, index) => (
      <View
        key={`vignette-right:${index}`}
        style={[
          styles.absoluteFill,
          {
            left: undefined,
            right: slice.inset,
            top: 0,
            bottom: 0,
            width: slice.thickness,
            backgroundColor: resolvedConfig.vignetteColor,
            opacity: slice.opacity,
          },
        ]}
      />
    ))}
    {resolvedConfig.linearVignetteSlices.map((slice, index) => (
      <View
        key={`vignette-bottom:${index}`}
        style={[
          styles.absoluteFill,
          {
            left: 0,
            right: 0,
            top: undefined,
            bottom: slice.inset,
            height: slice.thickness,
            backgroundColor: resolvedConfig.vignetteColor,
            opacity: slice.opacity,
          },
        ]}
      />
    ))}
    {resolvedConfig.linearVignetteSlices.map((slice, index) => (
      <View
        key={`vignette-left:${index}`}
        style={[
          styles.absoluteFill,
          {
            left: slice.inset,
            right: undefined,
            top: 0,
            bottom: 0,
            width: slice.thickness,
            backgroundColor: resolvedConfig.vignetteColor,
            opacity: slice.opacity,
          },
        ]}
      />
    ))}
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
      {renderLinearVignetteOverlay(resolvedConfig)}
      <View style={styles.content}>{children}</View>
    </View>
  )
}
