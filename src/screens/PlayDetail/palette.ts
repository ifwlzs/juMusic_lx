import settingState from '@/store/setting/state'
import themeState from '@/store/theme/state'
import normalizeColor from '@react-native/normalize-colors'

const AMBIENT_WHITE = '#FFFFFF'
const ambientWhite = (alpha: number) => `rgba(255, 255, 255, ${alpha.toFixed(2)})`
const isAmbientDark = () => settingState.setting['theme.playDetail.background.variant'] == 'ambientDark'

const playDetailSettingKeys = {
  light: {
    primary: 'theme.playDetail.light.primary',
    lyricActive: 'theme.playDetail.light.lyricActive',
    lyricInactive: 'theme.playDetail.light.lyricInactive',
    lyricTranslation: 'theme.playDetail.light.lyricTranslation',
    lyricRoma: 'theme.playDetail.light.lyricRoma',
  },
  dark: {
    primary: 'theme.playDetail.dark.primary',
    lyricActive: 'theme.playDetail.dark.lyricActive',
    lyricInactive: 'theme.playDetail.dark.lyricInactive',
    lyricTranslation: 'theme.playDetail.dark.lyricTranslation',
    lyricRoma: 'theme.playDetail.dark.lyricRoma',
  },
} as const

const getPlayDetailGroupKey = <T extends 'primary' | 'lyricActive' | 'lyricInactive' | 'lyricTranslation' | 'lyricRoma'>(key: T) => {
  return (themeState.theme.isDark ? playDetailSettingKeys.dark : playDetailSettingKeys.light)[key]
}

const resolvePlayDetailColor = <T extends 'primary' | 'lyricActive' | 'lyricInactive' | 'lyricTranslation' | 'lyricRoma'>(key: T, fallback: string) => {
  const customColor = settingState.setting[getPlayDetailGroupKey(key)]
  return customColor || fallback
}

const withAlpha = (color: string, alpha: number) => {
  const normalizedColor = normalizeColor(color)
  if (normalizedColor == null) return color

  const red = normalizedColor >>> 24
  const green = (normalizedColor >>> 16) & 255
  const blue = (normalizedColor >>> 8) & 255
  const baseAlpha = (normalizedColor & 255) / 255
  const nextAlpha = Math.max(0, Math.min(1, baseAlpha * alpha))

  return `rgba(${red}, ${green}, ${blue}, ${nextAlpha.toFixed(2)})`
}

export const playDetailPalette = {
  get PRIMARY_TEXT() {
    if (isAmbientDark()) return AMBIENT_WHITE
    return resolvePlayDetailColor('primary', themeState.theme['c-primary-font'])
  },
  get SECONDARY_TEXT() {
    if (isAmbientDark()) return ambientWhite(0.72)
    return resolvePlayDetailColor('primary', themeState.theme['c-primary-font'])
  },
  get TERTIARY_TEXT() {
    if (isAmbientDark()) return ambientWhite(0.46)
    return resolvePlayDetailColor('lyricTranslation', themeState.theme['c-primary-font-active'])
  },
  get LYRIC_ACTIVE_TEXT() {
    if (isAmbientDark()) return AMBIENT_WHITE
    return resolvePlayDetailColor('lyricActive', themeState.theme.isDark ? '#FFFFFF' : themeState.theme['c-primary-light-100'])
  },
  get LYRIC_ACTIVE_TRANSLATION_TEXT() {
    if (isAmbientDark()) return ambientWhite(0.72)
    return resolvePlayDetailColor('lyricTranslation', themeState.theme['c-primary-light-200'])
  },
  get LYRIC_ACTIVE_ROMA_TEXT() {
    if (isAmbientDark()) return ambientWhite(0.72)
    return resolvePlayDetailColor('lyricRoma', themeState.theme['c-primary-light-200'])
  },
  get LYRIC_INACTIVE_TEXT() {
    if (isAmbientDark()) return ambientWhite(0.46)
    return resolvePlayDetailColor('lyricInactive', themeState.theme['c-primary-font'])
  },
  get LYRIC_TRANSLATION_TEXT() {
    if (isAmbientDark()) return ambientWhite(0.38)
    return resolvePlayDetailColor('lyricTranslation', themeState.theme['c-primary-font-active'])
  },
  get LYRIC_ROMA_TEXT() {
    if (isAmbientDark()) return ambientWhite(0.38)
    return resolvePlayDetailColor('lyricRoma', themeState.theme['c-primary-light-200'])
  },
  get PROGRESS_COLORS() {
    if (isAmbientDark()) {
      return {
        track: ambientWhite(0.16),
        buffered: ambientWhite(0.28),
        played: ambientWhite(0.82),
        playedDragging: ambientWhite(0.94),
        dragPreview: ambientWhite(1),
        thumb: AMBIENT_WHITE,
      }
    }
    const progressPrimary = resolvePlayDetailColor('primary', themeState.theme['c-primary'])
    return {
      track: withAlpha(progressPrimary, themeState.theme.isDark ? 0.16 : 0.12),
      buffered: withAlpha(progressPrimary, themeState.theme.isDark ? 0.26 : 0.2),
      played: withAlpha(progressPrimary, themeState.theme.isDark ? 0.74 : 0.6),
      playedDragging: withAlpha(progressPrimary, themeState.theme.isDark ? 0.88 : 0.74),
      dragPreview: withAlpha(progressPrimary, 1),
      thumb: progressPrimary,
    }
  },
} as const
