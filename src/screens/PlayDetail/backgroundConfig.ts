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

export interface PlayDetailBackgroundVignetteBand {
  inset: number
  thickness: number
  opacity: number
}

export interface ResolvedPlayDetailBackgroundConfig extends PlayDetailBackgroundSettingValues {
  resolvedMaskColor: string
  colorMask: string
  brightnessOverlayColor: string
  imageBrightnessOverlayOpacity: number
  blurLayers: PlayDetailBackgroundBlurLayer[]
  vignetteBands: PlayDetailBackgroundVignetteBand[]
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

export const resolveVignetteBands = ({
  vignetteSize,
  imageContrast,
}: {
  vignetteSize: number
  imageContrast: number
}): PlayDetailBackgroundVignetteBand[] => {
  const totalDepth = Math.max(60, Math.round(vignetteSize))
  const bandCount = Math.max(12, Math.min(20, Math.round(totalDepth / 16)))
  const bandThickness = Math.max(4, totalDepth / bandCount)
  const contrastIntensity = normalizeContrastIntensity(imageContrast)
  const maxOpacity = clamp(0.16 + contrastIntensity * 0.08, 0.14, 0.24)

  return Array.from({ length: bandCount }, (_, index) => {
    const fade = 1 - (index / bandCount)

    return {
      inset: Math.round(index * bandThickness),
      thickness: Math.max(2, Math.ceil(bandThickness)),
      opacity: roundTo(maxOpacity * fade, 3),
    }
  })
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
    vignetteBands: resolveVignetteBands(setting),
  }
}
