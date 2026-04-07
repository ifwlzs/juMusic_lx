import { memo, useCallback } from 'react'
import { View } from 'react-native'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import { useSetting } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'

import InputItem from '../../components/InputItem'
import SubTitle from '../../components/SubTitle'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'

type CustomColorKey =
  | 'theme.playDetail.light.primary'
  | 'theme.playDetail.light.lyricActive'
  | 'theme.playDetail.light.lyricInactive'
  | 'theme.playDetail.light.lyricTranslation'
  | 'theme.playDetail.light.lyricRoma'
  | 'theme.playDetail.dark.primary'
  | 'theme.playDetail.dark.lyricActive'
  | 'theme.playDetail.dark.lyricInactive'
  | 'theme.playDetail.dark.lyricTranslation'
  | 'theme.playDetail.dark.lyricRoma'

const lightFields: Array<{ key: CustomColorKey, labelKey: string }> = [
  { key: 'theme.playDetail.light.primary', labelKey: 'setting_theme_play_detail_primary' },
  { key: 'theme.playDetail.light.lyricActive', labelKey: 'setting_theme_play_detail_lyric_active' },
  { key: 'theme.playDetail.light.lyricInactive', labelKey: 'setting_theme_play_detail_lyric_inactive' },
  { key: 'theme.playDetail.light.lyricTranslation', labelKey: 'setting_theme_play_detail_lyric_translation' },
  { key: 'theme.playDetail.light.lyricRoma', labelKey: 'setting_theme_play_detail_lyric_roma' },
]

const darkFields: Array<{ key: CustomColorKey, labelKey: string }> = [
  { key: 'theme.playDetail.dark.primary', labelKey: 'setting_theme_play_detail_primary' },
  { key: 'theme.playDetail.dark.lyricActive', labelKey: 'setting_theme_play_detail_lyric_active' },
  { key: 'theme.playDetail.dark.lyricInactive', labelKey: 'setting_theme_play_detail_lyric_inactive' },
  { key: 'theme.playDetail.dark.lyricTranslation', labelKey: 'setting_theme_play_detail_lyric_translation' },
  { key: 'theme.playDetail.dark.lyricRoma', labelKey: 'setting_theme_play_detail_lyric_roma' },
]

const Group = ({ title, fields }: {
  title: string
  fields: Array<{ key: CustomColorKey, labelKey: string }>
}) => {
  const t = useI18n()
  const setting = useSetting()
  const theme = useTheme()

  const handleChanged = useCallback((key: CustomColorKey, text: string, callback: (value: string) => void) => {
    const nextValue = text.trim()
    const nextSetting: Partial<LX.AppSetting> = { [key]: nextValue }
    updateSetting(nextSetting)
    callback(nextValue)
  }, [])

  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle} color={theme['c-font']}>{title}</Text>
      {fields.map(({ key, labelKey }) => (
        <InputItem
          autoCapitalize="none"
          autoCorrect={false}
          key={key}
          label={t(labelKey)}
          placeholder={t('setting_theme_play_detail_color_placeholder')}
          value={setting[key]}
          onChanged={(text, callback) => { handleChanged(key, text, callback) }}
        />
      ))}
    </View>
  )
}

export default memo(() => {
  const t = useI18n()

  return (
    <SubTitle title={t('setting_theme_play_detail_colors')}>
      <Group title={t('setting_theme_play_detail_colors_light')} fields={lightFields} />
      <Group title={t('setting_theme_play_detail_colors_dark')} fields={darkFields} />
    </SubTitle>
  )
})

const styles = createStyle({
  group: {
    marginBottom: 12,
  },
  groupTitle: {
    marginBottom: 8,
  },
})
