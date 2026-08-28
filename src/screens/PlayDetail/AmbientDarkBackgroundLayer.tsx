import { StyleSheet, View } from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import type { AmbientDarkPalette } from './backgroundConfig'

interface Props {
  colors: AmbientDarkPalette
  overlayOpacity?: number
  children?: React.ReactNode
}

// 静态环境层只绘制暗色多段渐变与可读性遮罩，不读取旧模糊方案参数。
export default function AmbientDarkBackgroundLayer({ colors, overlayOpacity = 0.26, children }: Props) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors[0], colors[1], colors[2]]}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0.15 }}
        end={{ x: 1, y: 0.85 }}
        style={styles.absoluteFill}
      />
      <View pointerEvents="none" style={[styles.absoluteFill, { backgroundColor: `rgba(0, 0, 0, ${overlayOpacity.toFixed(2)})` }]} />
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#0b0f13' },
  absoluteFill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  content: { flex: 1, flexDirection: 'column' },
})
