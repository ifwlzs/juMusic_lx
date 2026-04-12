import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'
import ChoosePath, { type ChoosePathType } from '@/components/common/ChoosePath'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Input from '@/components/common/Input'
import CheckBox from '@/components/common/CheckBox'
import Button from '@/components/common/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle, toast } from '@/utils/tools'
import { handleExportPlayHistoryJson } from './actions'
import { resolvePlayHistoryExportRange } from './playHistoryExport'

type PlayHistoryExportPreset = 'all' | 'year' | 'last30Days' | 'custom'

interface PlayHistoryExportSelection {
  preset: PlayHistoryExportPreset
  startDate?: string
  endDate?: string
}

export interface PlayHistoryExportType {
  export: () => void
}

const initialSelection: PlayHistoryExportSelection = {
  preset: 'all',
  startDate: '',
  endDate: '',
}

const presetKeyMap: Record<PlayHistoryExportPreset, string> = {
  all: 'setting_backup_play_history_range_all',
  year: 'setting_backup_play_history_range_year',
  last30Days: 'setting_backup_play_history_range_last_30_days',
  custom: 'setting_backup_play_history_range_custom',
}

export default forwardRef<PlayHistoryExportType, {}>((_props, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const dialogRef = useRef<DialogType>(null)
  const choosePathRef = useRef<ChoosePathType>(null)
  const selectionRef = useRef<PlayHistoryExportSelection>(initialSelection)
  const [mounted, setMounted] = useState(false)
  const [draft, setDraft] = useState<PlayHistoryExportSelection>(initialSelection)

  const showRangeDialog = useCallback(() => {
    const show = () => {
      dialogRef.current?.setVisible(true)
    }
    if (mounted) show()
    else {
      setMounted(true)
      requestAnimationFrame(show)
    }
  }, [mounted])

  useImperativeHandle(ref, () => ({
    export() {
      showRangeDialog()
    },
  }), [showRangeDialog])

  const getRangeErrorMessage = useCallback((error: any) => {
    switch (error?.message) {
      case 'invalid_start_date':
        return t('setting_backup_play_history_range_invalid_start')
      case 'invalid_end_date':
        return t('setting_backup_play_history_range_invalid_end')
      case 'invalid_date_range':
        return t('setting_backup_play_history_range_invalid_order')
      default:
        return t('setting_backup_play_history_export_tip_failed')
    }
  }, [t])

  const handleChangePreset = useCallback((preset: PlayHistoryExportPreset) => {
    setDraft(prev => ({ ...prev, preset }))
  }, [])

  const handleConfirmRange = useCallback(() => {
    try {
      resolvePlayHistoryExportRange(draft)
      selectionRef.current = { ...draft }
      dialogRef.current?.setVisible(false)
      requestAnimationFrame(() => {
        choosePathRef.current?.show({
          title: t('setting_backup_play_history_export_desc'),
          dirOnly: true,
        })
      })
    } catch (error: any) {
      toast(getRangeErrorMessage(error))
    }
  }, [draft, getRangeErrorMessage, t])

  const handleConfirmPath = useCallback((path: string) => {
    handleExportPlayHistoryJson(path, selectionRef.current)
  }, [])

  return mounted
    ? (
        <>
          <Dialog ref={dialogRef} title={t('setting_backup_play_history_range_title')} bgHide={false}>
            <View style={styles.content}>
              <Text size={13} color={theme['c-font-label']} style={styles.desc}>{t('setting_backup_play_history_export_desc')}</Text>
              <View style={styles.options}>
                {(['all', 'year', 'last30Days', 'custom'] as PlayHistoryExportPreset[]).map(preset => (
                  <CheckBox
                    key={preset}
                    check={draft.preset === preset}
                    label={t(presetKeyMap[preset])}
                    onChange={() => { handleChangePreset(preset) }}
                    marginBottom={10}
                    need
                  />
                ))}
              </View>
              {draft.preset === 'custom'
                ? (
                    <View style={styles.customFields}>
                      <View style={styles.field}>
                        <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('setting_backup_play_history_range_start')}</Text>
                        <Input
                          value={draft.startDate}
                          onChangeText={(startDate) => { setDraft(prev => ({ ...prev, startDate })) }}
                          placeholder='YYYY-MM-DD'
                          clearBtn
                          size={13}
                          style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
                        />
                      </View>
                      <View style={styles.field}>
                        <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('setting_backup_play_history_range_end')}</Text>
                        <Input
                          value={draft.endDate}
                          onChangeText={(endDate) => { setDraft(prev => ({ ...prev, endDate })) }}
                          placeholder='YYYY-MM-DD'
                          clearBtn
                          size={13}
                          style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
                        />
                      </View>
                    </View>
                  )
                : null}
            </View>
            <View style={styles.btns}>
              <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={() => { dialogRef.current?.setVisible(false) }}>
                <Text size={14} color={theme['c-button-font']}>{t('cancel')}</Text>
              </Button>
              <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={handleConfirmRange}>
                <Text size={14} color={theme['c-button-font']}>{t('confirm')}</Text>
              </Button>
            </View>
          </Dialog>
          <ChoosePath ref={choosePathRef} onConfirm={handleConfirmPath} />
        </>
      )
    : null
})

const styles = createStyle({
  content: {
    paddingTop: 15,
    paddingHorizontal: 15,
    paddingBottom: 8,
  },
  desc: {
    marginBottom: 12,
  },
  options: {
    flexDirection: 'column',
  },
  customFields: {
    marginTop: 4,
  },
  field: {
    marginBottom: 10,
  },
  fieldLabel: {
    marginBottom: 6,
  },
  input: {
    borderRadius: 4,
    paddingRight: 8,
  },
  btns: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 15,
    paddingLeft: 15,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 4,
    marginRight: 15,
  },
})
