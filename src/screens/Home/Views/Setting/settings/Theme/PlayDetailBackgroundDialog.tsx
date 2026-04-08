import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { useSetting } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { defaultHeaders } from '@/components/common/Image'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Button from '@/components/common/Button'
import Text from '@/components/common/Text'
import { extractDominantHueFromImage } from '@/utils/nativeModules/utils'
import type { InputItemProps } from '../../components/InputItem'
import InputItem from '../../components/InputItem'
import Slider, { type SliderProps } from '../../components/Slider'
import PlayDetailBackgroundLayer from '@/screens/PlayDetail/BackgroundLayer'
import {
  createGrayBiasedMaskColor,
  playDetailBackgroundDefaults,
  readPlayDetailBackgroundSetting,
  resolvePlayDetailBackgroundConfig,
  type PlayDetailBackgroundSettingValues,
} from '@/screens/PlayDetail/backgroundConfig'

type BackgroundSettingKey = keyof PlayDetailBackgroundSettingValues

const backgroundSettingKeyMap: Record<BackgroundSettingKey, keyof LX.AppSetting> = {
  stretchScale: 'theme.playDetail.background.stretchScale',
  blurRadius: 'theme.playDetail.background.blurRadius',
  imageBrightness: 'theme.playDetail.background.imageBrightness',
  imageContrast: 'theme.playDetail.background.imageContrast',
  maskMode: 'theme.playDetail.background.maskMode',
  maskColor: 'theme.playDetail.background.maskColor',
  colorMaskOpacity: 'theme.playDetail.background.colorMaskOpacity',
  maskSaturation: 'theme.playDetail.background.maskSaturation',
  maskLightness: 'theme.playDetail.background.maskLightness',
  vignetteColor: 'theme.playDetail.background.vignetteColor',
  vignetteSize: 'theme.playDetail.background.vignetteSize',
}

const HEX_COLOR_RXP = /^#([0-9a-f]{6})$/i

const normalizeHexColor = (value: string) => value.trim().toLowerCase()

const formatPercent = (value: number) => `${Math.round(value * 100)}%`
const formatDecimal = (value: number) => value.toFixed(2)

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
  onValueChange: NonNullable<SliderProps['onValueChange']>
  onSlidingComplete: NonNullable<SliderProps['onSlidingComplete']>
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

const PreviewPlaceholder = memo(({ hasCover }: { hasCover: boolean }) => {
  const t = useI18n()

  return (
    <View pointerEvents="none" style={styles.previewPlaceholder}>
      <View style={styles.previewDisc} />
      <View style={styles.previewMeta}>
        <View style={styles.previewLinePrimary} />
        <View style={styles.previewLineSecondary} />
        <View style={styles.previewButtons}>
          <View style={styles.previewButton} />
          <View style={styles.previewButton} />
          <View style={styles.previewButton} />
        </View>
        {!hasCover ? <Text size={12} color="rgba(255,255,255,0.78)">{t('setting_theme_play_detail_background_preview_empty')}</Text> : null}
      </View>
    </View>
  )
})

const SectionTitle = memo(({ title, desc }: { title: string, desc?: string }) => {
  const theme = useTheme()

  return (
    <View style={styles.sectionTitle}>
      <Text>{title}</Text>
      {desc ? <Text size={12} color={theme['c-font-label']} style={styles.sectionDesc}>{desc}</Text> : null}
    </View>
  )
})

export default forwardRef<DialogType, {}>((_props, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const musicInfo = usePlayerMusicInfo()
  const setting = useSetting()
  const innerDialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  const [draft, setDraft] = useState(() => readPlayDetailBackgroundSetting(setting))
  const [maskColorInput, setMaskColorInput] = useState(draft.maskColor)
  const [vignetteColorInput, setVignetteColorInput] = useState(draft.vignetteColor)
  const [maskColorInvalid, setMaskColorInvalid] = useState(false)
  const [vignetteColorInvalid, setVignetteColorInvalid] = useState(false)
  const [recommendedMaskColor, setRecommendedMaskColor] = useState<string | null>(playDetailBackgroundDefaults.maskColor)
  const lastSuccessfulRecommendedMaskColorRef = useRef<string | null>(null)

  const syncDraftFromSetting = useCallback((nextSetting: LX.AppSetting) => {
    const nextDraft = readPlayDetailBackgroundSetting(nextSetting)
    setDraft(nextDraft)
    setMaskColorInput(nextDraft.maskColor)
    setVignetteColorInput(nextDraft.vignetteColor)
    setMaskColorInvalid(false)
    setVignetteColorInvalid(false)
  }, [])

  useEffect(() => {
    if (visible) return
    syncDraftFromSetting(setting)
  }, [setting, syncDraftFromSetting, visible])

  useImperativeHandle(ref, () => ({
    setVisible(nextVisible: boolean) {
      if (nextVisible) syncDraftFromSetting(setting)
      setVisible(nextVisible)
      innerDialogRef.current?.setVisible(nextVisible)
    },
  }), [setting, syncDraftFromSetting])

  const persistDraftPatch = useCallback((patch: Partial<PlayDetailBackgroundSettingValues>) => {
    const nextSetting: Partial<LX.AppSetting> = {}
    for (const [key, value] of Object.entries(patch) as Array<[BackgroundSettingKey, PlayDetailBackgroundSettingValues[BackgroundSettingKey]]>) {
      ;(nextSetting as Record<string, unknown>)[backgroundSettingKeyMap[key]] = value
    }
    updateSetting(nextSetting)
  }, [])

  const applyDraftPatch = useCallback((patch: Partial<PlayDetailBackgroundSettingValues>, persist = false) => {
    setDraft(prev => ({ ...prev, ...patch }))
    if (persist) persistDraftPatch(patch)
  }, [persistDraftPatch])

  useEffect(() => {
    let cancelled = false
    const fallbackColor = lastSuccessfulRecommendedMaskColorRef.current ?? playDetailBackgroundDefaults.maskColor

    if (!musicInfo.pic) {
      setRecommendedMaskColor(fallbackColor)
      return
    }

    void extractDominantHueFromImage(musicInfo.pic).then(hue => {
      if (cancelled) return
      if (typeof hue == 'number' && Number.isFinite(hue)) {
        const nextColor = createGrayBiasedMaskColor(hue, draft.maskSaturation, draft.maskLightness)
        lastSuccessfulRecommendedMaskColorRef.current = nextColor
        setRecommendedMaskColor(nextColor)
        return
      }
      setRecommendedMaskColor(fallbackColor)
    })

    return () => {
      cancelled = true
    }
  }, [draft.maskLightness, draft.maskSaturation, musicInfo.pic])

  const resolvedConfig = useMemo(() => resolvePlayDetailBackgroundConfig({
    setting: draft,
    recommendedMaskColor,
  }), [draft, recommendedMaskColor])

  const previewSource = useMemo(() => musicInfo.pic
    ? { uri: musicInfo.pic, headers: defaultHeaders }
    : null
  , [musicInfo.pic])

  const previewMaskLabel = useMemo(() => t(
    draft.maskMode == 'manual'
      ? 'setting_theme_play_detail_background_mask_mode_manual'
      : 'setting_theme_play_detail_background_mask_mode_auto',
  ), [draft.maskMode, t])

  const handleHide = useCallback(() => {
    setVisible(false)
    syncDraftFromSetting(setting)
  }, [setting, syncDraftFromSetting])

  const handleRestoreDefault = useCallback(() => {
    setDraft(playDetailBackgroundDefaults)
    setMaskColorInput(playDetailBackgroundDefaults.maskColor)
    setVignetteColorInput(playDetailBackgroundDefaults.vignetteColor)
    setMaskColorInvalid(false)
    setVignetteColorInvalid(false)
    persistDraftPatch(playDetailBackgroundDefaults)
  }, [persistDraftPatch])

  const handleApplyRecommendedMask = useCallback(() => {
    if (!musicInfo.pic || !recommendedMaskColor) return
    setMaskColorInput(recommendedMaskColor)
    setMaskColorInvalid(false)
    applyDraftPatch({
      maskMode: 'manual',
      maskColor: recommendedMaskColor,
    }, true)
  }, [applyDraftPatch, musicInfo.pic, recommendedMaskColor])

  const handleMaskModeChange = useCallback((maskMode: PlayDetailBackgroundSettingValues['maskMode']) => {
    applyDraftPatch({ maskMode }, true)
  }, [applyDraftPatch])

  const handleMaskColorChanged = useCallback<InputItemProps['onChanged']>((text, callback) => {
    const nextValue = normalizeHexColor(text)
    setMaskColorInput(nextValue)
    if (!HEX_COLOR_RXP.test(nextValue)) {
      setMaskColorInvalid(nextValue.length > 0)
      callback(nextValue)
      return
    }

    setMaskColorInvalid(false)
    callback(nextValue)
    applyDraftPatch({ maskColor: nextValue }, true)
  }, [applyDraftPatch])

  const handleVignetteColorChanged = useCallback<InputItemProps['onChanged']>((text, callback) => {
    const nextValue = normalizeHexColor(text)
    setVignetteColorInput(nextValue)
    if (!HEX_COLOR_RXP.test(nextValue)) {
      setVignetteColorInvalid(nextValue.length > 0)
      callback(nextValue)
      return
    }

    setVignetteColorInvalid(false)
    callback(nextValue)
    applyDraftPatch({ vignetteColor: nextValue }, true)
  }, [applyDraftPatch])

  return (
    <Dialog
      ref={innerDialogRef}
      title={t('setting_theme_play_detail_background')}
      height="86%"
      bgHide={false}
      onHide={handleHide}
    >
      <View style={styles.dialogContent}>
        <View style={styles.previewSection}>
          <View style={styles.previewActionRow}>
            <View style={styles.previewSummary}>
              <Text color={theme['c-primary-font']}>{previewMaskLabel}</Text>
              <Text size={12} color={theme['c-font-label']}>
                {t('setting_theme_play_detail_background_summary', {
                  maskMode: previewMaskLabel,
                  blurRadius: Math.round(draft.blurRadius),
                  opacity: Math.round(draft.colorMaskOpacity * 100),
                })}
              </Text>
            </View>
            <Button style={{ ...styles.actionButton, backgroundColor: theme['c-button-background'] }} onPress={handleRestoreDefault}>
              <Text color={theme['c-button-font']}>{t('setting_theme_play_detail_background_restore_default')}</Text>
            </Button>
          </View>
          <View style={{ ...styles.previewCard, backgroundColor: theme['c-main-background'] }}>
            <PlayDetailBackgroundLayer source={previewSource} resolvedConfig={resolvedConfig}>
              <PreviewPlaceholder hasCover={!!musicInfo.pic} />
            </PlayDetailBackgroundLayer>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <SectionTitle title={t('setting_theme_play_detail_background_group_base')} />
          <SliderField
            label={t('setting_theme_play_detail_background_stretch_scale')}
            value={draft.stretchScale}
            minimumValue={1}
            maximumValue={1.3}
            step={0.01}
            formatValue={formatDecimal}
            onValueChange={value => { applyDraftPatch({ stretchScale: value }) }}
            onSlidingComplete={value => { applyDraftPatch({ stretchScale: value }, true) }}
          />
          <SliderField
            label={t('setting_theme_play_detail_background_blur_radius')}
            value={draft.blurRadius}
            minimumValue={80}
            maximumValue={320}
            step={2}
            onValueChange={value => { applyDraftPatch({ blurRadius: value }) }}
            onSlidingComplete={value => { applyDraftPatch({ blurRadius: value }, true) }}
          />
          <SliderField
            label={t('setting_theme_play_detail_background_image_brightness')}
            value={draft.imageBrightness}
            minimumValue={0.6}
            maximumValue={1.4}
            step={0.02}
            formatValue={formatDecimal}
            onValueChange={value => { applyDraftPatch({ imageBrightness: value }) }}
            onSlidingComplete={value => { applyDraftPatch({ imageBrightness: value }, true) }}
          />
          <SliderField
            label={t('setting_theme_play_detail_background_image_contrast')}
            value={draft.imageContrast}
            minimumValue={1}
            maximumValue={2.2}
            step={0.02}
            formatValue={formatDecimal}
            onValueChange={value => { applyDraftPatch({ imageContrast: value }) }}
            onSlidingComplete={value => { applyDraftPatch({ imageContrast: value }, true) }}
          />

          <SectionTitle title={t('setting_theme_play_detail_background_group_mask')} />
          <View style={styles.fieldBlock}>
            <View style={styles.fieldHeader}>
              <Text>{t('setting_theme_play_detail_background_mask_mode')}</Text>
            </View>
            <View style={styles.toggleRow}>
              <Button
                style={{
                  ...styles.toggleButton,
                  backgroundColor: draft.maskMode == 'auto' ? theme['c-button-background-selected'] : theme['c-button-background'],
                }}
                onPress={() => { handleMaskModeChange('auto') }}
              >
                <Text color={draft.maskMode == 'auto' ? theme['c-button-font-selected'] : theme['c-button-font']}>
                  {t('setting_theme_play_detail_background_mask_mode_auto')}
                </Text>
              </Button>
              <Button
                style={{
                  ...styles.toggleButton,
                  backgroundColor: draft.maskMode == 'manual' ? theme['c-button-background-selected'] : theme['c-button-background'],
                }}
                onPress={() => { handleMaskModeChange('manual') }}
              >
                <Text color={draft.maskMode == 'manual' ? theme['c-button-font-selected'] : theme['c-button-font']}>
                  {t('setting_theme_play_detail_background_mask_mode_manual')}
                </Text>
              </Button>
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <InputItem
              autoCapitalize="none"
              autoCorrect={false}
              label={t('setting_theme_play_detail_background_mask_color')}
              value={maskColorInput}
              onChanged={handleMaskColorChanged}
              placeholder="#914c4c"
            />
            <View style={styles.colorMeta}>
              <View style={{ ...styles.colorSwatch, backgroundColor: draft.maskColor }} />
              <Text size={12} color={theme['c-font-label']}>{draft.maskColor}</Text>
            </View>
            {maskColorInvalid ? <Text size={12} color={theme['c-font-label']} style={styles.errorText}>{t('setting_theme_play_detail_background_invalid_color')}</Text> : null}
          </View>

          <SliderField
            label={t('setting_theme_play_detail_background_color_mask_opacity')}
            value={draft.colorMaskOpacity}
            minimumValue={0.1}
            maximumValue={0.8}
            step={0.01}
            formatValue={formatPercent}
            onValueChange={value => { applyDraftPatch({ colorMaskOpacity: value }) }}
            onSlidingComplete={value => { applyDraftPatch({ colorMaskOpacity: value }, true) }}
          />

          <SectionTitle
            title={t('setting_theme_play_detail_background_group_auto')}
            desc={t('setting_theme_play_detail_background_recommended_mask')}
          />
          <View style={styles.recommendedCard}>
            <View style={styles.colorMeta}>
              <View style={{ ...styles.colorSwatch, backgroundColor: recommendedMaskColor ?? playDetailBackgroundDefaults.maskColor }} />
              <View style={styles.recommendedText}>
                <Text>{recommendedMaskColor ?? playDetailBackgroundDefaults.maskColor}</Text>
                <Text size={12} color={theme['c-font-label']}>{musicInfo.pic ? t('setting_theme_play_detail_background_apply_auto_mask') : t('setting_theme_play_detail_background_preview_empty')}</Text>
              </View>
            </View>
            <Button
              disabled={!musicInfo.pic || !recommendedMaskColor}
              style={{ ...styles.actionButton, backgroundColor: theme['c-button-background'] }}
              onPress={handleApplyRecommendedMask}
            >
              <Text color={theme['c-button-font']}>{t('setting_theme_play_detail_background_apply_auto_mask')}</Text>
            </Button>
          </View>

          <SliderField
            label={t('setting_theme_play_detail_background_mask_saturation')}
            value={draft.maskSaturation}
            minimumValue={0.12}
            maximumValue={0.5}
            step={0.01}
            formatValue={formatDecimal}
            onValueChange={value => { applyDraftPatch({ maskSaturation: value }) }}
            onSlidingComplete={value => { applyDraftPatch({ maskSaturation: value }, true) }}
          />
          <SliderField
            label={t('setting_theme_play_detail_background_mask_lightness')}
            value={draft.maskLightness}
            minimumValue={0.24}
            maximumValue={0.62}
            step={0.01}
            formatValue={formatDecimal}
            onValueChange={value => { applyDraftPatch({ maskLightness: value }) }}
            onSlidingComplete={value => { applyDraftPatch({ maskLightness: value }, true) }}
          />

          <SectionTitle title={t('setting_theme_play_detail_background_group_vignette')} />
          <View style={styles.fieldBlock}>
            <InputItem
              autoCapitalize="none"
              autoCorrect={false}
              label={t('setting_theme_play_detail_background_vignette_color')}
              value={vignetteColorInput}
              onChanged={handleVignetteColorChanged}
              placeholder="#898685"
            />
            <View style={styles.colorMeta}>
              <View style={{ ...styles.colorSwatch, backgroundColor: draft.vignetteColor }} />
              <Text size={12} color={theme['c-font-label']}>{draft.vignetteColor}</Text>
            </View>
            {vignetteColorInvalid ? <Text size={12} color={theme['c-font-label']} style={styles.errorText}>{t('setting_theme_play_detail_background_invalid_color')}</Text> : null}
          </View>

          <SliderField
            label={t('setting_theme_play_detail_background_vignette_size')}
            value={draft.vignetteSize}
            minimumValue={100}
            maximumValue={380}
            step={2}
            onValueChange={value => { applyDraftPatch({ vignetteSize: value }) }}
            onSlidingComplete={value => { applyDraftPatch({ vignetteSize: value }, true) }}
          />
        </ScrollView>
      </View>
    </Dialog>
  )
})

const styles = createStyle({
  dialogContent: {
    flex: 1,
  },
  previewSection: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  previewActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  previewSummary: {
    flex: 1,
    paddingRight: 10,
  },
  previewCard: {
    height: 220,
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewPlaceholder: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  previewDisc: {
    width: 86,
    height: 86,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  previewMeta: {
    flex: 1,
    marginLeft: 16,
  },
  previewLinePrimary: {
    width: '72%',
    height: 15,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.88)',
    marginBottom: 10,
  },
  previewLineSecondary: {
    width: '52%',
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.54)',
    marginBottom: 16,
  },
  previewButtons: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  previewButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginRight: 10,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 18,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 6,
  },
  sectionDesc: {
    marginTop: 4,
  },
  fieldBlock: {
    marginBottom: 10,
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
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  colorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 25,
    marginTop: -8,
  },
  colorSwatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 8,
  },
  errorText: {
    paddingLeft: 25,
    marginTop: 4,
  },
  recommendedCard: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  recommendedText: {
    flex: 1,
  },
})
