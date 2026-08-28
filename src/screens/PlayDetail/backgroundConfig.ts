const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const roundTo = (value: number, fractionDigits = 3) => Number(value.toFixed(fractionDigits))

const hexToRgb = (hex: string) => {
  const value = hex.replace('#', '')
  const normalized = value.length === 3
    ? value.split('').map(character => `${character}${character}`).join('')
    : value

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

const componentToHex = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
const rgbToHex = ({ red, green, blue }: { red: number, green: number, blue: number }) => `#${componentToHex(red)}${componentToHex(green)}${componentToHex(blue)}`

const hueToChannel = (p: number, q: number, t: number) => {
  let channel = t
  if (channel < 0) channel += 1
  if (channel > 1) channel -= 1
  if (channel < 1 / 6) return p + (q - p) * 6 * channel
  if (channel < 1 / 2) return q
  if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6
  return p
}

const hslToRgb = (hue: number, saturation: number, lightness: number) => {
  const hueNorm = ((hue % 360) + 360) % 360 / 360

  if (!saturation) {
    const gray = Math.round(lightness * 255)
    return { red: gray, green: gray, blue: gray }
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q

  return {
    red: Math.round(hueToChannel(p, q, hueNorm + 1 / 3) * 255),
    green: Math.round(hueToChannel(p, q, hueNorm) * 255),
    blue: Math.round(hueToChannel(p, q, hueNorm - 1 / 3) * 255),
  }
}

// 将 RGB 转为 HSL，供暗色环境方案按色相保留封面风格并统一压低明度。
const rgbToHsl = ({ red, green, blue }: { red: number, green: number, blue: number }) => {
  const redNorm = red / 255
  const greenNorm = green / 255
  const blueNorm = blue / 255
  const max = Math.max(redNorm, greenNorm, blueNorm)
  const min = Math.min(redNorm, greenNorm, blueNorm)
  const lightness = (max + min) / 2
  const delta = max - min
  if (!delta) return { hue: 0, saturation: 0, lightness }
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue = 0
  if (max == redNorm) hue = (greenNorm - blueNorm) / delta + (greenNorm < blueNorm ? 6 : 0)
  else if (max == greenNorm) hue = (blueNorm - redNorm) / delta + 2
  else hue = (redNorm - greenNorm) / delta + 4
  return { hue: hue * 60, saturation, lightness }
}

const buildRgba = (hex: string, alpha: number) => {
  const { red, green, blue } = hexToRgb(hex)
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1).toFixed(2)})`
}

const normalizeBlurIntensity = (blurRadius: number) => clamp((blurRadius - 40) / 220, 0, 1)
const normalizeContrastIntensity = (imageContrast: number) => clamp((imageContrast - 1) / 1.2, 0, 1)

export interface PlayDetailBackgroundSettingValues {
  stretchScale: number
  blurRadius: number
  imageBrightness: number
  imageContrast: number
  maskMode: 'auto' | 'manual'
  maskColor: string
  colorMaskOpacity: number
  maskSaturation: number
  maskLightness: number
  vignetteColor: string
  vignetteSize: number
}

export interface PlayDetailBackgroundBlurLayer {
  blurRadius: number
  opacity: number
  scale: number
}

export interface ResolvedPlayDetailBackgroundConfig extends PlayDetailBackgroundSettingValues {
  resolvedMaskColor: string
  colorMask: string
  brightnessOverlayColor: string
  imageBrightnessOverlayOpacity: number
  blurLayers: PlayDetailBackgroundBlurLayer[]
  vignetteOverlayColor: string
  vignetteTransparentColor: string
}

export const playDetailBackgroundDefaults = {
  stretchScale: 1,
  blurRadius: 200,
  imageBrightness: 1,
  imageContrast: 1.5,
  maskMode: 'auto',
  maskColor: '#914c4c',
  colorMaskOpacity: 0.37,
  maskSaturation: 0.312,
  maskLightness: 0.433,
  vignetteColor: '#898685',
  vignetteSize: 250,
} satisfies PlayDetailBackgroundSettingValues

export type AmbientDarkPalette = readonly [string, string, string]
export const ambientDarkFallbackPalette: AmbientDarkPalette = ['#241a26', '#13241f', '#10151c']
// 为 RGB 量化预留余量，确保最终十六进制颜色的实际明度不超过 0.24。
const AMBIENT_MAX_LIGHTNESS = 0.235
const AMBIENT_MIN_LIGHTNESS = 0.1
const AMBIENT_MIN_SATURATION = 0.24
const AMBIENT_MAX_SATURATION = 0.52
const HEX_COLOR_RXP = /^#[0-9a-f]{6}$/i

// 将封面原色限制在暗色阅读范围，同时保留可区分的色相关系。
const normalizeAmbientColor = (hex: string) => {
  const hsl = rgbToHsl(hexToRgb(hex))
  return rgbToHex(hslToRgb(
    hsl.hue,
    clamp(hsl.saturation, AMBIENT_MIN_SATURATION, AMBIENT_MAX_SATURATION),
    clamp(hsl.lightness * 0.42, AMBIENT_MIN_LIGHTNESS, AMBIENT_MAX_LIGHTNESS),
  ))
}

// 颜色不足时围绕已有色相派生邻近色，完全失败时回退到中性暗色组。
export const resolveAmbientDarkPalette = (colors: string[], fallbackHue?: number | null): AmbientDarkPalette => {
  const normalized = colors
    .map(color => color.trim().toLowerCase())
    .filter(color => HEX_COLOR_RXP.test(color))
    .map(normalizeAmbientColor)
    .filter((color, index, list) => list.indexOf(color) == index)

  const seedHue = normalized.length
    ? rgbToHsl(hexToRgb(normalized[0])).hue
    : typeof fallbackHue == 'number' && Number.isFinite(fallbackHue) ? fallbackHue : null
  if (!normalized.length && seedHue == null) return ambientDarkFallbackPalette

  for (const offset of [42, -48, 86]) {
    if (normalized.length >= 3) break
    normalized.push(rgbToHex(hslToRgb((seedHue! + offset + 360) % 360, 0.34, 0.16 + normalized.length * 0.02)))
  }
  return normalized.slice(0, 3) as unknown as AmbientDarkPalette
}

export const snapHue = (hue: number, step = 15) => Math.round(hue / step) * step

export const createGrayBiasedMaskColor = (hue: number, saturation: number, lightness: number) => {
  const snappedHue = snapHue(hue, 15)
  return rgbToHex(hslToRgb(snappedHue, saturation, lightness))
}

export const resolveNativeBlurLayers = ({
  blurRadius,
  stretchScale,
  imageContrast,
}: {
  blurRadius: number
  stretchScale: number
  imageContrast: number
}): PlayDetailBackgroundBlurLayer[] => {
  const blurIntensity = normalizeBlurIntensity(blurRadius)
  const contrastIntensity = normalizeContrastIntensity(imageContrast)
  const baseScale = clamp(stretchScale, 1, 1.2)

  return [
    {
      blurRadius: Math.round(clamp(14 + blurIntensity * 8 + contrastIntensity * 2, 12, 24)),
      opacity: roundTo(clamp(0.92 - contrastIntensity * 0.06, 0.78, 0.92), 3),
      scale: roundTo(baseScale, 3),
    },
    {
      blurRadius: Math.round(clamp(22 + blurIntensity * 10 + contrastIntensity * 4, 18, 36)),
      opacity: roundTo(clamp(0.34 + blurIntensity * 0.14, 0.32, 0.5), 3),
      scale: roundTo(clamp(baseScale + 0.045, 1.04, 1.25), 3),
    },
    {
      blurRadius: Math.round(clamp(30 + blurIntensity * 12 + contrastIntensity * 6, 24, 48)),
      opacity: roundTo(clamp(0.16 + blurIntensity * 0.14, 0.16, 0.32), 3),
      scale: roundTo(clamp(baseScale + 0.09, 1.08, 1.3), 3),
    },
  ]
}

const resolveVignetteOverlayOpacity = ({
  imageContrast,
}: {
  imageContrast: number
}) => {
  const contrastIntensity = normalizeContrastIntensity(imageContrast)
  return roundTo(clamp(0.22 + contrastIntensity * 0.08, 0.2, 0.3), 3)
}

export const readPlayDetailBackgroundSetting = (setting: LX.AppSetting): PlayDetailBackgroundSettingValues => ({
  stretchScale: setting['theme.playDetail.background.stretchScale'],
  blurRadius: setting['theme.playDetail.background.blurRadius'],
  imageBrightness: setting['theme.playDetail.background.imageBrightness'],
  imageContrast: setting['theme.playDetail.background.imageContrast'],
  maskMode: setting['theme.playDetail.background.maskMode'],
  maskColor: setting['theme.playDetail.background.maskColor'],
  colorMaskOpacity: setting['theme.playDetail.background.colorMaskOpacity'],
  maskSaturation: setting['theme.playDetail.background.maskSaturation'],
  maskLightness: setting['theme.playDetail.background.maskLightness'],
  vignetteColor: setting['theme.playDetail.background.vignetteColor'],
  vignetteSize: setting['theme.playDetail.background.vignetteSize'],
})

export const resolvePlayDetailBackgroundConfig = ({
  setting,
  recommendedMaskColor,
}: {
  setting: PlayDetailBackgroundSettingValues
  recommendedMaskColor?: string | null
}): ResolvedPlayDetailBackgroundConfig => {
  const resolvedMaskColor = setting.maskMode == 'manual' ? setting.maskColor : recommendedMaskColor ?? setting.maskColor
  const imageBrightnessDelta = setting.imageBrightness - 1
  const brightnessOverlayOpacity = clamp(Math.abs(imageBrightnessDelta) * 0.42, 0, 0.35)
  const vignetteOverlayOpacity = resolveVignetteOverlayOpacity(setting)
  const brightnessOverlayColor = imageBrightnessDelta >= 0
    ? 'rgba(255, 255, 255, 1)'
    : 'rgba(0, 0, 0, 1)'

  return {
    ...setting,
    resolvedMaskColor,
    colorMask: buildRgba(resolvedMaskColor, setting.colorMaskOpacity),
    brightnessOverlayColor,
    imageBrightnessOverlayOpacity: brightnessOverlayOpacity,
    blurLayers: resolveNativeBlurLayers(setting),
    vignetteOverlayColor: buildRgba(setting.vignetteColor, vignetteOverlayOpacity),
    vignetteTransparentColor: buildRgba(setting.vignetteColor, 0),
  }
}
