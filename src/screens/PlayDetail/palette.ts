import settingState from '@/store/setting/state'
import themeState from '@/store/theme/state'

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

export const playDetailPalette = {
  get PRIMARY_TEXT() {
    return resolvePlayDetailColor('primary', themeState.theme['c-primary-font'])
  },
  get SECONDARY_TEXT() {
    return resolvePlayDetailColor('primary', themeState.theme['c-primary-font'])
  },
  get TERTIARY_TEXT() {
    return resolvePlayDetailColor('lyricTranslation', themeState.theme['c-primary-font-active'])
  },
  get LYRIC_ACTIVE_TEXT() {
    return resolvePlayDetailColor('lyricActive', themeState.theme.isDark ? '#FFFFFF' : themeState.theme['c-primary-light-100'])
  },
  get LYRIC_ACTIVE_TRANSLATION_TEXT() {
    return resolvePlayDetailColor('lyricTranslation', themeState.theme['c-primary-light-200'])
  },
  get LYRIC_ACTIVE_ROMA_TEXT() {
    return resolvePlayDetailColor('lyricRoma', themeState.theme['c-primary-light-200'])
  },
  get LYRIC_INACTIVE_TEXT() {
    return resolvePlayDetailColor('lyricInactive', themeState.theme['c-primary-font'])
  },
  get LYRIC_TRANSLATION_TEXT() {
    return resolvePlayDetailColor('lyricTranslation', themeState.theme['c-primary-font-active'])
  },
  get LYRIC_ROMA_TEXT() {
    return resolvePlayDetailColor('lyricRoma', themeState.theme['c-primary-light-200'])
  },
} as const
