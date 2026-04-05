import { memo, useEffect, useState } from 'react'
import { Pressable, ScrollView, TextInput, View } from 'react-native'

import Button from '../../../components/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
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
  onCancel,
}: {
  draft: MediaSourceConnectionDraft
  onSubmit: (draft: MediaSourceConnectionDraft) => void
  onCancel: () => void
}) => {
  const t = useI18n()
  const theme = useTheme()
  const [form, setForm] = useState<MediaSourceConnectionDraft>(createEmptyConnectionDraft())

  useEffect(() => {
    setForm({
      ...createEmptyConnectionDraft(),
      ...draft,
      credentials: {
        ...createEmptyConnectionDraft().credentials,
        ...draft.credentials,
      },
    })
  }, [draft])

  const getProviderLabel = (providerType: MediaSourceConnectionDraft['providerType']) => {
    switch (providerType) {
      case 'local':
        return t('source_real_local')
      case 'webdav':
        return t('source_real_webdav')
      case 'smb':
        return t('source_real_smb')
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
        {(['local', 'webdav', 'smb'] as const).map(providerType => (
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
              setForm(prev => ({ ...prev, providerType }))
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
          setForm(prev => ({ ...prev, displayName }))
        }}
      />

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
          setForm(prev => ({ ...prev, rootPathOrUri }))
        }}
      />

      {form.providerType !== 'local' ? (
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
              setForm(prev => ({
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
              setForm(prev => ({
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
              setForm(prev => ({
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
              setForm(prev => ({
                ...prev,
                credentials: { ...prev.credentials, share },
              }))
            }}
          />
        </>
      ) : null}

      <View style={styles.actions}>
        <Button onPress={() => { onSubmit(form) }}>{t('source_lists_form_save')}</Button>
        <Button onPress={onCancel}>{t('cancel')}</Button>
      </View>
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
})
