import themeState from '@/store/theme/state'

export const playDetailPalette = {
  get PRIMARY_TEXT() {
    return themeState.theme['c-primary-font']
  },
  get SECONDARY_TEXT() {
    return themeState.theme['c-primary-font']
  },
  get TERTIARY_TEXT() {
    return themeState.theme['c-primary-font-active']
  },
  get LYRIC_ACTIVE_TEXT() {
    return themeState.theme['c-primary-light-100']
  },
  get LYRIC_ACTIVE_TRANSLATION_TEXT() {
    return themeState.theme['c-primary-light-200']
  },
} as const
