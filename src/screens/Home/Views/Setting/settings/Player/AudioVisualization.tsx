import { memo, useRef } from 'react'
import { View } from 'react-native'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'
import type { DialogType } from '@/components/common/Dialog'
import ButtonPrimary from '@/components/common/ButtonPrimary'
import Text from '@/components/common/Text'

import SubTitle from '../../components/SubTitle'
import AudioVisualizationDialog from './AudioVisualizationDialog'

export default memo(() => {
  const dialogRef = useRef<DialogType>(null)
  const t = useI18n()
  const enable = useSettingValue('playDetail.audioVisualization.enable')
  const visualStyle = useSettingValue('playDetail.audioVisualization.style')

  const styleLabel = t(visualStyle == 'ring'
    ? 'setting_play_audio_visualization_style_ring'
    : 'setting_play_audio_visualization_style_bars')

  return (
    <SubTitle title={t('setting_play_audio_visualization')}>
      <Text size={12}>{t('setting_play_audio_visualization_desc')}</Text>
      <Text size={12} style={styles.summary}>
        {enable ? styleLabel : t('setting_play_audio_visualization_enable')}
      </Text>
      <View style={styles.actions}>
        <ButtonPrimary onPress={() => { dialogRef.current?.setVisible(true) }}>
          {t('setting_play_audio_visualization_open')}
        </ButtonPrimary>
      </View>
      <AudioVisualizationDialog ref={dialogRef} />
    </SubTitle>
  )
})

const styles = createStyle({
  summary: {
    marginTop: 6,
  },
  actions: {
    marginTop: 10,
  },
})
