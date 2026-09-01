import { NativeModules, requireNativeComponent, type ViewProps, type ColorValue } from 'react-native'

/**
 * 中文注释：频谱数据不经过 RN 桥。原生侧直接从 ExoPlayer 抽取 PCM、做 FFT、在 Canvas 上绘制，
 * JS 只负责传样式参数。若走桥每帧传 64 个浮点数，60fps 下每秒近 4000 次跨桥调用必然掉帧。
 */

export interface SpectrumBarsProps extends ViewProps {
  /** 柱子数量，原生侧会夹取到 4..64 */
  barCount?: number
  /** 柱间距占单柱槽位的比例，0..0.8 */
  gapRatio?: number
  /** 静音时保留的最小柱高比例，避免完全消失 */
  minHeightRatio?: number
  cornerRadius?: number
  /** 以中线为基准上下镜像生长 */
  mirror?: boolean
  /** 单色模式 */
  startColor?: ColorValue
  /** 渐变模式：[底部色, 顶部色]，需为已解析的 int 颜色 */
  gradientColors?: number[]
}

export interface SpectrumRingProps extends ViewProps {
  /** 静默时的基础半径占短边一半的比例 */
  baseRadiusRatio?: number
  /** 起伏幅度占短边一半的比例 */
  amplitudeRatio?: number
  ringStrokeWidth?: number
  /** 每秒自转角度，静音段落也保持缓慢运动 */
  rotationSpeed?: number
  showGlow?: boolean
  ringColor?: ColorValue
}

export const NativeSpectrumBars = requireNativeComponent<SpectrumBarsProps>('LxSpectrumBars')
export const NativeSpectrumRing = requireNativeComponent<SpectrumRingProps>('LxSpectrumRing')

const { VisualizerModule } = NativeModules as {
  VisualizerModule?: {
    isSpectrumSourceAvailable: () => Promise<boolean>
    resetSpectrum: () => Promise<void>
  }
}

/** 中文注释：能力检测。抽头未安装时（例如音频卸载抢走了软件链路）返回 false，界面据此隐藏可视化。 */
export const isSpectrumSourceAvailable = async(): Promise<boolean> => {
  if (!VisualizerModule) return false
  try {
    return await VisualizerModule.isSpectrumSourceAvailable()
  } catch {
    return false
  }
}

export const resetSpectrum = async(): Promise<void> => {
  if (!VisualizerModule) return
  try {
    await VisualizerModule.resetSpectrum()
  } catch {}
}
