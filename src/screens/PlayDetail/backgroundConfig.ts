const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

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

export interface ResolvedPlayDetailBackgroundConfig extends PlayDetailBackgroundSettingValues {
  resolvedMaskColor: string
  colorMask: string
  brightnessOverlayColor: string
  imageBrightnessOverlayOpacity: number
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

  return {
    ...setting,
    resolvedMaskColor,
    colorMask: buildRgba(resolvedMaskColor, setting.colorMaskOpacity),
    brightnessOverlayColor: imageBrightnessDelta >= 0 ? '#ffffff' : '#000000',
    imageBrightnessOverlayOpacity: clamp(Math.abs(imageBrightnessDelta) * 0.42, 0, 0.35),
  }
}
