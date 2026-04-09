import { memo, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'
import type { DialogType } from '@/components/common/Dialog'
import ButtonPrimary from '@/components/common/ButtonPrimary'
import Text from '@/components/common/Text'

import SubTitle from '../../components/SubTitle'
import PlayDetailBackgroundDialog from './PlayDetailBackgroundDialog'

export default memo(() => {
  const dialogRef = useRef<DialogType>(null)
  const t = useI18n()
  const isDynamicBg = useSettingValue('theme.dynamicBg')
  const maskMode = useSettingValue('theme.playDetail.background.maskMode')
  const blurRadius = useSettingValue('theme.playDetail.background.blurRadius')
  const colorMaskOpacity = useSettingValue('theme.playDetail.background.colorMaskOpacity')

  const maskModeLabel = useMemo(() => t(
    maskMode == 'manual'
      ? 'setting_theme_play_detail_background_mask_mode_manual'
      : 'setting_theme_play_detail_background_mask_mode_auto',
  ), [maskMode, t])

  return (
    <SubTitle title={t('setting_theme_play_detail_background')}>
      <Text size={12}>{t('setting_theme_play_detail_background_desc')}</Text>
      <Text size={12} style={styles.summary}>
        {t('setting_theme_play_detail_background_summary', {
          maskMode: maskModeLabel,
          blurRadius,
          opacity: Math.round(colorMaskOpacity * 100),
        })}
      </Text>
      {!isDynamicBg ? <Text size={12} style={styles.hint}>{t('setting_theme_play_detail_background_disabled_hint')}</Text> : null}
      <View style={styles.actions}>
        <ButtonPrimary onPress={() => { dialogRef.current?.setVisible(true) }}>
          {t('setting_theme_play_detail_background_open')}
        </ButtonPrimary>
      </View>
      <PlayDetailBackgroundDialog ref={dialogRef} />
    </SubTitle>
  )
})

const styles = createStyle({
  summary: {
    marginTop: 6,
  },
  hint: {
    marginTop: 6,
  },
  actions: {
    marginTop: 10,
  },
})
