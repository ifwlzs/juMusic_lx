import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'

export interface SourceConnectionDraft {
  connectionId?: string
  providerType: 'local' | 'webdav' | 'smb'
  displayName: string
  rootPathOrUri: string
  credentials?: {
    host?: string
    share?: string
    username?: string
    password?: string
  }
}

const createEmptyDraft = (): SourceConnectionDraft => ({
  providerType: 'local',
  displayName: '',
  rootPathOrUri: '',
  credentials: {},
})

const normalizeDraft = (draft?: SourceConnectionDraft | null): SourceConnectionDraft => ({
  ...createEmptyDraft(),
  ...draft,
  credentials: {
    ...createEmptyDraft().credentials,
    ...draft?.credentials,
  },
})

export default ({ visible, draft, onSubmit, onCancel }: {
  visible: boolean
  draft?: SourceConnectionDraft | null
  onSubmit: (draft: SourceConnectionDraft) => void
  onCancel: () => void
}) => {
  const t = useI18n()
  const [form, setForm] = useState<SourceConnectionDraft>(createEmptyDraft())

  useEffect(() => {
    setForm(normalizeDraft(draft))
  }, [draft, visible])

  if (!visible) return null

  const getProviderLabel = (providerType: SourceConnectionDraft['providerType']) => {
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
    <View style={styles.container}>
      <Text>{t('source_lists_form_provider_type')}</Text>
      <View style={styles.providerRow}>
        {(['local', 'webdav', 'smb'] as const).map(providerType => (
          <Pressable
            key={providerType}
            style={[styles.providerButton, form.providerType === providerType ? styles.providerButtonActive : null]}
            onPress={() => {
              setForm(prev => ({ ...prev, providerType }))
            }}
          >
            <Text>{getProviderLabel(providerType)}</Text>
          </Pressable>
        ))}
      </View>

      <Text>{t('source_lists_form_display_name')}</Text>
      <TextInput
        style={styles.input}
        value={form.displayName}
        onChangeText={displayName => {
          setForm(prev => ({ ...prev, displayName }))
        }}
      />

      <Text>{t('source_lists_form_root_path_or_uri')}</Text>
      <TextInput
        style={styles.input}
        value={form.rootPathOrUri}
        onChangeText={rootPathOrUri => {
          setForm(prev => ({ ...prev, rootPathOrUri }))
        }}
      />

      {form.providerType !== 'local'
        ? <>
            <Text>{t('source_lists_form_username')}</Text>
            <TextInput
              style={styles.input}
              value={form.credentials?.username ?? ''}
              onChangeText={username => {
                setForm(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, username },
                }))
              }}
            />

            <Text>{t('source_lists_form_password')}</Text>
            <TextInput
              style={styles.input}
              secureTextEntry={true}
              value={form.credentials?.password ?? ''}
              onChangeText={password => {
                setForm(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, password },
                }))
              }}
            />
          </>
        : null}

      {form.providerType === 'smb'
        ? <>
            <Text>{t('source_lists_form_host')}</Text>
            <TextInput
              style={styles.input}
              value={form.credentials?.host ?? ''}
              onChangeText={host => {
                setForm(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, host },
                }))
              }}
            />

            <Text>{t('source_lists_form_share')}</Text>
            <TextInput
              style={styles.input}
              value={form.credentials?.share ?? ''}
              onChangeText={share => {
                setForm(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, share },
                }))
              }}
            />
          </>
        : null}

      <View style={styles.actionRow}>
        <Pressable style={styles.actionButton} onPress={() => { onSubmit(form) }}>
          <Text>{t('source_lists_form_save')}</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={onCancel}>
          <Text>{t('cancel')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  providerRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 12,
  },
  providerButton: {
    marginRight: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  providerButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  input: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  actionButton: {
    marginRight: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
})
