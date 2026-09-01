import { memo, useEffect, useMemo, useState } from 'react'
import { processColor, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useIsPlay } from '@/store/player/hook'
import {
  isSpectrumSourceAvailable,
  NativeSpectrumBars,
  NativeSpectrumRing,
  resetSpectrum,
} from './native'

/** 中文注释：可视化只在播放详情页出现，两种样式共享同一套开关与不透明度设置。 */
interface Props {
  /** 覆盖设置里的样式，供环形与频谱柱分别固定挂载位置时使用 */
  variant: 'bars' | 'ring'
  style?: StyleProp<ViewStyle>
}

/**
 * 中文注释：原生抽头是否可用要在运行时问一次。
 * 音频卸载启用时软件链路上没有 PCM，此时应当隐藏可视化而不是显示一条不动的直线。
 */
const useSpectrumAvailable = (enabled: boolean, isPlay: boolean) => {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setAvailable(false)
      return
    }
    let cancelled = false
    // 中文注释：抽头是在播放器创建音频链路时才装上的，所以必须跟随播放状态重新检测。
    // 若只在挂载时查一次，用户首次进入详情页（还没开始播放）会永久判定为不可用；
    // 同理，改完「音频卸载」设置重启播放器后也需要重新判定。
    void isSpectrumSourceAvailable().then(result => {
      if (!cancelled) setAvailable(result)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, isPlay])

  return available
}

export default memo(({ variant, style }: Props) => {
  const theme = useTheme()
  const enable = useSettingValue('playDetail.audioVisualization.enable')
  const styleSetting = useSettingValue('playDetail.audioVisualization.style')
  const barCount = useSettingValue('playDetail.audioVisualization.barCount')
  const barMirror = useSettingValue('playDetail.audioVisualization.barMirror')
  const barGapRatio = useSettingValue('playDetail.audioVisualization.barGapRatio')
  const ringAmplitude = useSettingValue('playDetail.audioVisualization.ringAmplitude')
  const ringGlow = useSettingValue('playDetail.audioVisualization.ringGlow')
  const opacity = useSettingValue('playDetail.audioVisualization.opacity')
  const isPlay = useIsPlay()

  const active = enable && styleSetting == variant
  const available = useSpectrumAvailable(active, isPlay)

  // 中文注释：停止播放时清零，避免下次进入页面闪现上一首残留的柱高。
  useEffect(() => {
    if (!isPlay) void resetSpectrum()
  }, [isPlay])

  const gradientColors = useMemo(() => {
    const bottom = processColor(theme['c-primary-light-100']) as number | null
    const top = processColor(theme['c-primary-light-400']) as number | null
    if (typeof bottom != 'number' || typeof top != 'number') return null
    return [bottom, top]
  }, [theme])

  const ringColor = theme['c-primary-light-200']

  if (!active || !available) return null

  if (variant == 'ring') {
    return (
      <NativeSpectrumRing
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity }, style]}
        baseRadiusRatio={0.62}
        amplitudeRatio={ringAmplitude}
        ringStrokeWidth={2}
        rotationSpeed={6}
        showGlow={ringGlow}
        ringColor={ringColor}
      />
    )
  }

  return (
    <View pointerEvents="none" style={[styles.barsContainer, { opacity }, style]}>
      <NativeSpectrumBars
        style={styles.fill}
        barCount={barCount}
        gapRatio={barGapRatio}
        minHeightRatio={0.02}
        cornerRadius={2}
        mirror={barMirror}
        {...(gradientColors ? { gradientColors } : { startColor: ringColor })}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  barsContainer: {
    height: 46,
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  fill: {
    flex: 1,
  },
})
