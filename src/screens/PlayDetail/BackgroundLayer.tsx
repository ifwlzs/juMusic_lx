import { View, StyleSheet, type ImageSourcePropType } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
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
  edgeOverlay: {
    position: 'absolute',
  },
})

const renderLinearVignetteOverlay = (resolvedConfig: ResolvedPlayDetailBackgroundConfig) => {
  const vignetteDepth = Math.max(60, Math.round(resolvedConfig.vignetteSize))

  return (
    <View pointerEvents="none" style={styles.absoluteFill}>
      <LinearGradient
        colors={[resolvedConfig.vignetteOverlayColor, resolvedConfig.vignetteTransparentColor]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.edgeOverlay, { top: 0, left: 0, right: 0, height: vignetteDepth }]}
      />
      <LinearGradient
        colors={[resolvedConfig.vignetteTransparentColor, resolvedConfig.vignetteOverlayColor]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.edgeOverlay, { left: 0, right: 0, bottom: 0, height: vignetteDepth }]}
      />
      <LinearGradient
        colors={[resolvedConfig.vignetteOverlayColor, resolvedConfig.vignetteTransparentColor]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.edgeOverlay, { top: 0, bottom: 0, left: 0, width: vignetteDepth }]}
      />
      <LinearGradient
        colors={[resolvedConfig.vignetteTransparentColor, resolvedConfig.vignetteOverlayColor]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.edgeOverlay, { top: 0, right: 0, bottom: 0, width: vignetteDepth }]}
      />
    </View>
  )
}

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
