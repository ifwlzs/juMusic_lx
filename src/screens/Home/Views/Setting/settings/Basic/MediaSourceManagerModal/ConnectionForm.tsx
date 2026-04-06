import { memo, useEffect, useState } from 'react'
import { Pressable, ScrollView, TextInput, View } from 'react-native'

import Button from '../../../components/Button'
import Text from '@/components/common/Text'
import { createConnectionDraftValidationKey } from '@/core/mediaLibrary/connectionValidation'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { getOneDriveBusinessAccount, type OneDriveBusinessAccount } from '@/utils/nativeModules/oneDriveAuth'
import { createStyle } from '@/utils/tools'

export interface MediaSourceConnectionDraft {
  connectionId?: string
  providerType: LX.MediaLibrary.ProviderType
  displayName: string
  rootPathOrUri: string
  credentials: LX.MediaLibrary.ConnectionCredential
}

export const createEmptyConnectionDraft = (): MediaSourceConnectionDraft => ({
  providerType: 'local',
  displayName: '',
  rootPathOrUri: '',
  credentials: {},
})

export default memo(({
  draft,
  onSubmit,
  onValidate,
  onCancel,
}: {
  draft: MediaSourceConnectionDraft
  onSubmit: (draft: MediaSourceConnectionDraft) => void
  onValidate: (draft: MediaSourceConnectionDraft) => Promise<void>
  onCancel: () => void
}) => {
  const t = useI18n()
  const theme = useTheme()
  const [form, setForm] = useState<MediaSourceConnectionDraft>(createEmptyConnectionDraft())
  const [oneDriveAccount, setOneDriveAccount] = useState<OneDriveBusinessAccount | null>(null)
  const [validatedKey, setValidatedKey] = useState<string | null>(null)
  const [validationState, setValidationState] = useState<'idle' | 'success' | 'error'>('idle')
  const [validationMessage, setValidationMessage] = useState('')

  const updateForm = (updater: (prev: MediaSourceConnectionDraft) => MediaSourceConnectionDraft) => {
    setForm(prev => {
      const next = updater(prev)
      if (createConnectionDraftValidationKey(next) !== validatedKey) {
        setValidationState('idle')
        setValidationMessage('')
      }
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    void getOneDriveBusinessAccount().then(account => {
      if (cancelled) return
      setOneDriveAccount(account)
    }).catch(() => {
      if (!cancelled) setOneDriveAccount(null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const nextForm = {
      ...createEmptyConnectionDraft(),
      ...draft,
      credentials: {
        ...createEmptyConnectionDraft().credentials,
        ...draft.credentials,
      },
    }
    setForm(nextForm)
    setValidatedKey(draft.connectionId ? createConnectionDraftValidationKey(nextForm) : null)
    setValidationState(draft.connectionId ? 'success' : 'idle')
    setValidationMessage(draft.connectionId ? t('media_source_connection_validate_success') : '')
  }, [draft])

  useEffect(() => {
    if (form.providerType !== 'onedrive') return
    setForm(prev => {
      if (prev.providerType !== 'onedrive') return prev
      const nextCredentials = {
        ...prev.credentials,
        accountId: oneDriveAccount?.homeAccountId ?? '',
        username: oneDriveAccount?.username ?? '',
        authority: oneDriveAccount?.authority ?? '',
      }
      const nextRootPathOrUri = '/'
      if (
        prev.rootPathOrUri === nextRootPathOrUri &&
        prev.credentials.accountId === nextCredentials.accountId &&
        prev.credentials.username === nextCredentials.username &&
        prev.credentials.authority === nextCredentials.authority
      ) return prev
      return {
        ...prev,
        rootPathOrUri: nextRootPathOrUri,
        credentials: nextCredentials,
      }
    })
  }, [
    form.providerType,
    oneDriveAccount?.authority,
    oneDriveAccount?.homeAccountId,
    oneDriveAccount?.username,
  ])

  const currentValidationKey = createConnectionDraftValidationKey(form)
  const canSubmit = currentValidationKey === validatedKey
  const handleValidate = async() => {
    try {
      await onValidate(form)
      setValidatedKey(currentValidationKey)
      setValidationState('success')
      setValidationMessage(t('media_source_connection_validate_success'))
    } catch (error) {
      setValidatedKey(null)
      setValidationState('error')
      setValidationMessage(String((error as Error | undefined)?.message ?? error ?? t('media_source_action_failed')))
    }
  }
  const validationLabel = canSubmit
    ? validationMessage || t('media_source_connection_validate_success')
    : validationState === 'error'
      ? validationMessage
      : t('media_source_connection_validate_required')

  const getProviderLabel = (providerType: MediaSourceConnectionDraft['providerType']) => {
    switch (providerType) {
      case 'local':
        return t('source_real_local')
      case 'webdav':
        return t('source_real_webdav')
      case 'smb':
        return t('source_real_smb')
      case 'onedrive':
        return 'OneDrive'
      default:
        return providerType
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text>{t('source_lists_form_provider_type')}</Text>
      <View style={styles.providerRow}>
        {(['local', 'webdav', 'smb', 'onedrive'] as const).map(providerType => (
          <Pressable
            key={providerType}
            style={[
              styles.providerButton,
              {
                backgroundColor: form.providerType === providerType ? theme['c-primary-background-active'] : 'transparent',
                borderColor: form.providerType === providerType ? theme['c-primary-background-active'] : theme['c-border-background'],
              },
            ]}
            onPress={() => {
              updateForm(prev => ({ ...prev, providerType }))
            }}
          >
            <Text color={form.providerType === providerType ? theme['c-primary-font-active'] : theme['c-font']}>
              {getProviderLabel(providerType)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text>{t('source_lists_form_display_name')}</Text>
      <TextInput
        style={[
          styles.input,
          {
            color: theme['c-font'],
            backgroundColor: theme['c-primary-input-background'],
            borderColor: theme['c-border-background'],
          },
        ]}
        placeholderTextColor={theme['c-primary-dark-100-alpha-600']}
        value={form.displayName}
        onChangeText={displayName => {
          updateForm(prev => ({ ...prev, displayName }))
        }}
      />

      {form.providerType !== 'onedrive' ? (
        <>
          <Text>{t('source_lists_form_root_path_or_uri')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme['c-font'],
                backgroundColor: theme['c-primary-input-background'],
                borderColor: theme['c-border-background'],
              },
            ]}
            placeholderTextColor={theme['c-primary-dark-100-alpha-600']}
            value={form.rootPathOrUri}
            onChangeText={rootPathOrUri => {
              updateForm(prev => ({ ...prev, rootPathOrUri }))
            }}
          />
        </>
      ) : null}

      {form.providerType === 'onedrive' ? (
        <View style={styles.oneDriveInfo}>
          <Text>{t('setting_media_sources_onedrive_title')}</Text>
          <Text size={12} style={styles.validationMessage}>
            {oneDriveAccount?.username
              ? t('setting_media_sources_onedrive_signed_in', { username: oneDriveAccount.username })
              : t('setting_media_sources_onedrive_signed_out')}
          </Text>
        </View>
      ) : null}

      {form.providerType !== 'local' && form.providerType !== 'onedrive' ? (
        <>
          <Text>{t('source_lists_form_username')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme['c-font'],
                backgroundColor: theme['c-primary-input-background'],
                borderColor: theme['c-border-background'],
              },
            ]}
            placeholderTextColor={theme['c-primary-dark-100-alpha-600']}
            value={form.credentials.username ?? ''}
            onChangeText={username => {
              updateForm(prev => ({
                ...prev,
                credentials: { ...prev.credentials, username },
              }))
            }}
          />

          <Text>{t('source_lists_form_password')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme['c-font'],
                backgroundColor: theme['c-primary-input-background'],
                borderColor: theme['c-border-background'],
              },
            ]}
            placeholderTextColor={theme['c-primary-dark-100-alpha-600']}
            secureTextEntry={true}
            value={form.credentials.password ?? ''}
            onChangeText={password => {
              updateForm(prev => ({
                ...prev,
                credentials: { ...prev.credentials, password },
              }))
            }}
          />
        </>
      ) : null}

      {form.providerType === 'smb' ? (
        <>
          <Text>{t('source_lists_form_host')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme['c-font'],
                backgroundColor: theme['c-primary-input-background'],
                borderColor: theme['c-border-background'],
              },
            ]}
            placeholderTextColor={theme['c-primary-dark-100-alpha-600']}
            value={form.credentials.host ?? ''}
            onChangeText={host => {
              updateForm(prev => ({
                ...prev,
                credentials: { ...prev.credentials, host },
              }))
            }}
          />

          <Text>{t('source_lists_form_share')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme['c-font'],
                backgroundColor: theme['c-primary-input-background'],
                borderColor: theme['c-border-background'],
              },
            ]}
            placeholderTextColor={theme['c-primary-dark-100-alpha-600']}
            value={form.credentials.share ?? ''}
            onChangeText={share => {
              updateForm(prev => ({
                ...prev,
                credentials: { ...prev.credentials, share },
              }))
            }}
          />
        </>
      ) : null}

      <View style={styles.actions}>
        <Button onPress={() => { void handleValidate() }}>{t('media_source_validate_connection')}</Button>
        <Button onPress={() => { onSubmit(form) }} disabled={!canSubmit}>{t('source_lists_form_save')}</Button>
        <Button onPress={onCancel}>{t('cancel')}</Button>
      </View>
      <Text size={12} style={styles.validationMessage}>
        {validationLabel}
      </Text>
    </ScrollView>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingBottom: 24,
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 12,
  },
  providerButton: {
    marginRight: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  input: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'stretch',
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  validationMessage: {
    marginTop: 10,
  },
})
