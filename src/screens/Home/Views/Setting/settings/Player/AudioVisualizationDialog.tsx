import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import { useSetting } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Button from '@/components/common/Button'
import Text from '@/components/common/Text'
import CheckBoxItem from '../../components/CheckBoxItem'
import Slider from '../../components/Slider'
import { isSpectrumSourceAvailable } from '@/components/common/AudioVisualizer/native'

type VisualizationStyle = LX.AppSetting['playDetail.audioVisualization.style']

const formatPercent = (value: number) => `${Math.round(value * 100)}%`

const SliderField = memo(({
  label,
  value,
  minimumValue,
  maximumValue,
  step,
  formatValue = value => String(Math.round(value)),
  onValueChange,
  onSlidingComplete,
}: {
  label: string
  value: number
  minimumValue: number
  maximumValue: number
  step: number
  formatValue?: (value: number) => string
  onValueChange: (value: number) => void
  onSlidingComplete: (value: number) => void
}) => {
  const theme = useTheme()

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldHeader}>
        <Text>{label}</Text>
        <Text size={12} color={theme['c-font-label']}>{formatValue(value)}</Text>
      </View>
      <Slider
        value={value}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        onValueChange={onValueChange}
        onSlidingComplete={onSlidingComplete}
        step={step}
      />
    </View>
  )
})

export default forwardRef<DialogType, {}>((_props, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const setting = useSetting()
  const innerDialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  // 中文注释：草稿只用于滑动过程中的即时反馈，松手才写入设置，避免每帧持久化。
  const [draft, setDraft] = useState(() => ({
    barCount: setting['playDetail.audioVisualization.barCount'],
    barGapRatio: setting['playDetail.audioVisualization.barGapRatio'],
    ringAmplitude: setting['playDetail.audioVisualization.ringAmplitude'],
    opacity: setting['playDetail.audioVisualization.opacity'],
  }))
  const [sourceAvailable, setSourceAvailable] = useState(true)

  const enable = setting['playDetail.audioVisualization.enable']
  const visualStyle = setting['playDetail.audioVisualization.style']
  const barMirror = setting['playDetail.audioVisualization.barMirror']
  const ringGlow = setting['playDetail.audioVisualization.ringGlow']

  const syncDraft = useCallback((nextSetting: LX.AppSetting) => {
    setDraft({
      barCount: nextSetting['playDetail.audioVisualization.barCount'],
      barGapRatio: nextSetting['playDetail.audioVisualization.barGapRatio'],
      ringAmplitude: nextSetting['playDetail.audioVisualization.ringAmplitude'],
      opacity: nextSetting['playDetail.audioVisualization.opacity'],
    })
  }, [])

  useEffect(() => {
    if (visible) return
    syncDraft(setting)
  }, [setting, syncDraft, visible])

  // 中文注释：打开面板时检测取样链路，音频卸载抢走软件链路时给出明确提示而不是让用户对着空白面板猜。
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void isSpectrumSourceAvailable().then(available => {
      if (!cancelled) setSourceAvailable(available)
    })
    return () => {
      cancelled = true
    }
  }, [visible])

  useImperativeHandle(ref, () => ({
    setVisible(nextVisible: boolean) {
      if (nextVisible) syncDraft(setting)
      setVisible(nextVisible)
      innerDialogRef.current?.setVisible(nextVisible)
    },
  }), [setting, syncDraft])

  const handleStyleChange = useCallback((nextStyle: VisualizationStyle) => {
    updateSetting({ 'playDetail.audioVisualization.style': nextStyle })
  }, [])

  return (
    <Dialog
      ref={innerDialogRef}
      title={t('setting_play_audio_visualization')}
      height="80%"
      bgHide={false}
      onHide={() => { setVisible(false) }}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text size={12} color={theme['c-font-label']} style={styles.desc}>
          {t('setting_play_audio_visualization_desc')}
        </Text>

        <CheckBoxItem
          check={enable}
          onChange={value => { updateSetting({ 'playDetail.audioVisualization.enable': value }) }}
          helpDesc={t('setting_play_audio_visualization_enable_tip')}
          label={t('setting_play_audio_visualization_enable')}
        />

        {enable && !sourceAvailable
          ? (
            <Text size={12} color={theme['c-font-label']} style={styles.warning}>
              {t('setting_play_audio_visualization_unavailable')}
            </Text>
            )
          : null}

        <View style={styles.fieldBlock}>
          <View style={styles.fieldHeader}>
            <Text>{t('setting_play_audio_visualization_style')}</Text>
          </View>
          <View style={styles.toggleRow}>
            <Button
              style={{ ...styles.toggleButton, backgroundColor: visualStyle == 'bars' ? theme['c-button-background-selected'] : theme['c-button-background'] }}
              onPress={() => { handleStyleChange('bars') }}
            >
              <Text color={visualStyle == 'bars' ? theme['c-button-font-selected'] : theme['c-button-font']}>
                {t('setting_play_audio_visualization_style_bars')}
              </Text>
            </Button>
            <Button
              style={{ ...styles.toggleButton, backgroundColor: visualStyle == 'ring' ? theme['c-button-background-selected'] : theme['c-button-background'] }}
              onPress={() => { handleStyleChange('ring') }}
            >
              <Text color={visualStyle == 'ring' ? theme['c-button-font-selected'] : theme['c-button-font']}>
                {t('setting_play_audio_visualization_style_ring')}
              </Text>
            </Button>
          </View>
        </View>

        {visualStyle == 'bars'
          ? (
            <>
              <SliderField
                label={t('setting_play_audio_visualization_bar_count')}
                value={draft.barCount}
                minimumValue={8}
                maximumValue={64}
                step={4}
                onValueChange={value => { setDraft(prev => ({ ...prev, barCount: value })) }}
                onSlidingComplete={value => { updateSetting({ 'playDetail.audioVisualization.barCount': value }) }}
              />
              <SliderField
                label={t('setting_play_audio_visualization_bar_gap')}
                value={draft.barGapRatio}
                minimumValue={0}
                maximumValue={0.7}
                step={0.02}
                formatValue={formatPercent}
                onValueChange={value => { setDraft(prev => ({ ...prev, barGapRatio: value })) }}
                onSlidingComplete={value => { updateSetting({ 'playDetail.audioVisualization.barGapRatio': value }) }}
              />
              <CheckBoxItem
                check={barMirror}
                onChange={value => { updateSetting({ 'playDetail.audioVisualization.barMirror': value }) }}
                helpDesc={t('setting_play_audio_visualization_bar_mirror_tip')}
                label={t('setting_play_audio_visualization_bar_mirror')}
              />
            </>
            )
          : (
            <>
              <SliderField
                label={t('setting_play_audio_visualization_ring_amplitude')}
                value={draft.ringAmplitude}
                minimumValue={0.04}
                maximumValue={0.34}
                step={0.01}
                formatValue={formatPercent}
                onValueChange={value => { setDraft(prev => ({ ...prev, ringAmplitude: value })) }}
                onSlidingComplete={value => { updateSetting({ 'playDetail.audioVisualization.ringAmplitude': value }) }}
              />
              <CheckBoxItem
                check={ringGlow}
                onChange={value => { updateSetting({ 'playDetail.audioVisualization.ringGlow': value }) }}
                label={t('setting_play_audio_visualization_ring_glow')}
              />
            </>
            )}

        <SliderField
          label={t('setting_play_audio_visualization_opacity')}
          value={draft.opacity}
          minimumValue={0.2}
          maximumValue={1}
          step={0.05}
          formatValue={formatPercent}
          onValueChange={value => { setDraft(prev => ({ ...prev, opacity: value })) }}
          onSlidingComplete={value => { updateSetting({ 'playDetail.audioVisualization.opacity': value }) }}
        />
      </ScrollView>
    </Dialog>
  )
})

const styles = createStyle({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 18,
  },
  desc: {
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  warning: {
    paddingHorizontal: 25,
    marginTop: 4,
    marginBottom: 6,
  },
  fieldBlock: {
    marginBottom: 10,
    marginTop: 6,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    marginRight: 10,
    marginBottom: 8,
  },
})
