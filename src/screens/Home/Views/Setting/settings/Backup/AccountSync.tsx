import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'

import Dialog, { type DialogType } from '@/components/common/Dialog'
import Input from '@/components/common/Input'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle, toast } from '@/utils/tools'

import Button from '../../components/Button'
import { createAccountSyncValidationKey, createEmptyAccountSyncState, normalizeAccountSyncProfile } from './accountSync'
import {
  loadAccountSyncState,
  saveAccountSyncState,
  handleDownloadAccountSync,
  handleValidateAccountSyncProfile,
  handleUploadAccountSync,
} from './actions'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const configDialogRef = useRef<DialogType>(null)
  const uploadDialogRef = useRef<DialogType>(null)

  const [state, setState] = useState(createEmptyAccountSyncState())
  const [draft, setDraft] = useState(createEmptyAccountSyncState().profile)
  const [syncPassword, setSyncPassword] = useState('')
  const [syncPasswordConfirm, setSyncPasswordConfirm] = useState('')
  const [syncActionType, setSyncActionType] = useState<'upload' | 'download'>('upload')

  const refreshState = useCallback(async() => {
    const nextState = await loadAccountSyncState()
    setState(nextState)
    setDraft(nextState.profile)
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadAccountSyncState().then(nextState => {
      if (cancelled) return
      setState(nextState)
      setDraft(nextState.profile)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const currentValidationKey = useMemo(() => {
    return createAccountSyncValidationKey(draft)
  }, [draft])
  const canSaveProfile = currentValidationKey === state.validationKey && !!state.lastValidatedAt

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return '-'
    try {
      return new Date(timestamp).toLocaleString()
    } catch {
      return '-'
    }
  }

  const openConfigDialog = useCallback(() => {
    setDraft(state.profile)
    configDialogRef.current?.setVisible(true)
  }, [state.profile])

  const requestValidate = useCallback(() => {
    const profile = normalizeAccountSyncProfile(draft)
    handleValidateAccountSyncProfile(profile)
    setTimeout(() => { void refreshState() }, 800)
  }, [draft, refreshState])

  const handleSaveProfile = useCallback(() => {
    if (!canSaveProfile) return
    void saveAccountSyncState({
      ...state,
      profile: normalizeAccountSyncProfile(draft),
      validationKey: currentValidationKey,
    }).then(next => {
      setState(next)
      configDialogRef.current?.setVisible(false)
    })
  }, [canSaveProfile, currentValidationKey, draft, state])

  const openUploadDialog = useCallback(() => {
    if (!canSaveProfile) {
      toast(t('setting_backup_account_sync_error_validation_required'))
      return
    }
    setSyncActionType('upload')
    setSyncPassword('')
    setSyncPasswordConfirm('')
    uploadDialogRef.current?.setVisible(true)
  }, [canSaveProfile, t])

  const openDownloadDialog = useCallback(() => {
    if (!canSaveProfile) {
      toast(t('setting_backup_account_sync_error_validation_required'))
      return
    }
    setSyncActionType('download')
    setSyncPassword('')
    setSyncPasswordConfirm('')
    uploadDialogRef.current?.setVisible(true)
  }, [canSaveProfile, t])

  const handleConfirmUpload = useCallback(() => {
    if (syncPassword !== syncPasswordConfirm) {
      toast(t('setting_backup_account_sync_password_confirm'))
      return
    }
    const profile = normalizeAccountSyncProfile(draft)
    if (syncActionType === 'download') {
      handleDownloadAccountSync(profile, syncPassword)
    } else {
      handleUploadAccountSync(profile, syncPassword)
    }
    uploadDialogRef.current?.setVisible(false)
    setTimeout(() => { void refreshState() }, 1200)
  }, [draft, refreshState, syncActionType, syncPassword, syncPasswordConfirm, t])

  return (
    <>
      <View style={styles.row}>
        <Button onPress={openConfigDialog}>{t('setting_backup_account_sync_config_webdav')}</Button>
        <Button onPress={openUploadDialog} disabled={!canSaveProfile}>{t('setting_backup_account_sync_upload')}</Button>
        <Button onPress={openDownloadDialog} disabled={!canSaveProfile}>{t('setting_backup_account_sync_download')}</Button>
      </View>

      <View style={styles.meta}>
        <Text size={12} color={theme['c-font-label']}>
          {t('setting_backup_account_sync_last_validated')}: {formatTime(state.lastValidatedAt)}
        </Text>
        <Text size={12} color={theme['c-font-label']} style={styles.metaLine}>
          {t('setting_backup_account_sync_last_upload')}: {formatTime(state.lastUploadAt)}
        </Text>
      </View>

      <Dialog ref={configDialogRef} title={t('setting_backup_account_sync')}>
        <View style={styles.dialogContent}>
          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('setting_backup_account_sync_profile_name')}</Text>
          <Input
            value={draft.displayName}
            onChangeText={(displayName) => { setDraft(prev => ({ ...prev, displayName })) }}
            clearBtn
            size={13}
            style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
          />

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>Server URL</Text>
          <Input
            value={draft.serverUrl}
            onChangeText={(serverUrl) => { setDraft(prev => ({ ...prev, serverUrl })) }}
            clearBtn
            size={13}
            style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
          />

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>Username</Text>
          <Input
            value={draft.username}
            onChangeText={(username) => { setDraft(prev => ({ ...prev, username })) }}
            clearBtn
            size={13}
            style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
          />

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>Password</Text>
          <Input
            value={draft.password}
            onChangeText={(password) => { setDraft(prev => ({ ...prev, password })) }}
            clearBtn
            secureTextEntry
            size={13}
            style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
          />

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>Remote Dir</Text>
          <Input
            value={draft.remoteDir}
            onChangeText={(remoteDir) => { setDraft(prev => ({ ...prev, remoteDir })) }}
            clearBtn
            size={13}
            style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
          />
        </View>

        <View style={styles.btns}>
          <Button onPress={() => { void requestValidate() }}>{t('media_source_validate_connection')}</Button>
          <Button onPress={handleSaveProfile} disabled={!canSaveProfile}>{t('source_lists_form_save')}</Button>
          <Button onPress={() => { configDialogRef.current?.setVisible(false) }}>{t('cancel')}</Button>
        </View>
      </Dialog>

      <Dialog
        ref={uploadDialogRef}
        title={syncActionType === 'download' ? t('setting_backup_account_sync_download') : t('setting_backup_account_sync_upload')}
        bgHide={false}
      >
        <View style={styles.dialogContent}>
          <Text size={13} color={theme['c-font-label']} style={styles.desc}>{t('setting_backup_account_sync_password_desc')}</Text>
          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('setting_backup_account_sync_password')}</Text>
          <Input
            value={syncPassword}
            onChangeText={setSyncPassword}
            secureTextEntry
            clearBtn
            size={13}
            style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
          />

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('setting_backup_account_sync_password_confirm')}</Text>
          <Input
            value={syncPasswordConfirm}
            onChangeText={setSyncPasswordConfirm}
            secureTextEntry
            clearBtn
            size={13}
            style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
          />
        </View>

        <View style={styles.btns}>
          <Button onPress={handleConfirmUpload}>{t('confirm')}</Button>
          <Button onPress={() => { uploadDialogRef.current?.setVisible(false) }}>{t('cancel')}</Button>
        </View>
      </Dialog>
    </>
  )
})

const styles = createStyle({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  meta: {
    marginTop: 8,
  },
  metaLine: {
    marginTop: 4,
  },
  dialogContent: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  desc: {
    marginBottom: 10,
  },
  fieldLabel: {
    marginBottom: 6,
  },
  input: {
    borderRadius: 4,
    paddingRight: 8,
    marginBottom: 12,
  },
  btns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
})

