import { View } from 'react-native'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import ButtonPrimary from '@/components/common/ButtonPrimary'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { setLyricOffset } from '@/core/lyric'
import styles from './style'

const MIN_OFFSET = -5000
const MAX_OFFSET = 5000
const STEPS = [-500, -100, 100, 500]

const clampOffset = (value: number) => Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, value))

export default () => {
  const t = useI18n()
  const offset = useSettingValue('common.lyricOffset') ?? 0

  const handleChange = (delta: number) => {
    const nextOffset = clampOffset(offset + delta)
    updateSetting({ 'common.lyricOffset': nextOffset })
    setLyricOffset(nextOffset)
  }

  const handleReset = () => {
    if (offset === 0) return
    updateSetting({ 'common.lyricOffset': 0 })
    setLyricOffset(0)
  }

  return (
    <View style={styles.container}>
      <Text>{t('play_detail_setting_lyric_offset')}</Text>
      <View style={styles.content}>
        <Text style={styles.label}>{`${offset}ms`}</Text>
        <View style={styles.list}>
          {STEPS.map(step => (
            <Button key={step} onPress={() => { handleChange(step) }} style={{ marginRight: 8, marginBottom: 8 }}>
              <Text>{step > 0 ? `+${step}` : `${step}`}</Text>
            </Button>
          ))}
        </View>
      </View>
      <ButtonPrimary onPress={handleReset}>{t('play_detail_setting_playback_rate_reset')}</ButtonPrimary>
    </View>
  )
}

